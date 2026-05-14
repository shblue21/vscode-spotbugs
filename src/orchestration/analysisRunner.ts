import { commands, ProgressLocation, Uri, window } from 'vscode';
import { Config } from '../core/config';
import { Logger } from '../core/logger';
import { Notifier, defaultNotifier } from '../core/notifier';
import {
  analyzeFileDetailed,
  analyzeWorkspaceFromProjectsDetailed,
} from '../services/analysisService';
import type { ProjectResult } from '../services/projectResult';
import { buildAnalysisNotices } from './analysisNotices';
import { buildWorkspaceCompletionNotices } from './workspaceSummary';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { buildWorkspaceAuto } from '../services/workspaceBuildService';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { Finding } from '../model/finding';
import { getWorkspaceProjectDiscovery } from '../workspace/projectDiscovery';
import { getPrimaryWorkspaceFolder } from '../workspace/workspaceRoots';

const ERROR_ANALYSIS_CANCELLED = 'ANALYSIS_CANCELLED';

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
    const result = await analyzeFileDetailed(args.config, fileUri);
    const outcome = result.outcome;
    const findings = outcome.findings;
    if (outcome.failure) {
      args.tree.showAnalysisFailure(outcome.failure.message, outcome.failure.code);
    } else {
      args.tree.showResults(findings);
      args.diagnostics.updateForFile(fileUri, findings);
    }
    const notices = buildAnalysisNotices(outcome, {
      includeHints: true,
      resolutionIssues: result.context.resolutionIssues,
    });
    for (const notice of notices) {
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
    const errorMessage = messageFromUnknown(err);
    const failureMessage = `SpotBugs analysis failed: ${errorMessage}`;
    Logger.error('An error occurred during SpotBugs analysis', err);
    notifier.error(failureMessage);
    args.tree.showAnalysisFailure(failureMessage, 'ANALYSIS_FAILED');
  }
}

export async function runWorkspaceAnalysis(
  args: RunWorkspaceAnalysisArgs
): Promise<void> {
  Logger.log('Command spotbugs.runWorkspace triggered.');
  await focusSpotbugsTree();
  const notifier = args.notifier ?? defaultNotifier;
  try {
    let aggregated: Finding[] = [];
    let projectResults: ProjectResult[] = [];
    let resolutionIssues: import('../lsp/javaLsOutcome').AnalysisResolutionIssue[] = [];
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
          Logger.error('No workspace folder found.');
          throw new Error('No workspace folder found.');
        }

        const discovery = await getWorkspaceProjectDiscovery(wsFolder.uri);
        args.tree.showWorkspaceProgress(discovery.projectUris);

        const res = await analyzeWorkspaceFromProjectsDetailed(
          args.config,
          wsFolder.uri,
          discovery.projectUris,
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
        resolutionIssues = [
          ...discovery.issues,
          ...res.context.resolutionIssues,
        ];
        cancelled =
          res.cancelled === true ||
          token.isCancellationRequested ||
          res.results.some(isAnalysisCancelledProjectResult);
      }
    );

    if (cancelled) {
      args.tree.showWorkspaceCancelled();
      return;
    }

    args.tree.showWorkspaceResults(projectResults);
    if (projectResults.every((result) => !result.error)) {
      args.diagnostics.replaceAll(aggregated);
    }
    const notices = buildWorkspaceCompletionNotices(
      projectResults,
      aggregated.length,
      resolutionIssues
    );
    for (const notice of notices) {
      if (notice.level === 'error') {
        notifier.error(notice.message);
      } else if (notice.level === 'warn') {
        notifier.warn(notice.message);
      } else {
        notifier.info(notice.message);
      }
    }
  } catch (error) {
    const errorMessage = messageFromUnknown(error);
    Logger.error('An error occurred during workspace analysis', error);
    notifier.error(`SpotBugs: Workspace analysis failed - ${errorMessage}`);
    args.tree.showAnalysisFailure(
      `SpotBugs workspace analysis failed: ${errorMessage}`,
      'WORKSPACE_ANALYSIS_FAILED'
    );
  }
}

async function focusSpotbugsTree(): Promise<void> {
  await commands.executeCommand('spotbugs-view.focus');
}

function getActiveFileUri(): Uri | undefined {
  return window.activeTextEditor?.document.uri;
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  const message = String(error);
  return message.trim().length > 0 ? message.trim() : 'Unknown error';
}

function isAnalysisCancelledProjectResult(result: ProjectResult): boolean {
  return result.errorCode === ERROR_ANALYSIS_CANCELLED;
}
