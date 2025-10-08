import { window, workspace, env, Uri } from 'vscode';
import { SpotbugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { CategoryGroupItem, PatternGroupItem, BugInfoItem } from '../ui/bugTreeItem';
import { buildSarifLog } from '../services/sarifExporter';
import { BugInfo } from '../models/bugInfo';
import { Logger } from '../core/logger';
import * as path from 'path';

export async function exportSarifReport(
  provider: SpotbugsTreeDataProvider,
  element: unknown
): Promise<void> {
  const findings = resolveFindings(provider, element);
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

export async function copyFindingAsSarif(
  provider: SpotbugsTreeDataProvider,
  element: unknown
): Promise<void> {
  let findings: BugInfo[] = [];
  if (element instanceof BugInfoItem) {
    findings = provider.getFindingsForNode(element);
  }

  if (findings.length === 0) {
    await window.showWarningMessage('Select a SpotBugs finding to copy as SARIF.');
    return;
  }

  try {
    const sarifLog = buildSarifLog(findings, {
      runName: getWorkspaceName(),
    });
    const sarifJson = JSON.stringify(sarifLog, null, 2);
    await env.clipboard.writeText(sarifJson);
    Logger.log('SpotBugs SARIF copied to clipboard for 1 finding');
    await window.showInformationMessage('Copied SpotBugs finding as SARIF JSON.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error('Failed to copy SARIF finding', error);
    await window.showErrorMessage(`Failed to copy SpotBugs finding as SARIF: ${message}`);
  }
}

function resolveFindings(
  provider: SpotbugsTreeDataProvider,
  element: unknown
): BugInfo[] {
  if (element instanceof CategoryGroupItem || element instanceof PatternGroupItem || element instanceof BugInfoItem) {
    const scoped = provider.getFindingsForNode(element);
    if (scoped.length > 0) {
      return scoped;
    }
  }
  if (element && typeof (element as BugInfo)?.message === 'string') {
    return [element as BugInfo];
  }
  return provider.getAllFindings();
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

