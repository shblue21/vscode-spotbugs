import { commands, ProgressLocation, Uri, window, workspace } from 'vscode';
import { Config } from '../core/config';
import { Logger } from '../core/logger';
import { Notifier, defaultNotifier } from '../core/notifier';
import {
  analyzeFile,
  analyzeWorkspaceFromProjects,
  getWorkspaceProjects,
  NO_CLASS_TARGETS_CODE,
} from '../services/analysisService';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { buildWorkspaceAuto } from '../services/workspaceBuildService';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { Bug } from '../model/bug';

export interface RunFileAnalysisArgs {
  config: Config;
  tree: SpotBugsTreeDataProvider;
  diagnostics: SpotBugsDiagnosticsManager;
  uri?: Uri;
  notifier?: Notifier;
}

export interface RunWorkspaceAnalysisArgs {
  config: Config;
  tree: SpotBugsTreeDataProvider;
  diagnostics: SpotBugsDiagnosticsManager;
  notifier?: Notifier;
}

export async function runFileAnalysis(
  args: RunFileAnalysisArgs
): Promise<void> {
  const notifier = args.notifier ?? defaultNotifier;
  const t0 = Date.now();
  Logger.log('Command spotbugs.run triggered.');

  await focusSpotbugsTree();

  let fileUri = args.uri ?? getActiveFileUri();
  if (!fileUri) {
    notifier.error('No Java file selected for SpotBugs analysis.');
    Logger.log('No Java file selected for analysis.');
    return;
  }

  args.tree.showLoading();
  try {
    const outcome = await analyzeFile(args.config, fileUri);
    const findings = outcome.findings;
    args.tree.showResults(findings);
    args.diagnostics.updateForFile(fileUri, findings);
    for (const notice of outcome.notices ?? []) {
      if (notice.level === 'error') {
        notifier.error(notice.message);
      } else if (notice.level === 'warn') {
        notifier.warn(notice.message);
      } else {
        notifier.info(notice.message);
      }
    }
    const t1 = Date.now();
    Logger.log(
      `File analysis finished: elapsedMs=${t1 - t0}, file=${fileUri.fsPath}, findings=${findings.length}`
    );
  } catch (err) {
    Logger.error('An error occurred during SpotBugs analysis', err);
    notifier.error('An error occurred during SpotBugs analysis. See SpotBugs output channel for details.');
    args.tree.showResults([]);
    args.diagnostics.updateForFile(fileUri, []);
  }
}

export async function runWorkspaceAnalysis(
  args: RunWorkspaceAnalysisArgs
): Promise<void> {
  Logger.log('Command spotbugs.runWorkspace triggered.');
  await focusSpotbugsTree();
  const notifier = args.notifier ?? defaultNotifier;
  try {
    let aggregated: Bug[] = [];
    let projectResults: { errorCode?: string }[] = [];
    let cancelled = false;

    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'SpotBugs: Analyzing workspace',
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: 'Building Java workspace...' });
        const buildResult = await buildWorkspaceAuto();
        if (buildResult !== undefined && buildResult !== 0) {
          Logger.log(
            `Java workspace build returned non-zero (${String(
              buildResult
            )}). Proceeding with best-effort analysis...`
          );
        }

        const wsFolder = getPrimaryWorkspaceFolder();
        if (!wsFolder) {
          throw new Error('No workspace folder found.');
        }

        const projectUris = await getWorkspaceProjects(wsFolder.uri);
        args.tree.showWorkspaceProgress(projectUris);

        const res = await analyzeWorkspaceFromProjects(
          args.config,
          wsFolder.uri,
          projectUris,
          {
            onStart: (u, idx, total) => {
              progress.report({ message: `${idx}/${total} ${u}` });
              args.tree.updateProjectStatus(u, 'running');
            },
            onDone: (u, count) => args.tree.updateProjectStatus(u, 'done', { count }),
            onFail: (u, message) => args.tree.updateProjectStatus(u, 'failed', { error: message }),
          },
          token
        );
        projectResults = res.results;
        aggregated = res.results.flatMap((r) => r.findings);
        cancelled = res.cancelled === true || token.isCancellationRequested;
      }
    );

    if (cancelled) {
      return;
    }

    args.tree.showResults(aggregated);
    args.diagnostics.replaceAll(aggregated);

    const noClassTargets = projectResults.filter(
      (result) => result.errorCode === NO_CLASS_TARGETS_CODE
    );
    const allSkipped =
      projectResults.length > 0 && noClassTargets.length === projectResults.length;

    if (allSkipped) {
      notifier.warn(
        'SpotBugs could not build the project. Run a manual build, then try again.'
      );
      return;
    }

    if (noClassTargets.length > 0) {
      notifier.warn(
        `SpotBugs skipped ${noClassTargets.length} project${
          noClassTargets.length === 1 ? '' : 's'
        } because the build failed. Run a manual build, then try again.`
      );
    }

    const summary =
      aggregated.length === 0
        ? 'No issues found.'
        : `${aggregated.length} issue${aggregated.length === 1 ? '' : 's'} found.`;
    notifier.info(`SpotBugs: Workspace analysis completed - ${summary}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('An error occurred during workspace analysis', error);
    notifier.error(`SpotBugs: Workspace analysis failed — ${errorMessage}`);
  }
}

async function focusSpotbugsTree(): Promise<void> {
  await commands.executeCommand('spotbugs-view.focus');
}

function getActiveFileUri(): Uri | undefined {
  return window.activeTextEditor?.document.uri;
}

function getPrimaryWorkspaceFolder(): { uri: Uri } | undefined {
  const workspaceFolder = workspace.workspaceFolders
    ? workspace.workspaceFolders[0]
    : undefined;
  if (!workspaceFolder) {
    Logger.error('No workspace folder found.');
    return undefined;
  }
  return workspaceFolder;
}
