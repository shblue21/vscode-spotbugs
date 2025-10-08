import { ExtensionContext, window, Uri, workspace } from 'vscode';
import { SETTINGS_SECTION } from './constants/settings';
import { SpotbugsTreeDataProvider } from './ui/spotbugsTreeDataProvider';
import { SpotBugsCommands } from './constants/commands';
import { getJavaExtension } from './core/utils';
import { checkCode, runWorkspaceAnalysis } from './commands/analysis';
import { openBugLocation } from './commands/navigation';
import { Config } from './core/config';
import { Logger } from './core/logger';
import { defaultNotifier } from './core/notifier';
import { exportSarifReport, copyFindingAsSarif } from './commands/export';
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
      // Refresh cached configuration on settings change
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(SETTINGS_SECTION)) {
          Logger.log('SpotBugs configuration changed; reinitializing.');
          config.init();
        }
      }),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.RUN_ANALYSIS,
        async (uri: Uri | undefined) => {
          await checkCode(config, spotbugsTreeDataProvider, uri);
        }
      ),

      instrumentOperationAsVsCodeCommand(SpotBugsCommands.RUN_WORKSPACE, async () => {
        await runWorkspaceAnalysis(config, spotbugsTreeDataProvider);
      }),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.OPEN_BUG_LOCATION,
        async (bug) => {
          await openBugLocation(bug);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.EXPORT_SARIF,
        async (element?: unknown) => {
          await exportSarifReport(spotbugsTreeDataProvider, element);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.COPY_FINDING_AS_SARIF,
        async (element?: unknown) => {
          await copyFindingAsSarif(spotbugsTreeDataProvider, element);
        }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    defaultNotifier.error(`Failed to activate Spotbugs extension: ${errorMessage}`);
  }
}
