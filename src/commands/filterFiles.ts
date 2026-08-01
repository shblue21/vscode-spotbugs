import { l10n, Uri, window, workspace } from 'vscode';
import * as path from 'path';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import { formatAnalysisErrors } from '../model/analysisErrors';
import type { AnalysisError } from '../model/analysisProtocol';
import type {
  FilterFileCommandTarget,
  FilterKind,
} from '../model/filterFiles';
import { validateFilterFilesPreflight } from '../services/filterFileValidation';

export interface FilterPathConfiguration {
  target: 'global' | 'workspace';
  paths: string[];
  workspaceRoots: string[];
}

export interface FilterConfigurationDeps {
  selectFilterKind(): Thenable<FilterKind | undefined>;
  selectFilterFiles(kind: FilterKind): Thenable<readonly Uri[] | undefined>;
  readConfiguration(kind: FilterKind): FilterPathConfiguration;
  writeConfiguration(
    kind: FilterKind,
    paths: string[],
    target: FilterPathConfiguration['target']
  ): Promise<void>;
  validateFilterFiles(
    kind: FilterKind,
    paths: string[]
  ): Promise<AnalysisError | undefined>;
}

type AnalysisPathKey =
  | 'includeFilterPaths'
  | 'excludeFilterPaths'
  | 'excludeBaselineBugsPaths';

const FILTER_CONFIGURATION: Record<
  FilterKind,
  readonly [string, AnalysisPathKey]
> = {
  include: [settingKeys.filtersIncludePaths, 'includeFilterPaths'],
  exclude: [settingKeys.filtersExcludePaths, 'excludeFilterPaths'],
  baseline: [
    settingKeys.filtersExcludeBaselineBugsPaths,
    'excludeBaselineBugsPaths',
  ],
};

export async function addFilterFiles(
  target?: FilterFileCommandTarget,
  deps: FilterConfigurationDeps = defaultFilterConfigurationDeps()
): Promise<void> {
  const kind = target?.filterKind ?? (await deps.selectFilterKind());
  if (!kind) {
    return;
  }

  const selected = await deps.selectFilterFiles(kind);
  if (!selected?.length) {
    return;
  }

  const selectedPaths = selected.map((uri) => path.resolve(uri.fsPath));
  const nonXmlPath = selectedPaths.find((selectedPath) => !/\.xml$/i.test(selectedPath));
  if (nonXmlPath) {
    await window.showErrorMessage(
      l10n.t(
        'Could not add SpotBugs filter files: {0} is not an XML file.',
        path.basename(nonXmlPath)
      )
    );
    return;
  }

  const validationError = await deps.validateFilterFiles(kind, selectedPaths);
  if (validationError) {
    await window.showErrorMessage(
      l10n.t(
        'Could not add SpotBugs filter files: {0}',
        formatAnalysisErrors([validationError])
      )
    );
    return;
  }

  const state = deps.readConfiguration(kind);
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
      l10n.t('The selected SpotBugs filter files are already configured.')
    );
    return;
  }

  await deps.writeConfiguration(kind, [...state.paths, ...additions], state.target);
  await window.showInformationMessage(
    l10n.t(
      'Added {0} SpotBugs filter file(s) to {1} settings.',
      additions.length,
      state.target === 'workspace' ? l10n.t('Workspace') : l10n.t('User')
    )
  );
}

export async function removeFilterFile(
  target: FilterFileCommandTarget | undefined,
  deps: FilterConfigurationDeps = defaultFilterConfigurationDeps()
): Promise<void> {
  if (!target?.filterKind || !target.filterPath) {
    await window.showInformationMessage(
      l10n.t('Select a filter file in the Filters view to remove it.')
    );
    return;
  }

  const state = deps.readConfiguration(target.filterKind);
  const selectedKey = configuredPathKey(target.filterPath, state);
  const remainingPaths = state.paths.filter(
    (configuredPath) => configuredPathKey(configuredPath, state) !== selectedKey
  );
  if (remainingPaths.length === state.paths.length) {
    await window.showInformationMessage(
      l10n.t('The filter configuration changed. Refresh the Filters view and try again.')
    );
    return;
  }

  await deps.writeConfiguration(
    target.filterKind,
    remainingPaths,
    state.target
  );
  await window.showInformationMessage(
    l10n.t('Removed SpotBugs filter file: {0}', path.basename(target.filterPath))
  );
}

function defaultFilterConfigurationDeps(): FilterConfigurationDeps {
  const xmlFilesLabel = l10n.t('XML files');
  return {
    selectFilterKind: async () => {
      const selected = await window.showQuickPick(
        [
          { label: l10n.t('Include filter'), filterKind: 'include' as const },
          { label: l10n.t('Exclude filter'), filterKind: 'exclude' as const },
          { label: l10n.t('Baseline bugs'), filterKind: 'baseline' as const },
        ],
        { placeHolder: l10n.t('Select the SpotBugs filter type') }
      );
      return selected?.filterKind;
    },
    selectFilterFiles: () =>
      window.showOpenDialog({
        title: l10n.t('Select SpotBugs XML filter files'),
        openLabel: l10n.t('Add Filters'),
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: { [xmlFilesLabel]: ['xml'] },
      }),
    readConfiguration: readFilterPathConfiguration,
    writeConfiguration: async (kind, paths, target) => {
      await workspace
        .getConfiguration(SETTINGS_SECTION)
        .update(FILTER_CONFIGURATION[kind][0], paths, target === 'global');
    },
    validateFilterFiles: (kind, paths) => {
      const analysisKey = FILTER_CONFIGURATION[kind][1];
      return validateFilterFilesPreflight({
        effort: 'default',
        [analysisKey]: paths,
      });
    },
  };
}

function readFilterPathConfiguration(kind: FilterKind): FilterPathConfiguration {
  const configuration = workspace.getConfiguration(SETTINGS_SECTION);
  const inspected = configuration.inspect<unknown>(
    FILTER_CONFIGURATION[kind][0]
  );
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
  state: FilterPathConfiguration
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
  state: FilterPathConfiguration
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
