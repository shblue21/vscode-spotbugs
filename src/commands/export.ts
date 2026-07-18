import { l10n, window, workspace, Uri } from 'vscode';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { buildSarifLog } from '../services/sarifExporter';
import { Logger } from '../core/logger';
import * as path from 'path';
import { resolveSpotBugsSelection } from '../ui/selection';
import {
  buildSpotBugsHtmlReport,
  scopeAnalysisReportRuns,
} from '../services/htmlExporter';

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

  const fileName = buildDefaultReportFileName('sarif');
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
    const workspaceRootPaths = workspace.workspaceFolders?.map(
      (folder) => folder.uri.fsPath
    );
    const sarifLog = buildSarifLog(findings, {
      runName: getWorkspaceName(),
      workspaceRootPath: workspaceRootPaths?.[0],
      workspaceRootPaths,
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

export async function exportHtmlReport(
  provider: SpotBugsTreeDataProvider,
  element: unknown
): Promise<void> {
  const findings = resolveSpotBugsSelection(provider, element);
  const cachedFindings = provider.getCachedFindings();
  const reportRuns = provider.getReportRuns();
  let selectedRuns = scopeAnalysisReportRuns(
    reportRuns,
    findings,
    element === undefined
  );

  if (findings.length === 0) {
    if (
      cachedFindings.length > 0 ||
      !reportRuns.some((run) => !run.analysisStatus)
    ) {
      await window.showInformationMessage(
        l10n.t('No SpotBugs findings available to export.')
      );
      return;
    }
    selectedRuns = reportRuns;
  } else if (selectedRuns.length === 0) {
    selectedRuns = [
      {
        projectUri: workspace.workspaceFolders?.[0]?.uri.toString() ?? 'workspace',
        findings,
      },
    ];
  }

  const fileName = buildDefaultReportFileName('html');
  const saveUri = await window.showSaveDialog({
    defaultUri: createDefaultSaveUri(fileName),
    filters: { html: ['html', 'htm'] },
    saveLabel: l10n.t('Export HTML'),
  });
  if (!saveUri) {
    return;
  }

  try {
    const html = buildSpotBugsHtmlReport(selectedRuns);
    await workspace.fs.writeFile(saveUri, Buffer.from(html, 'utf8'));
    Logger.log(
      `SpotBugs HTML export completed (${findings.length} findings) -> ${saveUri.fsPath}`
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
    Logger.error('Failed to export HTML report', error);
    await window.showErrorMessage(
      l10n.t('Failed to export SpotBugs HTML: {0}', message)
    );
  }
}

function buildDefaultReportFileName(extension: 'sarif' | 'html'): string {
  const workspaceName = getWorkspaceName();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:]/g, '-')
    .replace('T', '_')
    .split('.')[0];
  return `spotbugs-report-${workspaceName}-${timestamp}.${extension}`;
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
