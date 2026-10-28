import {
  AnalysisError,
  AnalysisStats,
  AnalysisWarning,
} from '../model/analysisProtocol';
import { Bug } from '../model/bug';
import type { AnalysisReportSummary } from '../model/analysisReport';
import {
  decodeCommandResponseEnvelope,
  normalizeCommandIssues,
} from './commandResponseEnvelope';

export interface ParseError {
  message: string;
  cause?: unknown;
}

export interface ParsedAnalysis {
  bugs: Bug[];
  missingClasses?: string[];
  errors?: AnalysisError[];
  warnings?: AnalysisWarning[];
  ignoredMalformedWarnings?: boolean;
  stats?: AnalysisStats;
  reportSummary?: AnalysisReportSummary;
  nativeSarif?: string;
  baselineXml?: string;
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
        message: INVALID_RESPONSE_MESSAGE,
        cause,
      },
    };
  }

  const decoded = decodeCommandResponseEnvelope(parsed);
  if (!decoded) {
    return invalidResponse();
  }

  const { envelope, errors, results } = decoded;
  if (results && !isBugArray(results)) {
    return invalidResponse();
  }

  const hasWarnings = Object.prototype.hasOwnProperty.call(envelope, 'warnings');
  const warnings =
    hasWarnings && Array.isArray(envelope.warnings)
      ? normalizeAnalysisWarnings(envelope.warnings)
      : undefined;
  const ignoredMalformedWarnings =
    hasWarnings && !Array.isArray(envelope.warnings) ? true : undefined;
  const bugs = results ? (results as Bug[]) : [];
  const stats = normalizeAnalysisStats(envelope.stats);
  const reportSummary = normalizeAnalysisReportSummary(envelope.reportSummary);
  const nativeSarif =
    typeof envelope.nativeSarif === 'string' && envelope.nativeSarif.trim().length > 0
      ? envelope.nativeSarif
      : undefined;
  return {
    ok: true,
    value: {
      bugs,
      missingClasses: normalizeMissingClasses(envelope.missingClasses),
      errors,
      warnings,
      ignoredMalformedWarnings,
      stats,
      reportSummary,
      nativeSarif,
      baselineXml:
        typeof envelope.baselineXml === 'string' && envelope.baselineXml.trim().length > 0
          ? envelope.baselineXml
          : undefined,
    },
  };
}

function normalizeMissingClasses(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim()).filter(Boolean);
  return names.length > 0 ? [...new Set(names)].sort() : undefined;
}

function normalizeAnalysisReportSummary(
  value: unknown
): AnalysisReportSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summary: AnalysisReportSummary = {};
  copyNonNegativeInteger(value, summary, 'analyzedCodeSize');
  copyNonNegativeInteger(value, summary, 'analyzedClassCount');
  copyNonNegativeInteger(value, summary, 'analyzedPackageCount');
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function invalidResponse(): ParseResult {
  return {
    ok: false,
    error: {
      message: INVALID_RESPONSE_MESSAGE,
    },
  };
}

function isBugArray(value: unknown): value is Bug[] {
  return Array.isArray(value) && value.every(isRecord);
}

function normalizeAnalysisWarnings(value: unknown[]): AnalysisWarning[] {
  return normalizeCommandIssues(value).filter(
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

function copyNonNegativeInteger<T extends keyof AnalysisReportSummary>(
  source: Record<string, unknown>,
  target: AnalysisReportSummary,
  key: T
): void {
  const value = source[key];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    target[key] = value as AnalysisReportSummary[T];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
