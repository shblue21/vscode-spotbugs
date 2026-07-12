import { ExtensionContext, languages, l10n, window, Uri, workspace } from 'vscode';
import { SETTINGS_SECTION, settingKeys } from './constants/settings';
import { SpotBugsTreeDataProvider } from './ui/spotbugsTreeDataProvider';
import { PluginInventoryTreeDataProvider } from './ui/pluginInventoryTreeDataProvider';
import { SpotBugsCommands } from './constants/commands';
import { getJavaExtension } from './core/utils';
import { checkCode, runWorkspaceAnalysis } from './commands/analysis';
import { revealFindingSource } from './commands/navigation';
import { Config } from './core/config';
import { Logger } from './core/logger';
import { defaultNotifier } from './core/notifier';
import { selectFindingFilter } from './commands/filter';
import { exportSarifReport } from './commands/export';
import { resetResults } from './commands/reset';
import { openSettings } from './commands/settings';
import { runEnvironmentDoctor } from './commands/environmentDoctor';
import {
  invalidatePluginInventoryRefresh,
  refreshPluginInventory,
} from './commands/pluginInventory';
import {
  clearResultsSearch,
  groupResultsBy,
  searchResults,
  sortResultsBy,
} from './commands/resultsExplorer';
import { resolveFindingCommandTarget } from './commands/findingCommandTarget';
import {
  clearInspectorBeforeOperation,
  reconcileInspectorAfterOperation,
} from './commands/findingInspectorLifecycle';
import { SpotBugsDiagnosticsManager } from './services/diagnosticsManager';
import { SpotBugsDiagnosticCodeActionProvider } from './services/spotbugsDiagnosticCodeActionProvider';
import { FindingDescriptionPanel } from './ui/findingDescriptionPanel';
import { bindFindingInspectorToTree } from './ui/findingInspectorController';
import { FindingInspectorState } from './ui/findingInspectorState';
import {
  FINDING_INSPECTOR_VIEW_ID,
  FindingInspectorViewProvider,
} from './ui/findingInspectorViewProvider';
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
    const pluginInventoryTreeDataProvider = new PluginInventoryTreeDataProvider();
    const diagnosticsManager = new SpotBugsDiagnosticsManager();
    const findingDescriptionPanel = new FindingDescriptionPanel();
    const findingInspectorState = new FindingInspectorState();
    const findingInspectorViewProvider = new FindingInspectorViewProvider(
      findingInspectorState
    );
    const diagnosticCodeActionProvider =
      new SpotBugsDiagnosticCodeActionProvider(diagnosticsManager);

    const spotbugsTreeView = window.createTreeView('spotbugs-view', {
      treeDataProvider: spotbugsTreeDataProvider,
    });
    const pluginInventoryTreeView = window.createTreeView('spotbugs-plugins-view', {
      treeDataProvider: pluginInventoryTreeDataProvider,
    });

    context.subscriptions.push(
      spotbugsTreeView,
      pluginInventoryTreeView,
      diagnosticsManager,
      findingDescriptionPanel,
      findingInspectorState,
      findingInspectorViewProvider,
      window.registerWebviewViewProvider(
        FINDING_INSPECTOR_VIEW_ID,
        findingInspectorViewProvider
      ),
      bindFindingInspectorToTree(spotbugsTreeView, findingInspectorState, {
        revealSourceOnSelection: () => config.revealSourceOnSelection,
        revealFindingSource,
      }),
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
          if (
            e.affectsConfiguration(`${SETTINGS_SECTION}.${settingKeys.pluginsPaths}`)
          ) {
            invalidatePluginInventoryRefresh();
            pluginInventoryTreeDataProvider.showInitialMessage();
          }
        }
      }),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.RUN_ANALYSIS,
        async (uri: Uri | undefined) => {
          await clearInspectorBeforeOperation(findingInspectorState, () =>
            checkCode(config, spotbugsTreeDataProvider, diagnosticsManager, uri)
          );
        }
      ),

      instrumentOperationAsVsCodeCommand(SpotBugsCommands.RUN_WORKSPACE, async () => {
        await clearInspectorBeforeOperation(findingInspectorState, () =>
          runWorkspaceAnalysis(config, spotbugsTreeDataProvider, diagnosticsManager)
        );
      }),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.REVEAL_FINDING_SOURCE,
        async (bug) => {
          const target = await resolveFindingCommandTarget(
            bug,
            findingInspectorState,
            'go to code'
          );
          if (!target) {
            return;
          }
          await revealFindingSource(target);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.OPEN_FINDING_DETAILS,
        async (bug) => {
          const target = await resolveFindingCommandTarget(
            bug,
            findingInspectorState,
            'open details'
          );
          if (!target) {
            return;
          }
          findingDescriptionPanel.show(target);
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.FILTER_RESULTS,
        async () => {
          await reconcileInspectorAfterOperation(
            findingInspectorState,
            () => selectFindingFilter(spotbugsTreeDataProvider),
            () => spotbugsTreeDataProvider.getAllFindings()
          );
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.SEARCH_RESULTS,
        async () => {
          await reconcileInspectorAfterOperation(
            findingInspectorState,
            () => searchResults(spotbugsTreeDataProvider),
            () => spotbugsTreeDataProvider.getAllFindings()
          );
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.CLEAR_SEARCH,
        async () => {
          await reconcileInspectorAfterOperation(
            findingInspectorState,
            () => clearResultsSearch(spotbugsTreeDataProvider),
            () => spotbugsTreeDataProvider.getAllFindings()
          );
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.GROUP_RESULTS_BY,
        async () => {
          await reconcileInspectorAfterOperation(
            findingInspectorState,
            () => groupResultsBy(spotbugsTreeDataProvider),
            () => spotbugsTreeDataProvider.getAllFindings()
          );
        }
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.SORT_RESULTS_BY,
        async () => {
          await reconcileInspectorAfterOperation(
            findingInspectorState,
            () => sortResultsBy(spotbugsTreeDataProvider),
            () => spotbugsTreeDataProvider.getAllFindings()
          );
        }
      ),

      instrumentOperationAsVsCodeCommand(SpotBugsCommands.OPEN_SETTINGS, openSettings),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.CHECK_ANALYSIS_ENVIRONMENT,
        async () => runEnvironmentDoctor(config)
      ),

      instrumentOperationAsVsCodeCommand(
        SpotBugsCommands.REFRESH_PLUGIN_INVENTORY,
        async (uri: Uri | undefined) => {
          await refreshPluginInventory(config, pluginInventoryTreeDataProvider, uri);
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
          await clearInspectorBeforeOperation(findingInspectorState, () =>
            resetResults(spotbugsTreeDataProvider, diagnosticsManager)
          );
        }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    defaultNotifier.error(l10n.t('Failed to activate SpotBugs extension: {0}', errorMessage));
  }
}
