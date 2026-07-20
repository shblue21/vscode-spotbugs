import { l10n, Uri, window, workspace } from 'vscode';
import * as path from 'path';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import type { Config } from '../core/config';
import { formatAnalysisErrors } from '../model/analysisErrors';
import type { AnalysisError } from '../model/analysisProtocol';
import { validatePluginJarsPreflight } from '../services/filterFileValidation';
import {
  getPluginInventory,
  type PluginInventoryResult,
  type PluginInventoryServiceDeps,
} from '../services/pluginInventoryService';

export interface PluginInventoryView {
  showLoading(): void;
  showInventory(result: PluginInventoryResult): void;
}

export interface PluginPathConfiguration {
  target: 'global' | 'workspace';
  paths: string[];
  workspaceRoots: string[];
}

export interface PluginConfigurationDeps {
  selectPluginJars(): Thenable<readonly Uri[] | undefined>;
  readConfiguration(): PluginPathConfiguration;
  writeConfiguration(
    paths: string[],
    target: PluginPathConfiguration['target']
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
  const configuredKeys = new Set(
    state.paths.map((configuredPath) => configuredPathKey(configuredPath, state))
  );
  const additions: string[] = [];
  for (const selectedPath of selectedPaths) {
    const key = absolutePathKey(selectedPath);
    if (configuredKeys.has(key)) {
      continue;
    }
    configuredKeys.add(key);
    additions.push(pathForStorage(selectedPath, state));
  }

  if (additions.length === 0) {
    await window.showInformationMessage(
      l10n.t('The selected SpotBugs plugin JARs are already configured.')
    );
    return;
  }

  await deps.writeConfiguration([...state.paths, ...additions], state.target);
  await window.showInformationMessage(
    l10n.t(
      'Added {0} SpotBugs plugin JAR(s) to {1} settings.',
      additions.length,
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
  const selectedKey = absolutePathKey(target.pluginPath);
  const remainingPaths = state.paths.filter(
    (configuredPath) => configuredPathKey(configuredPath, state) !== selectedKey
  );
  if (remainingPaths.length === state.paths.length) {
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
    readConfiguration: readPluginPathConfiguration,
    writeConfiguration: async (paths, target) => {
      await workspace
        .getConfiguration(SETTINGS_SECTION)
        .update(settingKeys.pluginsPaths, paths, target === 'global');
    },
    validatePluginJars: (paths) =>
      validatePluginJarsPreflight({ effort: 'default', plugins: paths }),
  };
}

function readPluginPathConfiguration(): PluginPathConfiguration {
  const configuration = workspace.getConfiguration(SETTINGS_SECTION);
  const inspected = configuration.inspect<unknown>(settingKeys.pluginsPaths);
  const workspaceDefined = inspected?.workspaceValue !== undefined;
  const globalDefined = inspected?.globalValue !== undefined;
  const workspaceRoots = workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  const target =
    workspaceDefined || (!globalDefined && workspaceRoots.length > 0)
      ? 'workspace'
      : 'global';
  const value =
    target === 'workspace' ? inspected?.workspaceValue : inspected?.globalValue;

  return {
    target,
    paths: normalizedStringArray(value),
    workspaceRoots,
  };
}

function normalizedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function pathForStorage(
  absolutePath: string,
  state: PluginPathConfiguration
): string {
  if (state.target !== 'workspace' || state.workspaceRoots.length !== 1) {
    return absolutePath;
  }

  const relativePath = path.relative(state.workspaceRoots[0], absolutePath);
  if (
    relativePath === '' ||
    path.isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    return absolutePath;
  }
  return relativePath.split(path.sep).join('/');
}

function configuredPathKey(
  configuredPath: string,
  state: PluginPathConfiguration
): string {
  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(state.workspaceRoots[0] ?? process.cwd(), configuredPath);
  return absolutePathKey(absolutePath);
}

function absolutePathKey(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
