import { Bug } from './bug';

export interface AnalysisRequestPayload {
  schemaVersion: number;
  effort: string;
  classpaths?: string[] | null;
  sourcepaths?: string[] | null;
  priorityThreshold?: number;
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
  classpathCount?: number;
  targetCount?: number;
  pluginCount?: number;
}

export interface AnalysisResponse<TBug = Bug> {
  schemaVersion?: number;
  results?: TBug[];
  errors?: AnalysisError[];
  stats?: AnalysisStats;
}
