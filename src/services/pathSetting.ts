import * as path from 'path';
import { workspace } from 'vscode';
import { SETTINGS_SECTION } from '../constants/settings';

export interface PathSettingState {
  target: 'global' | 'workspace';
  paths: string[];
  workspaceRoots: string[];
}

export function readPathSetting(settingKey: string): PathSettingState {
  const inspected = workspace
    .getConfiguration(SETTINGS_SECTION)
    .inspect<unknown>(settingKey);
  return createPathSettingState(
    inspected,
    workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
  );
}

export function createPathSettingState(
  inspected: { globalValue?: unknown; workspaceValue?: unknown } | undefined,
  workspaceRoots: readonly string[]
): PathSettingState {
  const workspaceDefined = inspected?.workspaceValue !== undefined;
  const globalDefined = inspected?.globalValue !== undefined;
  const target =
    workspaceDefined || (!globalDefined && workspaceRoots.length > 0)
      ? 'workspace'
      : 'global';
  const value =
    target === 'workspace' ? inspected?.workspaceValue : inspected?.globalValue;

  return {
    target,
    paths: normalizedStringArray(value),
    workspaceRoots: [...workspaceRoots],
  };
}

export function planPathAdditions(
  state: PathSettingState,
  absolutePaths: readonly string[]
) {
  const configuredKeys = new Set(
    state.paths.map((configuredPath) => configuredPathKey(configuredPath, state))
  );
  const additions: string[] = [];
  for (const absolutePath of absolutePaths) {
    const key = absolutePathKey(absolutePath);
    if (configuredKeys.has(key)) {
      continue;
    }
    configuredKeys.add(key);
    additions.push(pathForStorage(absolutePath, state));
  }
  return { paths: [...state.paths, ...additions], additions };
}

export function planPathRemoval(
  state: PathSettingState,
  selectedPath: string
): string[] | undefined {
  const selectedKey = configuredPathKey(selectedPath, state);
  const paths = state.paths.filter(
    (configuredPath) => configuredPathKey(configuredPath, state) !== selectedKey
  );
  return paths.length === state.paths.length ? undefined : paths;
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

function pathForStorage(absolutePath: string, state: PathSettingState): string {
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

function configuredPathKey(configuredPath: string, state: PathSettingState): string {
  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(state.workspaceRoots[0] ?? process.cwd(), configuredPath);
  return absolutePathKey(absolutePath);
}

function absolutePathKey(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
