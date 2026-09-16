import { Uri, window, l10n } from 'vscode';
import * as path from 'path';
import { getProjectRootPaths } from '../workspace/projectDiscovery';
import { isPathInsideOrEqual } from '../workspace/pathIdentity';
import { Config } from '../core/config';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import {
  runFileAnalysis,
  runWorkspaceAnalysis as runWorkspaceAnalysisFlow,
} from '../orchestration/analysisRunner';
import { AnalysisRunCoordinator } from '../orchestration/analysisRunCoordinator';

export async function checkCode(
  config: Config,
  spotbugsTreeDataProvider: SpotBugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager,
  uri: Uri | undefined,
  coordinator: AnalysisRunCoordinator,
  kind: 'source' | 'artifact' | 'project' = 'source',
): Promise<void> {
  if (
    kind === 'source' &&
    uri &&
    ['.class', '.jar', '.zip'].includes(path.extname(uri.fsPath).toLowerCase())
  ) {
    await window.showWarningMessage(
      l10n.t('Select Java sources or use Analyze Artifacts for bytecode.'),
    );
    return;
  }
  const lease = kind === 'project' ? coordinator.begin() : undefined;
  if (kind === 'project') {
    const resource = uri ?? window.activeTextEditor?.document.uri;
    const projects = await getProjectRootPaths({
      includeWorkspaceFallback: false,
      token: lease?.token,
    });
    if (!lease?.isCurrent()) return;
    const owner = resource
      ? projects
          .filter((root) => isPathInsideOrEqual(root, resource.fsPath))
          .sort((a, b) => b.length - a.length)[0]
      : undefined;
    if (owner) uri = Uri.file(owner);
    else {
      const selected = await window.showQuickPick(
        projects.map((root) => ({
          label: path.basename(root),
          description: root,
          uri: Uri.file(root),
        })),
        { placeHolder: l10n.t('Select a Java project to analyze') },
      );
      if (!lease.isCurrent()) return;
      if (!selected) {
        spotbugsTreeDataProvider.showAnalysisFailure(
          l10n.t('Analysis cancelled'),
          'ANALYSIS_CANCELLED',
        );
        return;
      }
      uri = selected.uri;
    }
  }
  await runFileAnalysis({
    config,
    tree: spotbugsTreeDataProvider,
    diagnostics,
    coordinator,
    uri,
    analysisKind: kind,
    lease,
  });
}

export async function runWorkspaceAnalysis(
  config: Config,
  spotbugsTreeDataProvider: SpotBugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager,
  coordinator: AnalysisRunCoordinator,
): Promise<void> {
  await runWorkspaceAnalysisFlow({
    config,
    tree: spotbugsTreeDataProvider,
    diagnostics,
    coordinator,
  });
}
