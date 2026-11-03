import { Finding } from './finding';
import { AnalysisError, AnalysisStats, AnalysisWarning } from './analysisProtocol';
import type { AnalysisReportSummary } from './analysisReport';

type AnalysisNoticeLevel = 'info' | 'warn' | 'error';

export interface AnalysisNotice {
  level: AnalysisNoticeLevel;
  code?: string;
  message: string;
}

type AnalysisFailureKind = 'target' | 'invalid-json' | 'analysis-error';

interface AnalysisFailure {
  kind: AnalysisFailureKind;
  level: AnalysisNoticeLevel;
  message: string;
  code?: string;
}

export interface AnalysisOutcome {
  findings: Finding[];
  errors?: AnalysisError[];
  warnings?: AnalysisWarning[];
  stats?: AnalysisStats;
  reportSummary?: AnalysisReportSummary;
  nativeSarif?: string;
  baselineXml?: string;
  targetPath?: string;
  failure?: AnalysisFailure;
}
