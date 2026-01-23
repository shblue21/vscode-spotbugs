import { Finding } from './finding';
import { AnalysisError, AnalysisStats } from './analysisProtocol';

export type AnalysisNoticeLevel = 'info' | 'warn' | 'error';

export interface AnalysisNotice {
  level: AnalysisNoticeLevel;
  code?: string;
  message: string;
}

export type AnalysisFailureKind = 'target' | 'invalid-json' | 'analysis-error';

export interface AnalysisFailure {
  kind: AnalysisFailureKind;
  level: AnalysisNoticeLevel;
  message: string;
  code?: string;
}

export interface AnalysisOutcome {
  findings: Finding[];
  errors?: AnalysisError[];
  stats?: AnalysisStats;
  targetPath?: string;
  schemaVersion?: number;
  failure?: AnalysisFailure;
}
