import {
  ANALYSIS_PROTOCOL_SCHEMA_VERSION,
  AnalysisRequestPayload,
} from '../model/analysisProtocol';
import { AnalysisSettings } from '../core/config';

export function buildAnalysisRequestPayload(
  settings: AnalysisSettings,
  options: {
    targetResolutionRoots?: string[] | null;
    runtimeClasspaths?: string[] | null;
    extraAuxClasspaths?: string[] | null;
    sourcepaths?: string[] | null;
  }
): AnalysisRequestPayload {
  const payload: AnalysisRequestPayload = {
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
  };

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
  if (settings.excludeFilterPath) {
    payload.excludeFilterPath = settings.excludeFilterPath;
  }
  if (Array.isArray(settings.plugins) && settings.plugins.length > 0) {
    payload.plugins = settings.plugins.slice();
  }

  return payload;
}
