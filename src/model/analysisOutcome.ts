import { Bug } from './bug';
import { AnalysisError, AnalysisStats } from './analysisProtocol';

export type AnalysisNoticeLevel = 'info' | 'warn' | 'error';

export interface AnalysisNotice {
  level: AnalysisNoticeLevel;
  code?: string;
  message: string;
}

export interface AnalysisOutcome {
  findings: Bug[];
  errors?: AnalysisError[];
  notices?: AnalysisNotice[];
  errorCode?: string;
  stats?: AnalysisStats;
}
