import { executeWorkspaceCommand } from './javaLsGateway';
import { SpotBugsLSCommands } from '../constants/commands';
import { AnalysisRequest } from '../model/analysisProtocol';

export async function runSpotBugsAnalysis(
  request: AnalysisRequest
): Promise<string | undefined> {
  return executeWorkspaceCommand<string>(
    SpotBugsLSCommands.RUN_ANALYSIS,
    request.targetPath,
    JSON.stringify(request.payload)
  );
}
