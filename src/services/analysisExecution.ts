import type { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import type { AnalysisSettings, Config } from '../core/config';
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

export interface AnalysisExecutionTarget {
  targetPath: string;
  preferredProject?: Uri;
  targetResolutionRoots?: string[] | null;
  runtimeClasspaths?: string[] | null;
  sourcepaths?: string[] | null;
}

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
    context: AnalysisExecutionTarget,
    token?: CancellationToken
  ): Promise<AnalysisOutcome> {
    const settings = config.getAnalysisSettings(context.preferredProject);
    const preflightFailure = await validateAnalysisPreflight(
      settings,
      context.targetPath
    );
    if (preflightFailure) {
      return preflightFailure;
    }

    const raw = await executeAnalysisRequest(settings, context, token);
    return analysisOutcomeFromRawResponse(raw, context);
  }

  async function validateAnalysisPreflight(
    settings: AnalysisSettings,
    targetPath: string
  ): Promise<AnalysisOutcome | undefined> {
    const preflightFilterError = await deps.validateFilterFilesPreflight(settings);
    if (preflightFilterError) {
      const combined = formatAnalysisErrors([preflightFilterError]);
      deps.logger.error(`SpotBugs filter configuration error: ${combined}`);
      return {
        findings: [],
        errors: [preflightFilterError],
        targetPath,
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: preflightFilterError.code,
          message: `SpotBugs analysis failed: ${combined}`,
        },
      };
    }

    const preflightAuxClasspathError =
      await deps.validateExtraAuxClasspathPreflight(settings);
    if (preflightAuxClasspathError) {
      const combined = formatAnalysisErrors([preflightAuxClasspathError]);
      deps.logger.error(
        `SpotBugs extra aux classpath configuration error: ${combined}`
      );
      return {
        findings: [],
        errors: [preflightAuxClasspathError],
        targetPath,
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: preflightAuxClasspathError.code,
          message: `SpotBugs analysis failed: ${combined}`,
        },
      };
    }

    const preflightPluginError = await deps.validatePluginJarsPreflight(settings);
    if (preflightPluginError) {
      const combined = formatAnalysisErrors([preflightPluginError]);
      deps.logger.error(`SpotBugs plugin configuration error: ${combined}`);
      return {
        findings: [],
        errors: [preflightPluginError],
        targetPath,
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: preflightPluginError.code,
          message: `SpotBugs analysis failed: ${combined}`,
        },
      };
    }

    return undefined;
  }

  async function executeAnalysisRequest(
    settings: AnalysisSettings,
    context: AnalysisExecutionTarget,
    token?: CancellationToken
  ): Promise<string | undefined> {
    const payload = deps.buildAnalysisRequestPayload(settings, {
      targetResolutionRoots: context.targetResolutionRoots ?? null,
      runtimeClasspaths: context.runtimeClasspaths ?? null,
      extraAuxClasspaths: settings.extraAuxClasspaths ?? null,
      sourcepaths: context.sourcepaths ?? null,
    });
    return deps.runSpotBugsAnalysis(
      {
        targetPath: context.targetPath,
        payload,
      },
      token
    );
  }

  async function analysisOutcomeFromRawResponse(
    raw: string | undefined,
    context: AnalysisExecutionTarget
  ): Promise<AnalysisOutcome> {
    const targetPath = context.targetPath;
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
    context: AnalysisExecutionTarget
  ): Promise<AnalysisOutcome> {
    const targetPath = context.targetPath;
    const {
      bugs,
      errors,
      warnings,
      ignoredMalformedWarnings,
      stats,
      reportSummary,
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
      context.preferredProject
    );
    logSuccessfulAnalysis(withFullPaths.length, stats);
    const outcome: AnalysisOutcome = {
      findings: withFullPaths,
      stats,
      reportSummary,
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
    const logParts: string[] = [];
    logParts.push(`findings=${findingCount}`);
    if (typeof stats?.durationMs === 'number') {
      logParts.push(`durationMs=${stats.durationMs}`);
    }
    if (typeof stats?.target === 'string') {
      logParts.push(`target=${stats.target}`);
    }
    if (typeof stats?.spotbugsVersion === 'string') {
      logParts.push(`spotbugsVersion=${stats.spotbugsVersion}`);
    }
    if (typeof stats?.targetResolutionRootCount === 'number') {
      logParts.push(`targetResolutionRootCount=${stats.targetResolutionRootCount}`);
    }
    if (typeof stats?.runtimeClasspathCount === 'number') {
      logParts.push(`runtimeClasspathCount=${stats.runtimeClasspathCount}`);
    }
    if (typeof stats?.extraAuxClasspathCount === 'number') {
      logParts.push(`extraAuxClasspathCount=${stats.extraAuxClasspathCount}`);
    }
    if (typeof stats?.auxClasspathCount === 'number') {
      logParts.push(`auxClasspathCount=${stats.auxClasspathCount}`);
    }
    if (typeof stats?.targetCount === 'number') {
      logParts.push(`targetCount=${stats.targetCount}`);
    }
    if (typeof stats?.pluginCount === 'number') {
      logParts.push(`pluginCount=${stats.pluginCount}`);
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
  config: Config,
  context: AnalysisExecutionTarget,
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
