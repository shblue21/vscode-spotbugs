import { commands, ExtensionContext, window, Uri } from 'vscode';
import { SpotbugsTreeDataProvider } from './spotbugsTreeDataProvider';
import { SpotBugsCommands } from './constants/commands';
import { getJavaExtension } from './utils';
import { checkCode, runWorkspaceAnalysis } from './commands/analysis';

export async function activate(context: ExtensionContext) {
  try {
    const javaExtension = await getJavaExtension();
    if (!javaExtension) {
      window.showErrorMessage("Language Support for Java(TM) by Red Hat extension is not enabled. Please enable it for Spotbugs to work.");
      return;
    }

    const spotbugsTreeDataProvider = new SpotbugsTreeDataProvider();

    context.subscriptions.push(
      window.createTreeView('spotbugs-view', {
        treeDataProvider: spotbugsTreeDataProvider
      }),

      commands.registerCommand(SpotBugsCommands.RUN_ANALYSIS, async (uri: Uri | undefined) => {
        await checkCode(spotbugsTreeDataProvider, uri);
      }),

      commands.registerCommand(SpotBugsCommands.RUN_WORKSPACE, async () => {
        await runWorkspaceAnalysis();
      })
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    window.showErrorMessage(`Failed to activate Spotbugs extension: ${errorMessage}`);
  }
}

export function deactivate() {}