import { commands, window, Uri, workspace, extensions, ProgressLocation } from 'vscode';
import { SpotbugsTreeDataProvider } from '../spotbugsTreeDataProvider';
import { BugInfo } from '../bugInfo';
import { Config } from '../config';
import { Logger } from '../logger';
import { JavaLanguageServerCommands } from '../constants/commands';
import { analyzeFile, analyzeWorkspace, getWorkspaceProjects } from '../services/analyzer';

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
  const t0 = Date.now();
  Logger.log('Command spotbugs.runWorkspace triggered.');

  // Reveal the Spotbugs tree view to focus the panel
  await commands.executeCommand('spotbugs-view.focus');
  try {
    window.showInformationMessage('Starting Java workspace build...');
    Logger.log('Starting Java workspace build...');

    // Log Java extension presence and readiness
    const javaExt = extensions.getExtension('redhat.java');
    if (!javaExt) {
      Logger.log('Java extension redhat.java not found. Build may fail.');
    } else {
      Logger.log(
        `redhat.java present. Active=${javaExt.isActive}, Version=${(javaExt as any).packageJSON?.version ?? 'unknown'}`
      );
      if (!javaExt.isActive) {
        try {
          await javaExt.activate();
          Logger.log('Activated redhat.java extension.');
        } catch (e) {
          Logger.log(
            `Warning: Failed to activate redhat.java (${e instanceof Error ? e.message : String(e)})`
          );
        }
      }
      const api: any = javaExt.exports;
      if (api && typeof api.serverReady === 'function') {
        try {
          Logger.log('Waiting for Java Language Server to be ready...');
          await api.serverReady();
          Logger.log('Java Language Server reported ready.');
        } catch (e) {
          Logger.log(
            `Warning: serverReady() failed (${e instanceof Error ? e.message : String(e)})`
          );
        }
      }
    }

    // Check command availability
    try {
      const available = await commands.getCommands(true);
      const hasBuild = available.includes(JavaLanguageServerCommands.BUILD_WORKSPACE);
      const hasGetCp = available.includes(JavaLanguageServerCommands.GET_CLASSPATHS);
      Logger.log(`Commands available - build:${hasBuild} getClasspaths:${hasGetCp}`);
    } catch {
      // Ignore inability to list commands
    }

    const t0 = Date.now();
    let buildResult: number | undefined;
    try {
      Logger.log('Invoking java.project.build(false) - incremental build');
      buildResult = await commands.executeCommand<number>(
        JavaLanguageServerCommands.BUILD_WORKSPACE,
        false
      );
      Logger.log(`java.project.build(false) returned: ${String(buildResult)}`);
    } catch (e) {
      Logger.log(
        `Error during java.project.build(false): ${e instanceof Error ? e.message : String(e)}`
      );
    }
    if (buildResult !== 0) {
      try {
        Logger.log('Retrying with java.project.build(true) - full build');
        buildResult = await commands.executeCommand<number>(
          JavaLanguageServerCommands.BUILD_WORKSPACE,
          true
        );
        Logger.log(`java.project.build(true) returned: ${String(buildResult)}`);
      } catch (e) {
        Logger.log(
          `Error during java.project.build(true): ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    const t1 = Date.now();
    Logger.log(`Build duration: ${t1 - t0} ms`);

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
    const workspaceFolder = workspace.workspaceFolders
      ? workspace.workspaceFolders[0]
      : undefined;
    if (!workspaceFolder) {
      Logger.error('No workspace folder found.');
      window.showErrorMessage('No workspace folder found.');
      return;
    }
    // Enumerate projects via service
    const projectUris = await getWorkspaceProjects(workspaceFolder.uri);
    spotbugsTreeDataProvider.showWorkspaceProgress(projectUris);
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
          workspaceFolder.uri,
          {
            onStart: (u, idx, total) => {
              progress.report({ message: `${idx}/${total} ${u}` });
              spotbugsTreeDataProvider.updateProjectStatus(u, 'running');
            },
            onDone: (u, count) => {
              spotbugsTreeDataProvider.updateProjectStatus(u, 'done', { count });
            },
            onFail: (u, message) => {
              spotbugsTreeDataProvider.updateProjectStatus(u, 'failed', { error: message });
            },
          },
          token,
        );
        aggregated = res.results.flatMap((r) => r.findings);
      },
    );

    spotbugsTreeDataProvider.showResults(aggregated);
    const t2 = Date.now();
    Logger.log(
      `Workspace analysis finished: elapsedMs=${t2 - t0}, projects=${spotbugsTreeDataProvider ? 'multiple' : 'n/a'}, findings=${aggregated.length}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('An error occurred during workspace analysis', error);
    window.showErrorMessage(
      `An error occurred during workspace analysis: ${errorMessage}`
    );
  }
}

// Note: duplicate helpers removed; classpath/path enrichment lives in services.
