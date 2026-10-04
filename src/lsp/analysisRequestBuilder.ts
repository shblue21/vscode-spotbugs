import {
  ANALYSIS_PROTOCOL_SCHEMA_VERSION,
  AnalysisRequestPayload,
} from '../model/analysisProtocol';
import { AnalysisSettings } from '../core/config';

export function buildAnalysisRequestPayload(
  settings: AnalysisSettings,
  options: {
    inputs?: AnalysisRequestPayload['inputs'];
    targetResolutionRoots?: string[] | null;
    runtimeClasspaths?: string[] | null;
    extraAuxClasspaths?: string[] | null;
    sourcepaths?: string[] | null;
    sourceOutputs?: Record<string, string> | null;
    includeBaselineXml?: boolean;
  },
): AnalysisRequestPayload {
  const payload: AnalysisRequestPayload = {
    inputs: (options.inputs ?? []).map((input) => ({ ...input })),
    schemaVersion: ANALYSIS_PROTOCOL_SCHEMA_VERSION,
    effort: settings.effort,
    targetResolutionRoots: Array.isArray(options.targetResolutionRoots)
      ? options.targetResolutionRoots.slice()
      : null,
    runtimeClasspaths: Array.isArray(options.runtimeClasspaths)
      ? options.runtimeClasspaths.slice()
      : null,
    extraAuxClasspaths: Array.isArray(options.extraAuxClasspaths)
      ? options.extraAuxClasspaths.slice()
      : null,
    sourcepaths: Array.isArray(options.sourcepaths) ? options.sourcepaths.slice() : null,
    ...(options.includeBaselineXml === true ? { includeBaselineXml: true } : {}),
  };

  const confidence = settings.minimumConfidence;
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') {
    payload.minimumConfidence = confidence;
  } else if (confidence !== undefined && confidence !== null && confidence !== 'default') {
    throw new Error('Invalid spotbugs.analysis.minimumConfidence: expected default, high, medium, or low.');
  }

  if (options.sourceOutputs && Object.keys(options.sourceOutputs).length > 0) {
    payload.sourceOutputs = { ...options.sourceOutputs };
  }

  if (typeof settings.priorityThreshold === 'number') {
    payload.priorityThreshold = settings.priorityThreshold;
  }
  if (Array.isArray(settings.includeFilterPaths) && settings.includeFilterPaths.length > 0) {
    payload.includeFilterPaths = settings.includeFilterPaths.slice();
  }
  if (Array.isArray(settings.excludeFilterPaths) && settings.excludeFilterPaths.length > 0) {
    payload.excludeFilterPaths = settings.excludeFilterPaths.slice();
  }
  if (
    Array.isArray(settings.excludeBaselineBugsPaths) &&
    settings.excludeBaselineBugsPaths.length > 0
  ) {
    payload.excludeBaselineBugsPaths = settings.excludeBaselineBugsPaths.slice();
  }
  if (Array.isArray(settings.plugins) && settings.plugins.length > 0) {
    payload.plugins = settings.plugins.slice();
  }
  return payload;
}
