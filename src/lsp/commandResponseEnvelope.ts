import type { AnalysisError } from '../model/analysisProtocol';

export interface DecodedCommandResponseEnvelope {
  envelope: Record<string, unknown>;
  results?: unknown[];
  errors?: AnalysisError[];
}

export function decodeCommandResponseEnvelope(
  value: unknown
): DecodedCommandResponseEnvelope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const hasResults = Object.prototype.hasOwnProperty.call(value, 'results');
  const hasErrors = Object.prototype.hasOwnProperty.call(value, 'errors');
  if (!hasResults && !hasErrors) {
    return undefined;
  }

  const rawResults = value.results;
  const rawErrors = value.errors;
  if (hasResults && !Array.isArray(rawResults)) {
    return undefined;
  }
  if (hasErrors && !Array.isArray(rawErrors)) {
    return undefined;
  }

  const results = hasResults ? (rawResults as unknown[]) : undefined;
  const errors = hasErrors ? normalizeCommandIssues(rawErrors as unknown[]) : undefined;
  if (!hasResults && (!errors || errors.length === 0)) {
    return undefined;
  }

  return {
    envelope: value,
    results,
    errors,
  };
}

export function normalizeCommandIssues(values: readonly unknown[]): AnalysisError[] {
  const issues: AnalysisError[] = [];
  for (const item of values) {
    if (!isRecord(item)) {
      continue;
    }

    const issue: AnalysisError = {};
    if (typeof item.code === 'string') {
      issue.code = item.code;
    }
    if (typeof item.message === 'string') {
      issue.message = item.message;
    }
    if (issue.code || issue.message) {
      issues.push(issue);
    }
  }
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
