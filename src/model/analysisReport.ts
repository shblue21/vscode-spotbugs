import type { Finding } from './finding';

export interface AnalysisReportSummary {
  analyzedCodeSize?: number;
  analyzedClassCount?: number;
  analyzedPackageCount?: number;
}

export interface AnalysisReportRun {
  projectUri: string;
  findings: Finding[];
  analysisStatus?: 'failed' | 'skipped';
  spotbugsVersion?: string;
  summary?: AnalysisReportSummary;
}
