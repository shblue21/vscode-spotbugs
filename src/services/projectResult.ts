import { formatAnalysisErrors } from '../model/analysisErrors';
import type { AnalysisOutcome } from '../model/analysisOutcome';
import type { Finding } from '../model/finding';

export interface ProjectResult {
  projectUri: string;
  findings: Finding[];
  error?: string;
  errorCode?: string;
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

  return {
    projectUri,
    findings: outcome.findings,
  };
}
