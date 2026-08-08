import { commands, l10n, window, workspace, type TreeItem } from 'vscode';
import * as path from 'path';
import { SpotBugsCommands } from '../constants/commands';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import {
  SUPPRESSION_FALLBACK_FILE_NAME,
  SUPPRESSION_FILE_NAME,
  SuppressionFileChangedError,
  createSuppressionPlan,
  inspectManagedSuppressionFile,
  writeManagedSuppressionFile,
  type ManagedSuppressionFileState,
  type SuppressionPlan,
} from '../services/suppressionManager';
import type { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';

export interface SuppressFindingsDependencies {
  inspectFile(filePath: string): Promise<ManagedSuppressionFileState>;
  isDirty(filePath: string): boolean;
  isExcludeFilterConfigured(filePath: string, workspaceRoot: string): boolean;
  confirmPreview(plan: SuppressionPlan, filePath: string): Promise<boolean>;
  writeFile: typeof writeManagedSuppressionFile;
  ensureExcludeFilterConfigured(filePath: string, workspaceRoot: string): Promise<void>;
  notifySaved(filePath: string, addedCount: number): Promise<boolean>;
}

let suppressionInFlight = false;

export async function suppressFindings(
  provider: SpotBugsTreeDataProvider,
  element: unknown,
  deps: SuppressFindingsDependencies = defaultDependencies()
): Promise<void> {
  if (suppressionInFlight) {
    await window.showInformationMessage(
      l10n.t('A SpotBugs suppression is already in progress.')
    );
    return;
  }

  suppressionInFlight = true;
  let result: Awaited<ReturnType<typeof runSuppressFindings>>;
  try {
    result = await runSuppressFindings(provider, element, deps);
  } finally {
    suppressionInFlight = false;
  }

  if (result && (await deps.notifySaved(result.filePath, result.addedCount))) {
    await commands.executeCommand(SpotBugsCommands.RUN_WORKSPACE);
  }
}

async function runSuppressFindings(
  provider: SpotBugsTreeDataProvider,
  element: unknown,
  deps: SuppressFindingsDependencies
): Promise<{ filePath: string; addedCount: number } | undefined> {
  const workspaceRoots =
    workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  if (workspaceRoots.length !== 1) {
    await window.showInformationMessage(
      l10n.t('SpotBugs suppression requires a single-folder workspace.')
    );
    return;
  }

  const selectedFindings = provider.getFindingsForNode(element as TreeItem);
  if (selectedFindings.length === 0) {
    await window.showInformationMessage(
      l10n.t('Select a SpotBugs finding or group to suppress.')
    );
    return;
  }

  const planned = createSuppressionPlan(
    selectedFindings,
    provider.getCachedFindings()
  );
  if (!planned.ok) {
    await window.showErrorMessage(
      l10n.t(
        'Could not create a SpotBugs suppression because {0} selected finding(s) do not identify a bug pattern and class.',
        planned.unsupportedCount
      )
    );
    return;
  }

  let file: Awaited<ReturnType<typeof selectSuppressionFile>>;
  try {
    file = await selectSuppressionFile(workspaceRoots[0], deps);
  } catch (error) {
    await window.showErrorMessage(formatSuppressionFileError(error));
    return;
  }
  if (deps.isDirty(file.filePath)) {
    await window.showErrorMessage(
      l10n.t(
        'Save or close the modified suppression file before updating it: {0}',
        path.basename(file.filePath)
      )
    );
    return;
  }

  const isConfigured = deps.isExcludeFilterConfigured(
    file.filePath,
    workspaceRoots[0]
  );
  const existingBlocks = file.kind === 'managed' ? file.blocks : [];
  const selectedBlocks = new Set(planned.value.blocks);
  if (
    !isConfigured &&
    existingBlocks.some((block) => !selectedBlocks.has(block))
  ) {
    await window.showErrorMessage(
      l10n.t(
        'The inactive suppression file contains other rules and cannot be re-enabled automatically. Add it from the Filters view or remove the file first.'
      )
    );
    return;
  }

  const existingBlockSet = new Set(existingBlocks);
  const additions = planned.value.blocks.filter(
    (block) => !existingBlockSet.has(block)
  );
  if (
    (additions.length > 0 || !isConfigured) &&
    !(await deps.confirmPreview(planned.value, file.filePath))
  ) {
    return;
  }

  try {
    if (additions.length > 0) {
      await deps.writeFile(
        file.filePath,
        file.kind === 'managed' ? file.content : undefined,
        [...existingBlocks, ...additions]
      );
    }
    await deps.ensureExcludeFilterConfigured(file.filePath, workspaceRoots[0]);
  } catch (error) {
    await window.showErrorMessage(formatSuppressionFileError(error));
    return;
  }

  return { filePath: file.filePath, addedCount: additions.length };
}

async function selectSuppressionFile(
  workspaceRoot: string,
  deps: SuppressFindingsDependencies
): Promise<
  Extract<ManagedSuppressionFileState, { kind: 'missing' | 'managed' }>
> {
  const primaryPath = path.join(workspaceRoot, SUPPRESSION_FILE_NAME);
  const fallbackPath = path.join(workspaceRoot, SUPPRESSION_FALLBACK_FILE_NAME);
  const [primary, fallback] = await Promise.all([
    deps.inspectFile(primaryPath),
    deps.inspectFile(fallbackPath),
  ]);
  if (primary.kind === 'managed' && fallback.kind === 'managed') {
    throw new Error(
      l10n.t(
        'Both {0} and {1} are managed suppression files. Keep only one configured file.',
        SUPPRESSION_FILE_NAME,
        SUPPRESSION_FALLBACK_FILE_NAME
      )
    );
  }
  if (primary.kind === 'managed') {
    return primary;
  }
  if (fallback.kind === 'managed') {
    return fallback;
  }

  const invalid =
    primary.kind === 'invalid'
      ? primary
      : fallback.kind === 'invalid'
        ? fallback
        : undefined;
  if (invalid) {
    throw new Error(
      l10n.t(
        'The managed suppression file was modified or has an unsupported format: {0}',
        path.basename(invalid.filePath)
      )
    );
  }
  if (primary.kind === 'missing') {
    return primary;
  }
  if (fallback.kind !== 'missing') {
    throw new Error(
      l10n.t(
        'Cannot create a managed suppression file because both {0} and {1} already exist.',
        SUPPRESSION_FILE_NAME,
        SUPPRESSION_FALLBACK_FILE_NAME
      )
    );
  }
  return fallback;
}

function defaultDependencies(): SuppressFindingsDependencies {
  return {
    inspectFile: inspectManagedSuppressionFile,
    isDirty: (filePath) =>
      workspace.textDocuments.some(
        (document) =>
          document.isDirty &&
          document.uri.scheme === workspace.workspaceFolders?.[0]?.uri.scheme &&
          document.uri.authority === workspace.workspaceFolders?.[0]?.uri.authority &&
          absolutePathKey(document.uri.fsPath) === absolutePathKey(filePath)
      ),
    isExcludeFilterConfigured: (filePath, workspaceRoot) =>
      isExcludeFilterConfigured(
        workspace
          .getConfiguration(SETTINGS_SECTION)
          .get<unknown>(settingKeys.filtersExcludePaths),
        filePath,
        workspaceRoot
      ),
    confirmPreview: showSuppressionPreview,
    writeFile: writeManagedSuppressionFile,
    ensureExcludeFilterConfigured: ensureWorkspaceExcludeFilterConfigured,
    notifySaved: async (filePath, addedCount) => {
      const runLabel = l10n.t('Run Analysis');
      const message =
        addedCount > 0
          ? l10n.t(
              'Saved {0} SpotBugs suppression rule(s) to {1}.',
              addedCount,
              path.basename(filePath)
            )
          : l10n.t(
              'The selected SpotBugs findings are already suppressed in {0}.',
              path.basename(filePath)
            );
      return (await window.showInformationMessage(message, runLabel)) === runLabel;
    },
  };
}

async function showSuppressionPreview(
  plan: SuppressionPlan,
  filePath: string
): Promise<boolean> {
  const suppressLabel = l10n.t('Suppress');
  return (
    (await window.showWarningMessage(
      l10n.t('Create SpotBugs suppression?'),
      {
        modal: true,
        detail: [
          l10n.t('Selected findings: {0}', plan.selectedCount),
          l10n.t('Matched in current results: {0}', plan.matchedCount),
          l10n.t('Additional findings: {0}', plan.additionalCount),
          l10n.t('Suppression file: {0}', path.basename(filePath)),
        ].join('\n'),
      },
      suppressLabel
    )) === suppressLabel
  );
}

async function ensureWorkspaceExcludeFilterConfigured(
  filePath: string,
  workspaceRoot: string
): Promise<void> {
  const configuration = workspace.getConfiguration(SETTINGS_SECTION);
  const paths = configuration.get<unknown>(settingKeys.filtersExcludePaths);
  const updated = workspaceExcludePathsWithSuppression(
    paths,
    filePath,
    workspaceRoot
  );
  if (updated) {
    await configuration.update(settingKeys.filtersExcludePaths, updated, false);
  }
}

export function workspaceExcludePathsWithSuppression(
  rawPaths: unknown,
  filePath: string,
  workspaceRoot: string
): string[] | undefined {
  const paths = Array.isArray(rawPaths)
    ? rawPaths.filter((value): value is string => typeof value === 'string')
    : [];
  return isExcludeFilterConfigured(paths, filePath, workspaceRoot)
    ? undefined
    : [...paths, path.basename(filePath)];
}

export function isExcludeFilterConfigured(
  rawPaths: unknown,
  filePath: string,
  workspaceRoot: string
): boolean {
  const paths = Array.isArray(rawPaths)
    ? rawPaths.filter((value): value is string => typeof value === 'string')
    : [];
  return paths.some((configuredPath) =>
    samePath(
      path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(workspaceRoot, configuredPath.trim()),
      filePath
    )
  );
}

function samePath(left: string, right: string): boolean {
  return absolutePathKey(left) === absolutePathKey(right);
}

function absolutePathKey(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function formatSuppressionFileError(error: unknown): string {
  if (error instanceof SuppressionFileChangedError) {
    return l10n.t(
      'The suppression file changed before it could be saved. Review it and try again.'
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return l10n.t('Could not update SpotBugs suppressions: {0}', message);
}
