import { l10n, Uri, window, workspace } from 'vscode';
import * as path from 'path';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import type { Config } from '../core/config';
import { formatAnalysisErrors } from '../model/analysisErrors';
import type { AnalysisError } from '../model/analysisProtocol';
import { validatePluginJarsPreflight } from '../services/filterFileValidation';
import {
  type PathSettingState,
  planPathAdditions,
  planPathRemoval,
  readPathSetting,
} from '../services/pathSetting';
import {
  getPluginInventory,
  type PluginInventoryResult,
  type PluginInventoryServiceDeps,
} from '../services/pluginInventoryService';

export interface PluginInventoryView {
  showLoading(): void;
  showInventory(result: PluginInventoryResult): void;
}

export interface PluginConfigurationDeps {
  selectPluginJars(): Thenable<readonly Uri[] | undefined>;
  readConfiguration(): PathSettingState;
  writeConfiguration(
    paths: string[],
    target: PathSettingState['target']
  ): Promise<void>;
  validatePluginJars(paths: string[]): Promise<AnalysisError | undefined>;
}

export interface PluginJarCommandTarget {
  pluginPath?: string;
}

let refreshGeneration = 0;

export function invalidatePluginInventoryRefresh(): void {
  refreshGeneration++;
}

export async function refreshPluginInventory(
  config: Pick<Config, 'getAnalysisSettings'>,
  view: PluginInventoryView,
  resource?: Uri,
  deps?: PluginInventoryServiceDeps
): Promise<void> {
  const generation = ++refreshGeneration;

  view.showLoading();
  const result = await getPluginInventory(config, resource, deps);
  if (generation === refreshGeneration) {
    view.showInventory(result);
  }
}

export async function addPluginJars(
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps()
): Promise<void> {
  const selected = await deps.selectPluginJars();
  if (!selected?.length) {
    return;
  }

  const selectedPaths = selected.map((uri) => path.resolve(uri.fsPath));
  const validationError = await deps.validatePluginJars(selectedPaths);
  if (validationError) {
    await window.showErrorMessage(
      l10n.t(
        'Could not add SpotBugs plugin JARs: {0}',
        formatAnalysisErrors([validationError])
      )
    );
    return;
  }

  const state = deps.readConfiguration();
  const plan = planPathAdditions(state, selectedPaths);

  if (plan.additions.length === 0) {
    await window.showInformationMessage(
      l10n.t('The selected SpotBugs plugin JARs are already configured.')
    );
    return;
  }

  await deps.writeConfiguration(plan.paths, state.target);
  await window.showInformationMessage(
    l10n.t(
      'Added {0} SpotBugs plugin JAR(s) to {1} settings.',
      plan.additions.length,
      state.target === 'workspace' ? l10n.t('Workspace') : l10n.t('User')
    )
  );
}

export async function removePluginJar(
  target: PluginJarCommandTarget | undefined,
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps()
): Promise<void> {
  if (!target?.pluginPath) {
    await window.showInformationMessage(
      l10n.t('Select a plugin in the Plugins view to remove it.')
    );
    return;
  }

  const state = deps.readConfiguration();
  const remainingPaths = planPathRemoval(state, target.pluginPath);
  if (!remainingPaths) {
    await window.showInformationMessage(
      l10n.t('The plugin configuration changed. Refresh the Plugins view and try again.')
    );
    return;
  }

  await deps.writeConfiguration(remainingPaths, state.target);
  await window.showInformationMessage(
    l10n.t('Removed SpotBugs plugin JAR: {0}', path.basename(target.pluginPath))
  );
}

function defaultPluginConfigurationDeps(): PluginConfigurationDeps {
  const jarFilesLabel = l10n.t('JAR files');
  return {
    selectPluginJars: () =>
      window.showOpenDialog({
        title: l10n.t('Select trusted SpotBugs plugin JARs'),
        openLabel: l10n.t('Add Plugins'),
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: { [jarFilesLabel]: ['jar'] },
      }),
    readConfiguration: () => readPathSetting(settingKeys.pluginsPaths),
    writeConfiguration: async (paths, target) => {
      await workspace
        .getConfiguration(SETTINGS_SECTION)
        .update(settingKeys.pluginsPaths, paths, target === 'global');
    },
    validatePluginJars: (paths) =>
      validatePluginJarsPreflight({ effort: 'default', plugins: paths }),
  };
}
