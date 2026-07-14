import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { Logger } from '../core/logger';
import { AnalysisRunCoordinator } from '../orchestration/analysisRunCoordinator';

export async function resetResults(
  provider: SpotBugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager,
  coordinator: AnalysisRunCoordinator
): Promise<void> {
  coordinator.invalidate();
  provider.showInitialMessage();
  diagnostics.clearAll();
  Logger.log('SpotBugs results reset to initial state.');
}
