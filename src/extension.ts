import { commands, ExtensionContext, window, Uri } from 'vscode';
import { SpotbugsTreeDataProvider } from './spotbugsTreeDataProvider';
import { SpotBugsCommands } from './constants/commands';
import { getJavaExtension } from './utils';
import { checkCode, runWorkspaceAnalysis } from './commands/analysis';
import { openBugLocation } from './commands/navigation';
import { executeJavaLanguageServerCommand } from './command';
import { Config } from './config';
import { Logger } from './logger';
import {
  dispose as disposeTelemetryWrapper,
  initializeFromJsonFile,
  instrumentOperation,
  instrumentOperationAsVsCodeCommand,
} from 'vscode-extension-telemetry-wrapper';

export async function activate(context: ExtensionContext) {
  await initializeFromJsonFile(context.asAbsolutePath('./package.json'), {
    firstParty: true,
  });
  await instrumentOperation('activation', doActivate)(context);
}

export async function deactivate(): Promise<void> {
  await disposeTelemetryWrapper();
}

async function doActivate(
  _operationId: string,
  context: ExtensionContext
): Promise<void> {
  Logger.initialize();
  Logger.log('Spotbugs extension is now active.');

  try {
    await getJavaExtension();

    const config = new Config(context);

    const spotbugsTreeDataProvider = new SpotbugsTreeDataProvider();

    const spotbugsTreeView = window.createTreeView('spotbugs-view', {
      treeDataProvider: spotbugsTreeDataProvider,
    });

    context.subscriptions.push(
      spotbugsTreeView,

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.RUN_ANALYSIS,
        async (uri: Uri | undefined) => {
          await checkCode(config, spotbugsTreeDataProvider, spotbugsTreeView, uri);
        }
      ),

      instrumentOperationAsVsCodeCommand(SpotBugsCommands.RUN_WORKSPACE, async () => {
        await runWorkspaceAnalysis(config, spotbugsTreeDataProvider, spotbugsTreeView);
      }),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.OPEN_BUG_LOCATION,
        async (bug) => {
          await openBugLocation(bug);
        }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    window.showErrorMessage(`Failed to activate Spotbugs extension: ${errorMessage}`);
  }
}
