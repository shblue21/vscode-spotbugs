import { commands, window, Uri, workspace, ProgressLocation } from 'vscode';
import { SpotbugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { BugInfo } from '../models/bugInfo';
import { Config } from '../core/config';
import { Logger } from '../core/logger';
import { analyzeFile, analyzeWorkspaceFromProjects, getWorkspaceProjects } from '../services/analysisService';
import { TreeViewProgressReporter, WorkspaceProgressReporter } from '../services/progressReporter';
import { buildWorkspaceAuto } from '../services/workspaceBuildService';
import { defaultNotifier } from '../core/notifier';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';

export async function checkCode(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager,
  uri: Uri | undefined
): Promise<void> {
  const notifier = defaultNotifier;
  const t0 = Date.now();
  Logger.log('Command spotbugs.run triggered.');

  // Reveal the Spotbugs tree view to focus the panel
  await commands.executeCommand('spotbugs-view.focus');

  let fileUri = uri;
  if (!fileUri && window.activeTextEditor) {
    fileUri = window.activeTextEditor.document.uri;
  }

  if (fileUri) {
    spotbugsTreeDataProvider.showLoading();
    try {
      const findings = await analyzeFile(config, fileUri);
      spotbugsTreeDataProvider.showResults(findings);
      diagnostics.updateForFile(fileUri, findings);
      const t1 = Date.now();
      Logger.log(
        `File analysis finished: elapsedMs=${t1 - t0}, file=${fileUri.fsPath}, findings=${findings.length}`
      );
    } catch (err) {
      Logger.error('An error occurred during Spotbugs analysis', err);
      notifier.error('An error occurred during Spotbugs analysis. See Spotbugs output channel for details.');
      spotbugsTreeDataProvider.showResults([]);
      diagnostics.updateForFile(fileUri, []);
    }
  } else {
    notifier.error('No Java file selected for Spotbugs analysis.');
    Logger.log('No Java file selected for analysis.');
  }
}

export async function runWorkspaceAnalysis(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager
): Promise<void> {
  Logger.log('Command spotbugs.runWorkspace triggered.');
  await focusSpotbugsTree();
  const notifier = defaultNotifier;
  try {
    let aggregated: BugInfo[] = [];

    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'SpotBugs: Analyzing workspace',
        cancellable: true,
      },
      async (progress, token) => {
        // Build first (quietly) under the same progress session
        progress.report({ message: 'Building Java workspace…' });
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
        spotbugsTreeDataProvider.showWorkspaceProgress(projectUris);

        const reporter: WorkspaceProgressReporter = new TreeViewProgressReporter(
          spotbugsTreeDataProvider
        );

        const res = await analyzeWorkspaceFromProjects(
          config,
          wsFolder.uri,
          projectUris,
          {
            onStart: (u, idx, total) => {
              progress.report({ message: `${idx}/${total} ${u}` });
              reporter.onStart(u, idx, total);
            },
            onDone: (u, count) => reporter.onDone(u, count),
            onFail: (u, message) => reporter.onFail(u, message),
          },
          token,
        );
        aggregated = res.results.flatMap((r) => r.findings);
      },
    );

    spotbugsTreeDataProvider.showResults(aggregated);
    diagnostics.replaceAll(aggregated);

    // Single end summary notification (no project count)
    const summary =
      aggregated.length === 0
        ? 'No issues found.'
        : `${aggregated.length} issue${aggregated.length === 1 ? '' : 's'} found.`;
    notifier.info(`SpotBugs: Workspace analysis completed — ${summary}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('An error occurred during workspace analysis', error);
    notifier.error(`SpotBugs: Workspace analysis failed — ${errorMessage}`);
  }
}

async function focusSpotbugsTree(): Promise<void> {
  await commands.executeCommand('spotbugs-view.focus');
}

// build orchestration moved to workspaceBuildService

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


// Note: duplicate helpers removed; classpath/path resolution lives in services.
