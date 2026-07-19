import { formatAnalysisErrors } from '../model/analysisErrors';
import type { AnalysisOutcome } from '../model/analysisOutcome';
import type { Finding } from '../model/finding';
import type { AnalysisReportSummary } from '../model/analysisReport';

export interface ProjectResult {
  projectUri: string;
  findings: Finding[];
  error?: string;
  errorCode?: string;
  spotbugsVersion?: string;
  reportSummary?: AnalysisReportSummary;
  nativeSarif?: string;
}

export function projectResultFromOutcome(
  projectUri: string,
  outcome: AnalysisOutcome
): ProjectResult {
  if (outcome.failure) {
    return {
      projectUri,
      findings: outcome.findings,
      error: outcome.failure.message,
      errorCode: outcome.failure.code,
    };
  }

  if (Array.isArray(outcome.errors) && outcome.errors.length > 0 && outcome.findings.length === 0) {
    const combined = formatAnalysisErrors(outcome.errors);
    const firstErrorCode = outcome.errors.find((error) => !!error.code)?.code;
    return {
      projectUri,
      findings: outcome.findings,
      error: `SpotBugs analysis failed: ${combined}`,
      errorCode: firstErrorCode,
    };
  }

  const result: ProjectResult = {
    projectUri,
    findings: outcome.findings,
  };
  if (outcome.stats?.spotbugsVersion) {
    result.spotbugsVersion = outcome.stats.spotbugsVersion;
  }
  if (outcome.reportSummary) {
    result.reportSummary = outcome.reportSummary;
  }
  if (outcome.nativeSarif) {
    result.nativeSarif = outcome.nativeSarif;
  }
  return result;
}
