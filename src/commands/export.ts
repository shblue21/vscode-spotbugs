import { l10n, window, workspace, Uri } from 'vscode';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { buildSarifLog } from '../services/sarifExporter';
import { Logger } from '../core/logger';
import * as path from 'path';
import { resolveSpotBugsSelection } from '../ui/selection';

export async function exportSarifReport(
  provider: SpotBugsTreeDataProvider,
  element: unknown
): Promise<void> {
  const findings = resolveSpotBugsSelection(provider, element);
  if (findings.length === 0) {
    await window.showInformationMessage(
      l10n.t('No SpotBugs findings available to export.')
    );
    return;
  }

  const fileName = buildDefaultReportFileName();
  const defaultUri = createDefaultSaveUri(fileName);
  const saveUri = await window.showSaveDialog({
    defaultUri,
    filters: { sarif: ['sarif', 'json'] },
    saveLabel: l10n.t('Export SARIF'),
  });
  if (!saveUri) {
    return;
  }

  try {
    const sarifLog = buildSarifLog(findings, {
      runName: getWorkspaceName(),
      workspaceRootPath: workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
    const sarifJson = JSON.stringify(sarifLog, null, 2);
    await workspace.fs.writeFile(saveUri, Buffer.from(sarifJson, 'utf8'));
    Logger.log(
      `SpotBugs SARIF export completed (${findings.length} findings) -> ${saveUri.fsPath}`
    );
    await window.showInformationMessage(
      findings.length === 1
        ? l10n.t('SpotBugs exported {0} finding to {1}', findings.length, saveUri.fsPath)
        : l10n.t(
            'SpotBugs exported {0} findings to {1}',
            findings.length,
            saveUri.fsPath
          )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error('Failed to export SARIF report', error);
    await window.showErrorMessage(
      l10n.t('Failed to export SpotBugs SARIF: {0}', message)
    );
  }
}

function buildDefaultReportFileName(): string {
  const workspaceName = getWorkspaceName();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:]/g, '-')
    .replace('T', '_')
    .split('.')[0];
  return `spotbugs-report-${workspaceName}-${timestamp}.sarif`;
}

function createDefaultSaveUri(fileName: string): Uri | undefined {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  const filePath = path.join(folder.uri.fsPath, fileName);
  return Uri.file(filePath);
}

function getWorkspaceName(): string {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) {
    return 'workspace';
  }
  const fsPath = folder.uri.fsPath;
  return path.basename(fsPath) || 'workspace';
}
