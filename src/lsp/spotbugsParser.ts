import {
  AnalysisError,
  AnalysisStats,
  AnalysisWarning,
} from '../model/analysisProtocol';
import { Bug } from '../model/bug';

export type ParseErrorKind = 'invalid-json' | 'analysis-error';

export interface ParseError {
  kind: ParseErrorKind;
  message: string;
  cause?: unknown;
}

export interface ParsedAnalysis {
  bugs: Bug[];
  errors?: AnalysisError[];
  warnings?: AnalysisWarning[];
  ignoredMalformedWarnings?: boolean;
  stats?: AnalysisStats;
  schemaVersion?: number;
}

export type ParseResult =
  | { ok: true; value: ParsedAnalysis }
  | { ok: false; error: ParseError };

const INVALID_RESPONSE_MESSAGE = 'Invalid response payload.';

export function parseAnalysisResponse(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return {
      ok: false,
      error: {
        kind: 'invalid-json',
        message: INVALID_RESPONSE_MESSAGE,
        cause,
      },
    };
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as { error?: unknown }).error
  ) {
    const message = String((parsed as { error?: unknown }).error);
    return { ok: false, error: { kind: 'analysis-error', message } };
  }

  if (Array.isArray(parsed)) {
    return isBugArray(parsed) ? { ok: true, value: { bugs: parsed } } : invalidResponse();
  }

  if (parsed && typeof parsed === 'object') {
    const envelope = parsed as Record<string, unknown>;
    const hasResults = Object.prototype.hasOwnProperty.call(envelope, 'results');
    const hasErrors = Object.prototype.hasOwnProperty.call(envelope, 'errors');
    const hasWarnings = Object.prototype.hasOwnProperty.call(envelope, 'warnings');
    if (!hasResults && !hasErrors) {
      return invalidResponse();
    }
    if (hasResults && !isBugArray(envelope.results)) {
      return invalidResponse();
    }
    if (hasErrors && !Array.isArray(envelope.errors)) {
      return invalidResponse();
    }

    const errors = hasErrors ? normalizeAnalysisErrors(envelope.errors) : undefined;
    if (!hasResults && Array.isArray(errors) && errors.length === 0) {
      return invalidResponse();
    }

    const warnings =
      hasWarnings && Array.isArray(envelope.warnings)
        ? normalizeAnalysisWarnings(envelope.warnings)
        : undefined;
    const ignoredMalformedWarnings =
      hasWarnings && !Array.isArray(envelope.warnings) ? true : undefined;
    const bugs = hasResults ? (envelope.results as Bug[]) : [];
    const stats = normalizeAnalysisStats(envelope.stats);
    const schemaVersion =
      typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : undefined;
    return {
      ok: true,
      value: {
        bugs,
        errors,
        warnings,
        ignoredMalformedWarnings,
        stats,
        schemaVersion,
      },
    };
  }

  return invalidResponse();
}

function invalidResponse(): ParseResult {
  return {
    ok: false,
    error: {
      kind: 'invalid-json',
      message: INVALID_RESPONSE_MESSAGE,
    },
  };
}

function isBugArray(value: unknown): value is Bug[] {
  return Array.isArray(value) && value.every(isRecord);
}

function normalizeAnalysisErrors(value: unknown): AnalysisError[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const errors: AnalysisError[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const error: AnalysisError = {};
    if (typeof item.code === 'string') {
      error.code = item.code;
    }
    if (typeof item.message === 'string') {
      error.message = item.message;
    }
    if (error.code || error.message) {
      errors.push(error);
    }
  }
  return errors;
}

function normalizeAnalysisWarnings(value: unknown[]): AnalysisWarning[] {
  return normalizeAnalysisErrors(value).filter(
    (warning) => typeof warning.code === 'string' && typeof warning.message === 'string'
  );
}

function normalizeAnalysisStats(value: unknown): AnalysisStats | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const stats: AnalysisStats = {};
  copyStringField(value, stats, 'target');
  copyNumberField(value, stats, 'durationMs');
  copyNumberField(value, stats, 'findingCount');
  copyStringField(value, stats, 'spotbugsVersion');
  copyNumberField(value, stats, 'targetResolutionRootCount');
  copyNumberField(value, stats, 'runtimeClasspathCount');
  copyNumberField(value, stats, 'extraAuxClasspathCount');
  copyNumberField(value, stats, 'auxClasspathCount');
  copyNumberField(value, stats, 'targetCount');
  copyNumberField(value, stats, 'pluginCount');

  return Object.keys(stats).length > 0 ? stats : undefined;
}

function copyStringField<T extends keyof AnalysisStats>(
  source: Record<string, unknown>,
  target: AnalysisStats,
  key: T
): void {
  if (typeof source[key] === 'string') {
    target[key] = source[key] as AnalysisStats[T];
  }
}

function copyNumberField<T extends keyof AnalysisStats>(
  source: Record<string, unknown>,
  target: AnalysisStats,
  key: T
): void {
  if (typeof source[key] === 'number') {
    target[key] = source[key] as AnalysisStats[T];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
