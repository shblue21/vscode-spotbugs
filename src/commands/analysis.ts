import { Uri } from 'vscode';
import { Config } from '../core/config';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import {
  runFileAnalysis,
  runWorkspaceAnalysis as runWorkspaceAnalysisFlow,
} from '../orchestration/analysisRunner';

export async function checkCode(
  config: Config,
  spotbugsTreeDataProvider: SpotBugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager,
  uri: Uri | undefined
): Promise<void> {
  await runFileAnalysis({
    config,
    tree: spotbugsTreeDataProvider,
    diagnostics,
    uri,
  });
}

export async function runWorkspaceAnalysis(
  config: Config,
  spotbugsTreeDataProvider: SpotBugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager
): Promise<void> {
  await runWorkspaceAnalysisFlow({
    config,
    tree: spotbugsTreeDataProvider,
    diagnostics,
  });
}
