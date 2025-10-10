import { SpotbugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { Logger } from '../core/logger';

export async function resetResults(
  provider: SpotbugsTreeDataProvider,
  diagnostics: SpotBugsDiagnosticsManager
): Promise<void> {
  provider.showInitialMessage();
  diagnostics.clearAll();
  Logger.log('SpotBugs results reset to initial state.');
}

