import { l10n, Uri, window, workspace } from 'vscode';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import { formatAnalysisErrors } from '../model/analysisErrors';
import type { AnalysisError } from '../model/analysisProtocol';
import { validatePluginJarsPreflight } from '../services/filterFileValidation';
import {
  type PathSettingState,
  planPathAdditions,
} from '../services/pathSetting';
import { readPluginConfiguration, type PluginConfigurationState, type PluginRegistration, parseDetectorOverrides, readScopedSetting } from '../services/pluginConfiguration';
import {
  getPluginInventory,
  type PluginInventoryResult,
  type PluginConfigurationReader,
  type PluginInventoryServiceDeps,
} from '../services/pluginInventoryService';

export interface PluginInventoryView {
  showInventory(result: PluginInventoryResult): void;
}

export interface PluginConfigurationDeps {
  selectPluginJars(): Thenable<readonly Uri[] | undefined>;
  readConfiguration(): PluginConfigurationState;
  writeConfiguration(
    registrations: PluginRegistration[],
    target: PathSettingState['target']
  ): Promise<void>;
  validatePluginJars(paths: string[]): Promise<AnalysisError | undefined>;
}

export interface PluginJarCommandTarget {
  pluginPath?: string;
  registrationId?: string;
  configurationTarget?: PathSettingState['target'];
}

let refreshGeneration = 0;
let writingConfiguration = false;
let writes: Promise<unknown> = Promise.resolve();

function updatePluginConfiguration(
  deps: PluginConfigurationDeps,
  change: (state: PluginConfigurationState) => PluginRegistration[],
): Promise<boolean> {
  const operation = writes.then(async () => {
    const state = deps.readConfiguration();
    if (state.error) throw new Error(state.error);
    const next = change(state);
    if (JSON.stringify(state.registrations) === JSON.stringify(next)) return false;
    writingConfiguration = true;
    invalidatePluginInventoryRefresh();
    try {
      await deps.writeConfiguration(next, state.target);
      return true;
    } finally {
      writingConfiguration = false;
    }
  });
  writes = operation.catch(() => undefined);
  return operation;
}

export function invalidatePluginInventoryRefresh(): void {
  refreshGeneration++;
}

export async function refreshPluginInventory(
  config: PluginConfigurationReader,
  view: PluginInventoryView,
  resource?: Uri,
  deps?: PluginInventoryServiceDeps
): Promise<void> {
  if (writingConfiguration) return;
  const generation = ++refreshGeneration;
  const plugins = config.getConfiguredPlugins(resource);
  view.showInventory({ items: plugins.map((plugin, index) => ({
    index, registrationId: plugin.id, path: plugin.resolvedPath, configuredPath: plugin.path, enabled: plugin.enabled, configurationTarget: plugin.target,
  })) });
  const configurationError = config.getPluginConfigurationError?.();
  const result = await getPluginInventory({ getConfiguredPlugins: () => plugins,
    getPluginConfigurationError: () => configurationError }, resource, deps);
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
    const plan = planPathAdditions({ ...state, paths: state.registrations.map((entry) => entry.path) }, selectedPaths);
    additions = plan.additions.length;
    targetLabel = state.target === 'workspace' ? l10n.t('Workspace') : l10n.t('User');
    return [...state.registrations, ...plan.additions.map((path) => ({ id: randomUUID(), path, enabled: true, detectors: {} }))];
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
  change: (state: PluginConfigurationState, pluginIndex: number) => PluginRegistration[],
): Promise<boolean> {
  if (!target?.registrationId) return Promise.resolve(false);
  return updatePluginConfiguration(deps, (state) => {
    const index = registrationIndex(state, target);
    if ((target.configurationTarget !== state.target)
        || index < 0) {
      void window.showInformationMessage(l10n.t(
        'The plugin configuration changed. Refresh the Plugins view and try again.',
      ));
      return state.registrations;
    }
    return change(state, index);
  });
}

function registrationIndex(state: PluginConfigurationState, target: PluginJarCommandTarget): number {
  return state.registrations.findIndex((entry) => entry.id === target.registrationId);
}

export async function removePluginJar(
  target: PluginJarCommandTarget | undefined,
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps(),
): Promise<boolean> {
  let removedPath = '';
  const changed = await updateRegisteredPlugin(target, deps, (state, pluginIndex) => {
    removedPath = state.registrations[pluginIndex].path;
    return state.registrations.filter((_entry, index) => index !== pluginIndex);
  });
  if (changed) {
    void window.showInformationMessage(l10n.t(
      'Removed SpotBugs plugin JAR: {0}', path.basename(removedPath),
    ));
  }
  return changed;
}

export function setPluginEnabled(
  target: PluginJarCommandTarget | undefined,
  enabled: boolean,
  deps: PluginConfigurationDeps = defaultPluginConfigurationDeps(),
): Promise<boolean> {
  return updateRegisteredPlugin(target, deps, (state, pluginIndex) => {
    return state.registrations.map((entry, index) =>
      index === pluginIndex ? { ...entry, enabled } : entry);
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
    writeConfiguration: async (registrations, target) => {
      await workspace
        .getConfiguration(SETTINGS_SECTION)
        .update(settingKeys.pluginsRegistrations, registrations, target === 'global');
    },
    validatePluginJars: (paths) =>
      validatePluginJarsPreflight({ effort: 'default', plugins: paths.map((path) => ({ path, detectors: {} })) }),
  };
}

export async function configureDetectors(config: PluginConfigurationReader,
  target?: PluginJarCommandTarget): Promise<boolean> {
  const core = !target?.registrationId && !target?.pluginPath;
  const state = readPluginConfiguration();
  if (state.error) throw new Error(state.error);
  const index = target ? registrationIndex(state, target) : -1;
  const registration = state.registrations[index];
  if (!core && (!registration || (target?.configurationTarget !== state.target))) return false;
  const inventory = await getPluginInventory(config);
  const scoped = readScopedSetting(settingKeys.analysisDetectors);
  const overrides = core ? parseDetectorOverrides(scoped.value) : registration!.detectors;
  const item = inventory.items.find((entry) => core ? entry.index === -1 : entry.registrationId === target?.registrationId);
  const detectors = item?.detectors ?? [];
  const classes = [...new Set([...detectors.map((entry) => entry.className), ...Object.keys(overrides)])];
  if (classes.length === 0) {
    if (item?.errorMessage) throw new Error(item.errorMessage);
    void window.showInformationMessage(l10n.t('No detectors available. Enable the plugin to inspect its detectors.'));
    return false;
  }
  const selected = await window.showQuickPick(classes.map((className) => {
    const detector = detectors.find((entry) => entry.className === className);
    return { label: className, description: overrides[className] === undefined
      ? l10n.t('Default') : overrides[className] ? l10n.t('Enabled') : l10n.t('Disabled'),
      detail: detector ? [detector.defaultEnabled ? l10n.t('Enabled by default') : l10n.t('Disabled by default'),
        detector.reports.join(', ')].filter(Boolean).join(' · ') : l10n.t('Unresolved configured detector'), className };
  }), { title: l10n.t('Configure SpotBugs detectors'), matchOnDescription: true, matchOnDetail: true });
  if (!selected) return false;
  const choice = await window.showQuickPick([
    { label: l10n.t('Default'), value: undefined },
    { label: l10n.t('Enabled'), value: true },
    { label: l10n.t('Disabled'), value: false },
  ], { title: selected.className });
  if (!choice) return false;
  const change = (previous: Record<string, boolean>) => {
    const next = { ...previous };
    if (choice.value === undefined) delete next[selected.className];
    else next[selected.className] = choice.value;
    return next;
  };
  if (core) {
    const operation = writes.then(async () => {
      const current = readScopedSetting(settingKeys.analysisDetectors);
      if (current.target !== scoped.target) throw new Error('Detector settings scope changed. Open the detector picker again.');
      await workspace.getConfiguration(SETTINGS_SECTION).update(settingKeys.analysisDetectors,
        change(parseDetectorOverrides(current.value)), current.target === 'global');
      return true;
    });
    writes = operation.catch(() => undefined);
    return operation;
  }
  return updateRegisteredPlugin(target, defaultPluginConfigurationDeps(), (current, pluginIndex) =>
    current.registrations.map((entry, index) => index === pluginIndex
      ? { ...entry, detectors: change(entry.detectors) } : entry));
}
