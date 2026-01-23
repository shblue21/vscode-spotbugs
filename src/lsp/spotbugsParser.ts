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

export function parseAnalysisResponse(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return {
      ok: false,
      error: {
        kind: 'invalid-json',
        message: 'Invalid response payload.',
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
    const errors = Array.isArray(envelope.errors) ? envelope.errors : undefined;
    const bugs = Array.isArray(envelope.results) ? envelope.results : [];
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

  return { ok: true, value: { bugs: [] } };
}
