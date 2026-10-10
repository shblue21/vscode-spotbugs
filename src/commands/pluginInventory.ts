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
} from '../services/pathSetting';
import { readPluginConfiguration, type PluginConfigurationState } from '../services/pluginConfiguration';
import {
  getPluginInventory,
  type PluginInventoryResult,
  type PluginInventoryServiceDeps,
} from '../services/pluginInventoryService';

export interface PluginInventoryView {
  showInventory(result: PluginInventoryResult): void;
}

export interface PluginConfigurationDeps {
  selectPluginJars(): Thenable<readonly Uri[] | undefined>;
  readConfiguration(): PluginConfigurationState;
  writeConfiguration(
    paths: string[],
    target: PathSettingState['target']
  ): Promise<void>;
  writeDisabledPaths(paths: string[], target: PathSettingState['target']): Promise<void>;
  validatePluginJars(paths: string[]): Promise<AnalysisError | undefined>;
}

export interface PluginJarCommandTarget {
  pluginPath?: string;
  configurationTarget?: PathSettingState['target'];
}

let refreshGeneration = 0;
let writingConfiguration = false;
let writes: Promise<unknown> = Promise.resolve();

function updatePluginConfiguration(
  deps: PluginConfigurationDeps,
  change: (state: PluginConfigurationState) => PluginConfigurationState,
): Promise<boolean> {
  const operation = writes.then(async () => {
    const state = deps.readConfiguration();
    const next = change(state);
    const pathsChanged = !samePaths(state.paths, next.paths);
    const disabledChanged = !samePaths(state.disabledPaths, next.disabledPaths);
    if (!pathsChanged && !disabledChanged) return false;

    writingConfiguration = true;
    invalidatePluginInventoryRefresh();
    try {
      // Remove registrations before cleanup; enable new registrations before adding them.
      const removing = next.paths.length < state.paths.length;
      if (pathsChanged && removing) await deps.writeConfiguration(next.paths, state.target);
      if (disabledChanged) await deps.writeDisabledPaths(next.disabledPaths, state.target);
      if (pathsChanged && !removing) await deps.writeConfiguration(next.paths, state.target);
      return true;
    } finally {
      writingConfiguration = false;
    }
  });
  writes = operation.catch(() => undefined);
  return operation;
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function invalidatePluginInventoryRefresh(): void {
  refreshGeneration++;
}

export async function refreshPluginInventory(
  config: Pick<Config, 'getConfiguredPlugins'>,
  view: PluginInventoryView,
  resource?: Uri,
  deps?: PluginInventoryServiceDeps
): Promise<void> {
  if (writingConfiguration) return;
  const generation = ++refreshGeneration;
  const plugins = config.getConfiguredPlugins(resource);
  view.showInventory({ items: plugins.map((plugin, index) => ({
    index, path: plugin.resolvedPath, configuredPath: plugin.path, enabled: plugin.enabled, configurationTarget: plugin.target,
  })) });
  const result = await getPluginInventory({ getConfiguredPlugins: () => plugins }, resource, deps);
  if (generation === refreshGeneration) {
    view.showInventory(result);
  }
}

export async function addPluginJars(
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps(),
): Promise<boolean> {
  const selected = await deps.selectPluginJars();
  if (!selected?.length) return false;
  const selectedPaths = selected.map((uri) => path.resolve(uri.fsPath));
  const validationError = await deps.validatePluginJars(selectedPaths);
  if (validationError) {
    void window.showErrorMessage(l10n.t(
      'Could not add SpotBugs plugin JARs: {0}', formatAnalysisErrors([validationError]),
    ));
    return false;
  }

  let additions = 0;
  let targetLabel = '';
  const changed = await updatePluginConfiguration(deps, (state) => {
    const plan = planPathAdditions(state, selectedPaths);
    additions = plan.additions.length;
    targetLabel = state.target === 'workspace' ? l10n.t('Workspace') : l10n.t('User');
    return { ...state, paths: plan.paths,
      disabledPaths: state.disabledPaths.filter((entry) => !plan.additions.includes(entry)) };
  });
  void window.showInformationMessage(changed
    ? l10n.t('Added {0} SpotBugs plugin JAR(s) to {1} settings.', additions,
      targetLabel)
    : l10n.t('The selected SpotBugs plugin JARs are already configured.'));
  return changed;
}

function updateRegisteredPlugin(
  target: PluginJarCommandTarget | undefined,
  deps: PluginConfigurationDeps,
  change: (state: PluginConfigurationState, pluginPath: string) => PluginConfigurationState,
): Promise<boolean> {
  if (!target?.pluginPath) return Promise.resolve(false);
  const pluginPath = target.pluginPath;
  return updatePluginConfiguration(deps, (state) => {
    if ((target.configurationTarget && target.configurationTarget !== state.target)
        || !state.paths.includes(pluginPath)) {
      void window.showInformationMessage(l10n.t(
        'The plugin configuration changed. Refresh the Plugins view and try again.',
      ));
      return state;
    }
    return change(state, pluginPath);
  });
}

export async function removePluginJar(
  target: PluginJarCommandTarget | undefined,
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps(),
): Promise<boolean> {
  const changed = await updateRegisteredPlugin(target, deps, (state, pluginPath) => ({
    ...state,
    paths: state.paths.filter((entry) => entry !== pluginPath),
    disabledPaths: state.disabledPaths.filter((entry) => entry !== pluginPath),
  }));
  if (changed) {
    void window.showInformationMessage(l10n.t(
      'Removed SpotBugs plugin JAR: {0}', path.basename(target!.pluginPath!),
    ));
  }
  return changed;
}

export function setPluginEnabled(
  target: PluginJarCommandTarget | undefined,
  enabled: boolean,
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps(),
): Promise<boolean> {
  return updateRegisteredPlugin(target, deps, (state, pluginPath) => {
    if (state.disabledPaths.includes(pluginPath) === !enabled) return state;
    return { ...state, disabledPaths: enabled
      ? state.disabledPaths.filter((entry) => entry !== pluginPath)
      : [...state.disabledPaths, pluginPath] };
  });
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
    readConfiguration: readPluginConfiguration,
    writeConfiguration: async (paths, target) => {
      await workspace
        .getConfiguration(SETTINGS_SECTION)
        .update(settingKeys.pluginsPaths, paths, target === 'global');
    },
    writeDisabledPaths: async (paths, target) => {
      await workspace.getConfiguration(SETTINGS_SECTION)
        .update(settingKeys.pluginsDisabledPaths, paths, target === 'global');
    },
    validatePluginJars: (paths) =>
      validatePluginJarsPreflight({ effort: 'default', plugins: paths }),
  };
}
