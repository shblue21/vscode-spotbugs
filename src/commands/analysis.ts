import { commands, window, Uri, workspace, ProgressLocation } from 'vscode';
import { SpotbugsTreeDataProvider } from '../spotbugsTreeDataProvider';
import { BugInfo } from '../bugInfo';
import { Config } from '../config';
import { Logger } from '../logger';
import { JavaLanguageServerCommands } from '../constants/commands';
import { ensureJavaCommandsAvailable } from '../utils';
import { analyzeFile, analyzeWorkspace, getWorkspaceProjects } from '../services/analyzer';
import { TreeViewProgressReporter, WorkspaceProgressReporter } from '../services/progressReporter';
import { JavaLsClient } from '../services/javaLsClient';

export async function checkCode(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider,
  uri: Uri | undefined
): Promise<void> {
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
      window.showErrorMessage(
        'An error occurred during Spotbugs analysis. See Spotbugs output channel for details.'
      );
      spotbugsTreeDataProvider.showResults([]);
    }
  } else {
    window.showErrorMessage('No Java file selected for Spotbugs analysis.');
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
  try {
    await showBuildStart();
    const buildResult = await ensureJavaReadyAndBuild();
    handleBuildResult(buildResult);

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
    window.showErrorMessage(
      `An error occurred during workspace analysis: ${errorMessage}`
    );
  }
}

async function focusSpotbugsTree(): Promise<void> {
  await commands.executeCommand('spotbugs-view.focus');
}

async function showBuildStart(): Promise<void> {
  window.showInformationMessage('Starting Java workspace build...');
  Logger.log('Starting Java workspace build...');
}

async function ensureJavaReadyAndBuild(): Promise<number | undefined> {
  const waited = await ensureJavaCommandsAvailable([
    JavaLanguageServerCommands.BUILD_WORKSPACE,
    JavaLanguageServerCommands.GET_CLASSPATHS,
  ]);
  Logger.log(`Checked Java command availability (waited=${waited})`);
  try {
    const available = await commands.getCommands(true);
    const hasBuild = available.includes(JavaLanguageServerCommands.BUILD_WORKSPACE);
    const hasGetCp = available.includes(JavaLanguageServerCommands.GET_CLASSPATHS);
    Logger.log(`Commands available - build:${hasBuild} getClasspaths:${hasGetCp}`);
  } catch {
    // ignore
  }

  const result = await JavaLsClient.buildWorkspace('auto');
  return result;
}

function handleBuildResult(buildResult: number | undefined): void {
  if (buildResult !== 0) {
    Logger.log(
      `Java workspace build returned non-zero (${String(
        buildResult
      )}). Proceeding with best-effort analysis...`
    );
    window.showWarningMessage(
      `Java build returned ${String(
        buildResult
      )}. Continuing SpotBugs analysis with available outputs. Results may be partial.`
    );
  }
  window.showInformationMessage('Build completed successfully. Analyzing workspace...');
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
