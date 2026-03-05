import { AnalysisRequestPayload } from '../model/analysisProtocol';
import { AnalysisSettings } from '../core/config';

export function buildAnalysisRequestPayload(
  settings: AnalysisSettings,
  options: {
    classpaths?: string[] | null;
    sourcepaths?: string[] | null;
  }
): AnalysisRequestPayload {
  const payload: AnalysisRequestPayload = {
    schemaVersion: 1,
    effort: settings.effort,
    classpaths: options.classpaths ?? null,
    sourcepaths: options.sourcepaths ?? null,
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
    payload.plugins = settings.plugins;
  }

  return payload;
}
