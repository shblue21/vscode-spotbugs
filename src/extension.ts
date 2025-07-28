import { commands, ExtensionContext, window, workspace, WorkspaceConfiguration, Uri, TreeDataProvider, TreeItem, TreeItemCollapsibleState, ProviderResult, OutputChannel } from "vscode";
import { executeJavaLanguageServerCommand } from "./command";
import { getJavaExtension } from "./utils";
import { JavaLanguageServerCommands, SpotBugsCommands } from "./constants/commands";
import { SpotbugsTreeDataProvider } from "./spotbugsTreeDataProvider";
import { BugInfo } from "./bugInfo";

export async function activate(context: ExtensionContext) {
  

  try {
    const javaExtension = await getJavaExtension();
    if (!javaExtension) {
      window.showErrorMessage("Language Support for Java(TM) by Red Hat extension is not enabled. Please enable it for Spotbugs to work.");
      return;
    }

    const spotbugsTreeDataProvider = new SpotbugsTreeDataProvider();
    window.registerTreeDataProvider('spotbugs-view', spotbugsTreeDataProvider);
    window.createTreeView('spotbugs-view', {
      treeDataProvider: spotbugsTreeDataProvider
    });
    console.log('Spotbugs view registered successfully.');

    const disposable = commands.registerCommand(SpotBugsCommands.RUN_ANALYSIS, async (uri: Uri | undefined) => {
      commands.executeCommand('spotbugs-view.focus');
      console.log('Command spotbugs.run triggered.');

      let fileUri = uri;
      if (!fileUri && window.activeTextEditor) {
        fileUri = window.activeTextEditor.document.uri;
      }

      if (fileUri) {
        // if (!fileUri.fsPath.endsWith('.java') && !fileUri.fsPath.endsWith('.class') && !fileUri.fsPath.endsWith('.jar')) {
        //   window.showWarningMessage('Please run Spotbugs on a Java file.');
        //   return;
        // }
        
        try {
          spotbugsTreeDataProvider.showLoading();
          const result = await executeJavaLanguageServerCommand<string>(SpotBugsCommands.RUN_ANALYSIS, fileUri.fsPath);
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
    });

    context.subscriptions.push(disposable);
    console.log('Command spotbugs.run registered successfully.');

   try {
      window.showInformationMessage('Starting Java workspace build...');
      const result = await commands.executeCommand(JavaLanguageServerCommands.BUILD_WORKSPACE);
      if (result === 0) {
        window.showInformationMessage('Build completed successfully.');
        commands.executeCommand(SpotBugsCommands.RUN_WORKSPACE);
      } else {
        window.showErrorMessage(`Build failed with status code: ${result}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      window.showErrorMessage(`An error occurred during build: ${errorMessage}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    window.showErrorMessage(`Failed to activate Spotbugs extension: ${errorMessage}`);
  }
}

export function deactivate() { }