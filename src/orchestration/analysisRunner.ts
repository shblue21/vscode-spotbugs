import { commands, l10n, ProgressLocation, window, type Uri } from 'vscode';
import { Config } from '../core/config';
import { Logger } from '../core/logger';
import { Notifier, defaultNotifier } from '../core/notifier';
import {
  analyzeFileDetailed,
  analyzeWorkspaceFromProjectsDetailed,
} from '../services/analysisService';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { buildWorkspaceAuto } from '../services/workspaceBuildService';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { getWorkspaceProjectDiscovery } from '../workspace/projectDiscovery';
import { getPrimaryWorkspaceFolder } from '../workspace/workspaceRoots';
import * as analysisRunSession from './analysisRunSession';
import { AnalysisRunCoordinator } from './analysisRunCoordinator';

export interface RunFileAnalysisArgs {
  config: Config;
  tree: SpotBugsTreeDataProvider;
  diagnostics: SpotBugsDiagnosticsManager;
  coordinator: AnalysisRunCoordinator;
  uri?: Uri;
  notifier?: Notifier;
}

export interface RunWorkspaceAnalysisArgs {
  config: Config;
  tree: SpotBugsTreeDataProvider;
  diagnostics: SpotBugsDiagnosticsManager;
  coordinator: AnalysisRunCoordinator;
  notifier?: Notifier;
}

export async function runFileAnalysis(
  args: RunFileAnalysisArgs
): Promise<void> {
  const notifier = args.notifier ?? defaultNotifier;
  const startedAtMs = Date.now();
  Logger.log('Command spotbugs.run triggered.');

  const fileUri = args.uri ?? getActiveFileUri();
  const lease = fileUri ? args.coordinator.begin() : undefined;
  await focusSpotbugsTree();

  if (!fileUri || !lease) {
    notifier.error(l10n.t('No Java file selected for SpotBugs analysis.'));
    Logger.log('No Java file selected for analysis.');
    return;
  }
  if (!lease.isCurrent()) {
    return;
  }

  await analysisRunSession.runFileAnalysisSession({
    config: args.config,
    tree: args.tree,
    diagnostics: args.diagnostics,
    notifier,
    uri: fileUri,
    startedAtMs,
    lease,
    dependencies: createAnalysisSessionDependencies(),
  });
}

export async function runWorkspaceAnalysis(
  args: RunWorkspaceAnalysisArgs
): Promise<void> {
  Logger.log('Command spotbugs.runWorkspace triggered.');
  const lease = args.coordinator.begin();
  await focusSpotbugsTree();
  if (!lease.isCurrent()) {
    return;
  }
  const notifier = args.notifier ?? defaultNotifier;
  const dependencies = createAnalysisSessionDependencies();

  await analysisRunSession.runWorkspaceAnalysisSession({
    config: args.config,
    tree: args.tree,
    diagnostics: args.diagnostics,
    notifier,
    lease,
    runWithProgress: (task) =>
      Promise.resolve(
        window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: l10n.t('SpotBugs: Analyzing workspace'),
            cancellable: true,
          },
          async (progress, token) => {
            const cancellationRegistration = token.onCancellationRequested(() =>
              lease.cancel()
            );
            try {
              if (token.isCancellationRequested) {
                lease.cancel();
              }
              await task(progress, lease.token ?? token);
            } finally {
              cancellationRegistration.dispose();
            }
          }
        )
      ),
    dependencies,
  });
}

function createAnalysisSessionDependencies(): analysisRunSession.AnalysisSessionDependencies {
  return {
    analyzeFileDetailed,
    analyzeWorkspaceFromProjectsDetailed,
    buildWorkspaceAuto,
    getPrimaryWorkspaceFolder,
    getWorkspaceProjectDiscovery,
    logger: Logger,
    now: () => Date.now(),
  };
}

async function focusSpotbugsTree(): Promise<void> {
  await commands.executeCommand('spotbugs-view.focus');
}

function getActiveFileUri(): Uri | undefined {
  return window.activeTextEditor?.document.uri;
}
