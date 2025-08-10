import { commands, window, Uri, workspace } from 'vscode';
import { SpotbugsTreeDataProvider } from '../spotbugsTreeDataProvider';
import { BugInfo } from '../bugInfo';
import { Config } from '../config';
import { executeJavaLanguageServerCommand } from '../command';
import { JavaLanguageServerCommands, SpotBugsCommands } from '../constants/commands';

export async function checkCode(config: Config, spotbugsTreeDataProvider: SpotbugsTreeDataProvider, uri: Uri | undefined): Promise<void> {
  commands.executeCommand('spotbugs-view.focus');
  console.log('Command spotbugs.run triggered.');

  let fileUri = uri;
  if (!fileUri && window.activeTextEditor) {
    fileUri = window.activeTextEditor.document.uri;
  }

  if (fileUri) {
    spotbugsTreeDataProvider.showLoading();
    try {
      const result = await executeJavaLanguageServerCommand<string>(
        SpotBugsCommands.RUN_ANALYSIS,
        fileUri.fsPath,
        JSON.stringify(config)
      );
      if (result) {
        try {
          const bugs = JSON.parse(result) as BugInfo[];
          spotbugsTreeDataProvider.showResults(bugs);
        } catch (e) {
          window.showErrorMessage(`Failed to parse Spotbugs analysis results: ${e}`);
        }
      } else {
        spotbugsTreeDataProvider.showResults([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      window.showErrorMessage(`An error occurred during Spotbugs analysis: ${errorMessage}`);
      spotbugsTreeDataProvider.showResults([]);
    }
  } else {
    window.showErrorMessage("No Java file selected for Spotbugs analysis.");
  }
}

export async function runWorkspaceAnalysis(config: Config, spotbugsTreeDataProvider: SpotbugsTreeDataProvider): Promise<void> {
  try {
    window.showInformationMessage('Starting Java workspace build...');
    const buildResult = await commands.executeCommand<number>(JavaLanguageServerCommands.BUILD_WORKSPACE);
    if (buildResult !== 0) {
      window.showErrorMessage("Build failed. Please build project manually and then run Spotbugs analysis.");
      return;
    }

    window.showInformationMessage('Build completed successfully. Analyzing workspace...');
    const workspaceFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
    if (!workspaceFolder) {
      window.showErrorMessage("No workspace folder found.");
      return;
    }

    const classpathsResult = await commands.executeCommand<any>(JavaLanguageServerCommands.GET_CLASSPATHS, workspaceFolder.uri.toString());
    if (classpathsResult && classpathsResult.output) {
      const outputFolderUri = Uri.file(classpathsResult.output);
      // Call checkCode with the workspace output folder and config
      await checkCode(config, spotbugsTreeDataProvider, outputFolderUri);
    } else {
      window.showErrorMessage("Could not determine the output folder for the Java project.");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    window.showErrorMessage(`An error occurred during workspace analysis: ${errorMessage}`);
  }
}