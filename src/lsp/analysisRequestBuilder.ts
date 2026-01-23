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
  if (settings.excludeFilterPath) {
    payload.excludeFilterPath = settings.excludeFilterPath;
  }
  if (Array.isArray(settings.plugins) && settings.plugins.length > 0) {
    payload.plugins = settings.plugins;
  }

  return payload;
}

