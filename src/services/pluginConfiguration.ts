import { workspace } from 'vscode';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';

export type DetectorOverrides = Record<string, boolean>;
export interface PluginRegistration {
  id: string;
  path: string;
  enabled: boolean;
  detectors: DetectorOverrides;
}
export interface ConfiguredPlugin extends PluginRegistration {
  resolvedPath: string;
  target: 'global' | 'workspace';
}
export interface PluginConfigurationState {
  target: 'global' | 'workspace';
  registrations: PluginRegistration[];
  workspaceRoots: string[];
  error?: string;
}

/** Read one explicit scope. VS Code merges object settings, which is not our contract. */
export function readScopedSetting(key: string) {
  const inspected = workspace.getConfiguration(SETTINGS_SECTION).inspect<unknown>(key);
  const target = inspected?.workspaceValue !== undefined ||
    (inspected?.globalValue === undefined && !!workspace.workspaceFolders?.length)
    ? 'workspace' : 'global';
  return { target, value: target === 'workspace' ? inspected?.workspaceValue : inspected?.globalValue } as const;
}

export function parseDetectorOverrides(value: unknown): DetectorOverrides {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.entries(value).some(([key, enabled]) => !key.trim() || typeof enabled !== 'boolean')) {
    throw new Error('Detector overrides must map fully qualified class names to booleans.');
  }
  return { ...value } as DetectorOverrides;
}

export function readPluginConfiguration(): PluginConfigurationState {
  const { target, value } = readScopedSetting(settingKeys.pluginsRegistrations);
  const state: PluginConfigurationState = {
    target, registrations: [],
    workspaceRoots: workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
  };
  try {
    if (value === undefined) return state;
    if (!Array.isArray(value)) throw new Error('SpotBugs plugin registrations must be an array.');
    const ids = new Set<string>();
    state.registrations = value.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || !('id' in entry) || typeof entry.id !== 'string' || !entry.id.trim() ||
          !('path' in entry) ||
          typeof entry.path !== 'string' || !entry.path.trim() ||
          !('enabled' in entry) || typeof entry.enabled !== 'boolean') {
        throw new Error('Each SpotBugs plugin registration requires a nonempty id, path, and enabled boolean.');
      }
      if (ids.has(entry.id)) throw new Error('SpotBugs plugin registration IDs must be unique within a settings scope.');
      ids.add(entry.id);
      return { id: entry.id, path: entry.path, enabled: entry.enabled,
        detectors: parseDetectorOverrides('detectors' in entry ? entry.detectors : undefined) };
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  return state;
}

// Serialize read-modify-write operations within this extension host.
let writes: Promise<unknown> = Promise.resolve();

export async function writePluginConfiguration(
  registrations: PluginRegistration[],
  target: PluginConfigurationState['target'],
): Promise<void> {
  await workspace.getConfiguration(SETTINGS_SECTION)
    .update(settingKeys.pluginsRegistrations, registrations, target === 'global');
}

export function updatePluginConfiguration(
  deps: {
    readConfiguration(): PluginConfigurationState;
    writeConfiguration(registrations: PluginRegistration[], target: PluginConfigurationState['target']): Promise<void>;
  },
  change: (state: PluginConfigurationState) => PluginRegistration[],
): Promise<boolean> {
  const operation = writes.then(async () => {
    const state = deps.readConfiguration();
    if (state.error) throw new Error(state.error);
    const next = change(state);
    if (JSON.stringify(state.registrations) === JSON.stringify(next)) return false;
    await deps.writeConfiguration(next, state.target);
    return true;
  });
  writes = operation.catch(() => undefined);
  return operation;
}

export function updateCoreDetectors(
  target: PluginConfigurationState['target'],
  change: (previous: DetectorOverrides) => DetectorOverrides,
): Promise<boolean> {
  const operation = writes.then(async () => {
    const current = readScopedSetting(settingKeys.analysisDetectors);
    if (current.target !== target) throw new Error('Detector settings scope changed. Open the detector picker again.');
    const previous = parseDetectorOverrides(current.value);
    const next = change(previous);
    if (JSON.stringify(previous) === JSON.stringify(next)) return false;
    await workspace.getConfiguration(SETTINGS_SECTION)
      .update(settingKeys.analysisDetectors, next, current.target === 'global');
    return true;
  });
  writes = operation.catch(() => undefined);
  return operation;
}
