import { Bug } from './bug';

export const ANALYSIS_PROTOCOL_SCHEMA_VERSION = 2;

export interface AnalysisRequestPayload {
  schemaVersion: number;
  effort: string;
  targetResolutionRoots?: string[] | null;
  runtimeClasspaths?: string[] | null;
  extraAuxClasspaths?: string[] | null;
  sourcepaths?: string[] | null;
  priorityThreshold?: number;
  includeFilterPaths?: string[];
  excludeFilterPaths?: string[];
  excludeBaselineBugsPaths?: string[];
  // Legacy field kept for backward compatibility with older runner schema.
  excludeFilterPath?: string;
  plugins?: string[];
}

export interface AnalysisRequest {
  targetPath: string;
  payload: AnalysisRequestPayload;
}

export interface AnalysisError {
  code?: string;
  message?: string;
}

export interface AnalysisStats {
  target?: string;
  durationMs?: number;
  findingCount?: number;
  spotbugsVersion?: string;
  targetResolutionRootCount?: number;
  runtimeClasspathCount?: number;
  extraAuxClasspathCount?: number;
  auxClasspathCount?: number;
  targetCount?: number;
  pluginCount?: number;
}

export interface AnalysisResponse<TBug = Bug> {
  schemaVersion?: number;
  results?: TBug[];
  errors?: AnalysisError[];
  stats?: AnalysisStats;
}
