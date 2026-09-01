import type { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import type { AnalysisSettings } from '../core/config';
import type { AnalysisExecutionUnit } from '../model/analysisExecutionUnit';
import type { AnalysisOutcome } from '../model/analysisOutcome';
import { formatAnalysisErrors } from '../model/analysisErrors';
import {
  ANALYSIS_PROTOCOL_SCHEMA_VERSION,
  type AnalysisStats,
} from '../model/analysisProtocol';
import * as pathResolver from '../workspace/pathResolver';
import * as spotbugsClient from '../lsp/spotbugsClient';
import type { ParsedAnalysis, ParseResult } from '../lsp/spotbugsParser';
import * as spotbugsParser from '../lsp/spotbugsParser';
import * as analysisRequestBuilder from '../lsp/analysisRequestBuilder';
import * as spotbugsMapper from '../lsp/spotbugsMapper';
import * as filterFileValidation from './filterFileValidation';

const ERROR_ANALYSIS_NO_RESPONSE = 'ANALYSIS_NO_RESPONSE';
const LOGGED_STATS_FIELDS = [
  ['durationMs', 'number'],
  ['target', 'string'],
  ['spotbugsVersion', 'string'],
  ['targetResolutionRootCount', 'number'],
  ['runtimeClasspathCount', 'number'],
  ['extraAuxClasspathCount', 'number'],
  ['auxClasspathCount', 'number'],
  ['targetCount', 'number'],
  ['pluginCount', 'number'],
] as const satisfies readonly (readonly [
  keyof AnalysisStats,
  'number' | 'string',
])[];

export interface AnalysisConfigProvider {
  getAnalysisSettings(resource?: Uri): AnalysisSettings;
}

type LoggerLike = Pick<typeof Logger, 'log' | 'error'>;

export interface AnalysisExecutorDeps {
  validateFilterFilesPreflight: typeof filterFileValidation.validateFilterFilesPreflight;
  validateExtraAuxClasspathPreflight: typeof filterFileValidation.validateExtraAuxClasspathPreflight;
  validatePluginJarsPreflight: typeof filterFileValidation.validatePluginJarsPreflight;
  buildAnalysisRequestPayload: typeof analysisRequestBuilder.buildAnalysisRequestPayload;
  runSpotBugsAnalysis: typeof spotbugsClient.runSpotBugsAnalysis;
  parseAnalysisResponse: typeof spotbugsParser.parseAnalysisResponse;
  mapBugsToFindings: typeof spotbugsMapper.mapBugsToFindings;
  addFullPaths: typeof pathResolver.addFullPaths;
  logger: LoggerLike;
}

function createDefaultDeps(): AnalysisExecutorDeps {
  return {
    validateFilterFilesPreflight:
      filterFileValidation.validateFilterFilesPreflight,
    validateExtraAuxClasspathPreflight:
      filterFileValidation.validateExtraAuxClasspathPreflight,
    validatePluginJarsPreflight:
      filterFileValidation.validatePluginJarsPreflight,
    buildAnalysisRequestPayload:
      analysisRequestBuilder.buildAnalysisRequestPayload,
    runSpotBugsAnalysis: spotbugsClient.runSpotBugsAnalysis,
    parseAnalysisResponse: spotbugsParser.parseAnalysisResponse,
    mapBugsToFindings: spotbugsMapper.mapBugsToFindings,
    addFullPaths: pathResolver.addFullPaths,
    logger: Logger,
  };
}

export function createAnalysisExecutor(overrides: Partial<AnalysisExecutorDeps> = {}) {
  const deps: AnalysisExecutorDeps = { ...createDefaultDeps(), ...overrides };

  async function run(
    config: AnalysisConfigProvider,
    context: AnalysisExecutionUnit,
    token?: CancellationToken
  ): Promise<AnalysisOutcome> {
    const analysisContext: AnalysisExecutionUnit = {
      ...context,
      sourceLookup: {
        ...context.sourceLookup,
        roots: Array.isArray(context.sourceLookup.roots)
          ? context.sourceLookup.roots.slice()
          : context.sourceLookup.roots,
      },
    };
    const settings = config.getAnalysisSettings(analysisContext.settingsResource);
    const preflightFailure = await validateAnalysisPreflight(
      settings,
      analysisContext.input.path
    );
    if (preflightFailure) {
      return preflightFailure;
    }

    const raw = await executeAnalysisRequest(settings, analysisContext, token);
    return analysisOutcomeFromRawResponse(raw, analysisContext);
  }

  async function validateAnalysisPreflight(
    settings: AnalysisSettings,
    targetPath: string
  ): Promise<AnalysisOutcome | undefined> {
    const checks = [
      ['filter', () => deps.validateFilterFilesPreflight(settings)],
      [
        'extra aux classpath',
        () => deps.validateExtraAuxClasspathPreflight(settings),
      ],
      ['plugin', () => deps.validatePluginJarsPreflight(settings)],
    ] as const;

    for (const [label, validate] of checks) {
      const error = await validate();
      if (!error) {
        continue;
      }
      const combined = formatAnalysisErrors([error]);
      deps.logger.error(`SpotBugs ${label} configuration error: ${combined}`);
      return {
        findings: [],
        errors: [error],
        targetPath,
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: error.code,
          message: `SpotBugs analysis failed: ${combined}`,
        },
      };
    }

    return undefined;
  }

  async function executeAnalysisRequest(
    settings: AnalysisSettings,
    context: AnalysisExecutionUnit,
    token?: CancellationToken
  ): Promise<string | undefined> {
    const payload = deps.buildAnalysisRequestPayload(settings, {
      targetResolutionRoots: context.input.resolutionRoots
        ? [...context.input.resolutionRoots]
        : null,
      runtimeClasspaths: context.environment.runtimeClasspaths
        ? [...context.environment.runtimeClasspaths]
        : null,
      extraAuxClasspaths: settings.extraAuxClasspaths ?? null,
      sourcepaths: context.sourceLookup.roots
        ? [...context.sourceLookup.roots]
        : null,
      ...(context.options?.includeBaselineXml ? { includeBaselineXml: true } : {}),
    });
    return deps.runSpotBugsAnalysis(
      {
        targetPath: context.input.path,
        payload,
      },
      token
    );
  }

  async function analysisOutcomeFromRawResponse(
    raw: string | undefined,
    context: AnalysisExecutionUnit
  ): Promise<AnalysisOutcome> {
    const targetPath = context.input.path;
    if (!raw) {
      return createAnalysisFailureOutcome(
        targetPath,
        ERROR_ANALYSIS_NO_RESPONSE,
        'No response from SpotBugs backend.'
      );
    }

    const parsed = deps.parseAnalysisResponse(raw);
    if (!parsed.ok) {
      return analysisOutcomeFromParseError(parsed, targetPath);
    }

    return analysisOutcomeFromParsedResponse(parsed.value, context);
  }

  function analysisOutcomeFromParseError(
    parsed: Extract<ParseResult, { ok: false }>,
    targetPath: string
  ): AnalysisOutcome {
    if (parsed.error.kind === 'invalid-json') {
      deps.logger.error(
        'Failed to parse analysis result',
        parsed.error.cause ?? parsed.error.message
      );
      return {
        findings: [],
        targetPath,
        failure: {
          kind: 'invalid-json',
          level: 'error',
          message: 'SpotBugs analysis failed: Invalid response payload.',
        },
      };
    }

    deps.logger.error(`SpotBugs analysis error: ${parsed.error.message}`);
    return {
      findings: [],
      targetPath,
      failure: {
        kind: 'analysis-error',
        level: 'error',
        message: `SpotBugs analysis failed: ${parsed.error.message}`,
      },
    };
  }

  async function analysisOutcomeFromParsedResponse(
    parsed: ParsedAnalysis,
    context: AnalysisExecutionUnit
  ): Promise<AnalysisOutcome> {
    const targetPath = context.input.path;
    const {
      bugs,
      errors,
      warnings,
      ignoredMalformedWarnings,
      stats,
      reportSummary,
      nativeSarif,
      schemaVersion,
    } = parsed;
    const hasErrors = Array.isArray(errors) && errors.length > 0;
    const hasTerminalErrors = hasErrors && bugs.length === 0;
    const reportableWarnings =
      !hasTerminalErrors && Array.isArray(warnings) && warnings.length > 0
        ? warnings
        : undefined;

    if (
      typeof schemaVersion === 'number' &&
      schemaVersion !== ANALYSIS_PROTOCOL_SCHEMA_VERSION
    ) {
      deps.logger.log(`Unexpected analysis response schemaVersion=${schemaVersion}`);
    }
    if (ignoredMalformedWarnings && !hasTerminalErrors) {
      deps.logger.log(
        'SpotBugs analysis warning: Ignored malformed warnings field in analysis response.'
      );
    }
    if (reportableWarnings) {
      deps.logger.log(
        `SpotBugs analysis warning: ${formatAnalysisErrors(reportableWarnings)}`
      );
    }
    if (hasErrors) {
      const combined = formatAnalysisErrors(errors);
      deps.logger.error(`SpotBugs analysis error: ${combined}`);
      const hasResults = bugs.length > 0;
      if (!hasResults) {
        const firstErrorCode = errors.find((error) => !!error.code)?.code;
        return {
          findings: [],
          errors,
          stats,
          targetPath,
          schemaVersion,
          failure: {
            kind: 'analysis-error',
            level: 'error',
            code: firstErrorCode,
            message: `SpotBugs analysis failed: ${combined}`,
          },
        };
      }
    }

    const findings = deps.mapBugsToFindings(bugs);
    const withFullPaths = await deps.addFullPaths(
      findings,
      context.sourceLookup.preferredResource,
      context.sourceLookup.roots
    );
    logSuccessfulAnalysis(withFullPaths.length, stats);
    const outcome: AnalysisOutcome = {
      findings: withFullPaths,
      stats,
      reportSummary,
      nativeSarif,
      baselineXml: parsed.baselineXml,
      targetPath,
      schemaVersion,
    };
    if (Array.isArray(errors) && errors.length > 0) {
      outcome.errors = errors;
    }
    if (reportableWarnings) {
      outcome.warnings = reportableWarnings;
    }
    return outcome;
  }

  function logSuccessfulAnalysis(
    findingCount: number,
    stats: AnalysisStats | undefined
  ): void {
    const logParts = [`findings=${findingCount}`];
    for (const [field, expectedType] of LOGGED_STATS_FIELDS) {
      const value = stats?.[field];
      if (typeof value === expectedType) {
        logParts.push(`${field}=${value}`);
      }
    }
    deps.logger.log(
      `Successfully parsed and added full paths (${logParts.join(', ')}).`
    );
  }

  return {
    run,
  };
}

export function runAnalysisTarget(
  config: AnalysisConfigProvider,
  context: AnalysisExecutionUnit,
  token?: CancellationToken
): Promise<AnalysisOutcome> {
  return createAnalysisExecutor().run(config, context, token);
}

export function createAnalysisFailureOutcome(
  targetPath: string,
  code: string,
  message: string
): AnalysisOutcome {
  return {
    findings: [],
    targetPath,
    failure: {
      kind: 'analysis-error',
      level: 'error',
      code,
      message: `SpotBugs analysis failed: ${message}`,
    },
  };
}
