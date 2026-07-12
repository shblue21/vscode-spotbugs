import { QuickPickItem, l10n, window } from 'vscode';
import type { Config } from '../core/config';
import {
  EnvironmentDoctorCheck,
  EnvironmentDoctorLevel,
  inspectAnalysisEnvironment,
} from '../services/environmentDoctorService';
import { getPrimaryWorkspaceFolder } from '../workspace/workspaceRoots';

export async function runEnvironmentDoctor(config: Config): Promise<void> {
  const workspaceFolder = getPrimaryWorkspaceFolder();
  if (!workspaceFolder) {
    await window.showErrorMessage(l10n.t('Open a workspace to check SpotBugs setup.'));
    return;
  }

  try {
    const checks = await inspectAnalysisEnvironment(config, workspaceFolder);
    const errorCount = checks.filter((check) => check.level === 'error').length;
    const warningCount = checks.filter((check) => check.level === 'warning').length;
    await window.showQuickPick(checks.map(toQuickPickItem), {
      title: l10n.t('SpotBugs Analysis Environment'),
      placeHolder:
        errorCount === 0 && warningCount === 0
          ? l10n.t('No setup problems detected.')
          : l10n.t('{0} errors and {1} warnings found.', errorCount, warningCount),
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await window.showErrorMessage(
      l10n.t('Failed to check SpotBugs analysis environment: {0}', message)
    );
  }
}

function toQuickPickItem(check: EnvironmentDoctorCheck): QuickPickItem {
  return {
    label: `$(${icon(check.level)}) ${check.label}`,
    description: levelLabel(check.level),
    detail: check.detail,
  };
}

function icon(level: EnvironmentDoctorLevel): string {
  switch (level) {
    case 'pass':
      return 'pass';
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
  }
}

function levelLabel(level: EnvironmentDoctorLevel): string {
  switch (level) {
    case 'pass':
      return l10n.t('Pass');
    case 'info':
      return l10n.t('Information');
    case 'warning':
      return l10n.t('Warning');
    case 'error':
      return l10n.t('Error');
  }
}
