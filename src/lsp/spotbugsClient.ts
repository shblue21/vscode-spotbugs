import { executeJavaLanguageServerCommand } from '../core/command';
import { SpotBugsLSCommands } from '../constants/commands';
import { AnalysisRequest } from '../model/analysisProtocol';

export async function runSpotBugsAnalysis(
  request: AnalysisRequest
): Promise<string | undefined> {
  return executeJavaLanguageServerCommand<string>(
    SpotBugsLSCommands.RUN_ANALYSIS,
    request.targetPath,
    JSON.stringify(request.payload)
  );
}
