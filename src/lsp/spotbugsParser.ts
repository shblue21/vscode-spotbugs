import { AnalysisError, AnalysisResponse, AnalysisStats } from '../model/analysisProtocol';
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
    return { ok: true, value: { bugs: parsed as Bug[] } };
  }

  if (parsed && typeof parsed === 'object') {
    const envelope = parsed as AnalysisResponse<Bug>;
    const hasResults = Object.prototype.hasOwnProperty.call(envelope, 'results');
    const hasErrors = Object.prototype.hasOwnProperty.call(envelope, 'errors');
    if (!hasResults && !hasErrors) {
      return invalidResponse();
    }
    if (hasResults && !Array.isArray(envelope.results)) {
      return invalidResponse();
    }
    if (hasErrors && !Array.isArray(envelope.errors)) {
      return invalidResponse();
    }

    const errors = hasErrors ? envelope.errors : undefined;
    if (!hasResults && Array.isArray(errors) && errors.length === 0) {
      return invalidResponse();
    }

    const bugs = hasResults ? envelope.results ?? [] : [];
    const stats = envelope.stats;
    return {
      ok: true,
      value: {
        bugs,
        errors,
        stats,
        schemaVersion: envelope.schemaVersion,
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
