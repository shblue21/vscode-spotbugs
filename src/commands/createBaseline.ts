import { commands, l10n, window, workspace } from 'vscode';
import * as path from 'path';
import { SpotBugsCommands } from '../constants/commands';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import {
  absolutePathKey,
  planBaselineFiles,
  writeBaselineFiles,
} from '../services/baselineManager';
import type { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';

let baselineCreationInFlight = false;

export async function createBaseline(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (baselineCreationInFlight) {
    await window.showInformationMessage(
      l10n.t('SpotBugs baseline creation is already in progress.')
    );
    return;
  }

  baselineCreationInFlight = true;
  let saved: { findingCount: number; filePaths: string[] };
  try {
    const [workspaceFolder, ...otherWorkspaceFolders] = workspace.workspaceFolders ?? [];
    if (!workspaceFolder || otherWorkspaceFolders.length > 0) {
      await window.showInformationMessage(
        l10n.t('SpotBugs baseline creation requires a single-folder workspace.')
      );
      return;
    }

    const runs = provider.getReportRuns();
    const findings = runs.flatMap((run) => run.findings);
    if (
      provider.getWorkspaceResultsUri() !== workspaceFolder.uri.toString() ||
      findings.length === 0 ||
      runs.some((run) => run.analysisStatus || !run.baselineXml?.trim())
    ) {
      await window.showInformationMessage(
        l10n.t(
          'Run a complete SpotBugs workspace analysis with findings before creating a baseline.'
        )
      );
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    let filePaths: string[];
    try {
      const plans = await planBaselineFiles(
        workspaceRoot,
        runs
          .filter((run) => run.findings.length > 0)
          .map((run) => run.baselineXml!),
        workspace.textDocuments
          .filter(
            (document) =>
              document.isDirty &&
              document.uri.scheme === workspaceFolder.uri.scheme &&
              document.uri.authority === workspaceFolder.uri.authority
          )
          .map((document) => document.uri.fsPath)
      );
      const createLabel = l10n.t('Create Baseline');
      if (
        (await window.showWarningMessage(
          l10n.t('Create a SpotBugs baseline from the current workspace results?'),
          {
            modal: true,
            detail: l10n.t(
              'Findings: {0}\nBaseline file(s): {1}\nExisting baseline files will remain configured.',
              findings.length,
              plans.map((plan) => path.basename(plan.filePath)).join(', ')
            ),
          },
          createLabel
        )) !== createLabel
      ) {
        return;
      }
      await writeBaselineFiles(plans);
      filePaths = plans.map((plan) => plan.filePath);
    } catch (error) {
      await window.showErrorMessage(formatBaselineError(error));
      return;
    }
    try {
      const configuration = workspace.getConfiguration(SETTINGS_SECTION);
      const rawPaths = configuration.get<unknown>(
        settingKeys.filtersExcludeBaselineBugsPaths
      );
      const paths = Array.isArray(rawPaths)
        ? rawPaths.filter((value): value is string => typeof value === 'string')
        : [];
      const configured = new Set(
        paths.map((value) =>
          absolutePathKey(path.resolve(workspaceRoot, value.trim()))
        )
      );
      const additions = filePaths.filter(
        (filePath) => !configured.has(absolutePathKey(filePath))
      );
      if (additions.length > 0) {
        await configuration.update(
          settingKeys.filtersExcludeBaselineBugsPaths,
          [
            ...paths,
            ...additions.map((filePath) =>
              path.relative(workspaceRoot, filePath)
            ),
          ],
          false
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await window.showErrorMessage(
        l10n.t(
          'The baseline file(s) were created but could not be added to the workspace settings: {0}',
          message
        )
      );
      return;
    }

    saved = { findingCount: findings.length, filePaths };
  } finally {
    baselineCreationInFlight = false;
  }

  const runLabel = l10n.t('Run Analysis');
  if (
    (await window.showInformationMessage(
      l10n.t(
        'Created a SpotBugs baseline for {0} finding(s) in {1} file(s).',
        saved.findingCount,
        saved.filePaths.length
      ),
      runLabel
    )) === runLabel
  ) {
    await commands.executeCommand(SpotBugsCommands.RUN_WORKSPACE);
  }
}

function formatBaselineError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return l10n.t('Could not create the SpotBugs baseline: {0}', message);
}
