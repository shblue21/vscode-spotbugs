import type { DetectorOverrides } from '../services/pluginConfiguration';
import { Bug } from './bug';
import type { AnalysisReportSummary } from './analysisReport';

export interface AnalysisPlugin {
  path: string;
  detectors: DetectorOverrides;
}

export interface AnalysisRequestPayload {
  inputs: Array<{ kind: 'source' | 'artifact'; path: string }>;
  effort: string;
  minimumConfidence?: 'high' | 'medium' | 'low';
  targetResolutionRoots?: string[] | null;
  runtimeClasspaths?: string[] | null;
  extraAuxClasspaths?: string[] | null;
  sourcepaths?: string[] | null;
  sourceOutputs?: Record<string, string> | null;
  priorityThreshold?: number;
  includeFilterPaths?: string[];
  excludeFilterPaths?: string[];
  excludeBaselineBugsPaths?: string[];
  plugins?: AnalysisPlugin[];
  detectors?: DetectorOverrides;
  includeBaselineXml?: boolean;
}

export interface AnalysisRequest {
  targetPath: string;
  payload: AnalysisRequestPayload;
}

export interface AnalysisError {
  code?: string;
  message?: string;
}

export type AnalysisWarning = AnalysisError;

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
  missingClasses?: string[];
  results?: TBug[];
  errors?: AnalysisError[];
  warnings?: AnalysisWarning[];
  stats?: AnalysisStats;
  reportSummary?: AnalysisReportSummary;
  nativeSarif?: string;
  baselineXml?: string;
}
