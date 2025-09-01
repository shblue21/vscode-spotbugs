import { commands, window, Uri, workspace, ProgressLocation } from 'vscode';
import { SpotbugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { BugInfo } from '../models/bugInfo';
import { Config } from '../core/config';
import { Logger } from '../core/logger';
import { analyzeFile, analyzeWorkspace, getWorkspaceProjects } from '../services/analyzer';
import { TreeViewProgressReporter, WorkspaceProgressReporter } from '../services/progressReporter';
import { JavaLsClient } from '../services/javaLsClient';
import { buildWorkspaceAuto } from '../services/workspaceBuildService';
import { VsCodeNotifier } from '../core/notifier';

export async function checkCode(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider,
  uri: Uri | undefined
): Promise<void> {
  const notifier = new VsCodeNotifier();
  Logger.show();
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
      const t1 = Date.now();
      Logger.log(
        `File analysis finished: elapsedMs=${t1 - t0}, file=${fileUri.fsPath}, findings=${findings.length}`
      );
    } catch (err) {
      Logger.error('An error occurred during Spotbugs analysis', err);
      notifier.error('An error occurred during Spotbugs analysis. See Spotbugs output channel for details.');
      spotbugsTreeDataProvider.showResults([]);
    }
  } else {
    notifier.error('No Java file selected for Spotbugs analysis.');
    Logger.log('No Java file selected for analysis.');
  }
}

export async function runWorkspaceAnalysis(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider
): Promise<void> {
  Logger.show();
  Logger.log('Command spotbugs.runWorkspace triggered.');
  await focusSpotbugsTree();
  const notifier = new VsCodeNotifier();
  try {
    const buildResult = await buildWorkspaceAuto(notifier);
    handleBuildResult(buildResult, notifier);

    const wsFolder = getPrimaryWorkspaceFolder();
    if (!wsFolder) return;

    const projectUris = await getWorkspaceProjects(wsFolder.uri);
    spotbugsTreeDataProvider.showWorkspaceProgress(projectUris);

    const reporter: WorkspaceProgressReporter = new TreeViewProgressReporter(
      spotbugsTreeDataProvider
    );
    const aggregated = await analyzeWorkspaceWithProgress(config, wsFolder.uri, reporter);
    spotbugsTreeDataProvider.showResults(aggregated);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('An error occurred during workspace analysis', error);
    notifier.error(`An error occurred during workspace analysis: ${errorMessage}`);
  }
}

async function focusSpotbugsTree(): Promise<void> {
  await commands.executeCommand('spotbugs-view.focus');
}

// build orchestration moved to workspaceBuildService

function handleBuildResult(buildResult: number | undefined, notifier: VsCodeNotifier): void {
  if (buildResult !== 0) {
    Logger.log(
      `Java workspace build returned non-zero (${String(
        buildResult
      )}). Proceeding with best-effort analysis...`
    );
    notifier.warn(`Java build returned ${String(buildResult)}. Continuing SpotBugs analysis with available outputs. Results may be partial.`);
  }
  notifier.info('Build completed successfully. Analyzing workspace...');
  Logger.log('Build completed successfully. Analyzing workspace...');
}

function getPrimaryWorkspaceFolder(): { uri: Uri } | undefined {
  const workspaceFolder = workspace.workspaceFolders
    ? workspace.workspaceFolders[0]
    : undefined;
  if (!workspaceFolder) {
    Logger.error('No workspace folder found.');
    window.showErrorMessage('No workspace folder found.');
    return undefined;
  }
  return workspaceFolder;
}

async function analyzeWorkspaceWithProgress(
  config: Config,
  workspaceFolderUri: Uri,
  reporter: WorkspaceProgressReporter,
): Promise<BugInfo[]> {
  let aggregated: BugInfo[] = [];
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'SpotBugs: Analyzing workspace',
      cancellable: true,
    },
    async (progress, token) => {
      const res = await analyzeWorkspace(
        config,
        workspaceFolderUri,
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
  return aggregated;
}

// Note: duplicate helpers removed; classpath/path enrichment lives in services.
