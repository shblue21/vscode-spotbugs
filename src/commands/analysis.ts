import { Uri } from 'vscode';
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
  coordinator: AnalysisRunCoordinator
): Promise<void> {
  await runFileAnalysis({
    config,
    tree: spotbugsTreeDataProvider,
    diagnostics,
    coordinator,
    uri,
  });
}

export async function runWorkspaceAnalysis(
  config: Config,
  spotbugsTreeDataProvider: SpotBugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager,
  coordinator: AnalysisRunCoordinator
): Promise<void> {
  await runWorkspaceAnalysisFlow({
    config,
    tree: spotbugsTreeDataProvider,
    diagnostics,
    coordinator,
  });
}
