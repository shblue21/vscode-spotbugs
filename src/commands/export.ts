import { window, workspace, Uri } from 'vscode';
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
    await window.showInformationMessage('No SpotBugs findings available to export.');
    return;
  }

  const fileName = buildDefaultReportFileName();
  const defaultUri = createDefaultSaveUri(fileName);
  const saveUri = await window.showSaveDialog({
    defaultUri,
    filters: { SARIF: ['sarif', 'json'] },
    saveLabel: 'Export SARIF',
  });
  if (!saveUri) {
    return;
  }

  try {
    const sarifLog = buildSarifLog(findings, {
      runName: getWorkspaceName(),
    });
    const sarifJson = JSON.stringify(sarifLog, null, 2);
    await workspace.fs.writeFile(saveUri, Buffer.from(sarifJson, 'utf8'));
    Logger.log(
      `SpotBugs SARIF export completed (${findings.length} findings) -> ${saveUri.fsPath}`
    );
    await window.showInformationMessage(
      `SpotBugs exported ${findings.length} finding${findings.length === 1 ? '' : 's'} to ${saveUri.fsPath}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error('Failed to export SARIF report', error);
    await window.showErrorMessage(`Failed to export SpotBugs SARIF: ${message}`);
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
