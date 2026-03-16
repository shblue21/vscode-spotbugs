import { ExtensionContext, languages, window, Uri, workspace } from 'vscode';
import { SETTINGS_SECTION } from './constants/settings';
import { SpotBugsTreeDataProvider } from './ui/spotbugsTreeDataProvider';
import { SpotBugsCommands } from './constants/commands';
import { getJavaExtension } from './core/utils';
import { checkCode, runWorkspaceAnalysis } from './commands/analysis';
import { openBugLocation } from './commands/navigation';
import { Config } from './core/config';
import { Logger } from './core/logger';
import { defaultNotifier } from './core/notifier';
import { selectFindingFilter } from './commands/filter';
import { exportSarifReport } from './commands/export';
import { resetResults } from './commands/reset';
import { Finding } from './model/finding';
import { SpotBugsDiagnosticsManager } from './services/diagnosticsManager';
import { SpotBugsDiagnosticCodeActionProvider } from './services/spotbugsDiagnosticCodeActionProvider';
import { FindingDescriptionPanel } from './ui/findingDescriptionPanel';
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
  Logger.log('SpotBugs extension is now active.');

  try {
    await getJavaExtension();

    const config = new Config(context);

    const spotbugsTreeDataProvider = new SpotBugsTreeDataProvider();
    const diagnosticsManager = new SpotBugsDiagnosticsManager();
    const findingDescriptionPanel = new FindingDescriptionPanel();
    const diagnosticCodeActionProvider =
      new SpotBugsDiagnosticCodeActionProvider(diagnosticsManager);

    const spotbugsTreeView = window.createTreeView('spotbugs-view', {
      treeDataProvider: spotbugsTreeDataProvider,
    });

    context.subscriptions.push(
      spotbugsTreeView,
      diagnosticsManager,
      findingDescriptionPanel,
      languages.registerCodeActionsProvider(
        { language: 'java' },
        diagnosticCodeActionProvider,
        {
          providedCodeActionKinds:
            SpotBugsDiagnosticCodeActionProvider.providedCodeActionKinds,
        }
      ),
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
          await checkCode(config, spotbugsTreeDataProvider, diagnosticsManager, uri);
        }
      ),

      instrumentOperationAsVsCodeCommand(SpotBugsCommands.RUN_WORKSPACE, async () => {
        await runWorkspaceAnalysis(config, spotbugsTreeDataProvider, diagnosticsManager);
      }),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.OPEN_BUG_LOCATION,
        async (bug) => {
          if (!isFindingPayload(bug)) {
            return;
          }
          await openBugLocation(bug);
          findingDescriptionPanel.show(bug);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.FILTER_RESULTS,
        async () => {
          await selectFindingFilter(spotbugsTreeDataProvider);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.EXPORT_SARIF,
        async (element?: unknown) => {
          await exportSarifReport(spotbugsTreeDataProvider, element);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.RESET_RESULTS,
        async () => {
          await resetResults(spotbugsTreeDataProvider, diagnosticsManager);
        }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    defaultNotifier.error(`Failed to activate SpotBugs extension: ${errorMessage}`);
  }
}

function isFindingPayload(value: unknown): value is Finding {
  return value !== null && typeof value === 'object' && 'location' in value;
}
