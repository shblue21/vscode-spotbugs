import type { CancellationToken } from 'vscode';
import { executeWorkspaceCommand } from './javaLsGateway';
import { SpotBugsLSCommands } from '../constants/commands';
import { AnalysisRequest } from '../model/analysisProtocol';

export async function runSpotBugsAnalysis(
  request: AnalysisRequest,
  token?: CancellationToken
): Promise<string | undefined> {
  const inputs = request.payload.inputs;
  const kind = inputs?.[0]?.kind;
  if (!Array.isArray(inputs) || inputs.length === 0
      || (kind !== 'source' && kind !== 'artifact')
      || inputs.some((input) => input?.kind !== kind)) {
    throw new Error('Analysis requires non-empty inputs of one kind; mixed inputs cannot be split automatically.');
  }
  return executeWorkspaceCommand<string>(
    kind === 'source' ? SpotBugsLSCommands.ANALYZE_SOURCES : SpotBugsLSCommands.ANALYZE_ARTIFACTS,
    request.targetPath,
    JSON.stringify(request.payload),
    ...(token ? [token] : [])
  );
}
