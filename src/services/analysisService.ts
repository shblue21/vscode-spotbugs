import { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { AnalysisOutcome } from '../model/analysisOutcome';
import { formatAnalysisErrors } from '../model/analysisErrors';
import { ANALYSIS_PROTOCOL_SCHEMA_VERSION } from '../model/analysisProtocol';
import { ProjectRef } from '../workspace/classpathService';
import { addFullPaths } from '../workspace/pathResolver';
import { runSpotBugsAnalysis } from '../lsp/spotbugsClient';
import { parseAnalysisResponse } from '../lsp/spotbugsParser';
import { buildAnalysisRequestPayload } from '../lsp/analysisRequestBuilder';
import { mapBugsToFindings } from '../lsp/spotbugsMapper';
import type { ProjectResult } from './projectResult';
import { projectResultFromOutcome } from './projectResult';
import {
  validateExtraAuxClasspathPreflight,
  validateFilterFilesPreflight,
} from './filterFileValidation';
import {
  resolveFileAnalysisTarget,
  resolveFileAnalysisTargetDetailed,
  resolveProjectAnalysisTarget,
  resolveProjectAnalysisTargetDetailed,
} from '../workspace/analysisTargetResolver';
import { getWorkspaceProjectUris } from '../workspace/projectDiscovery';

type AnalysisContext = {
  targetPath: string;
  preferredProject?: Uri;
  targetResolutionRoots?: string[] | null;
  runtimeClasspaths?: string[] | null;
  sourcepaths?: string[] | null;
};

export { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';
export type { ProjectResult } from './projectResult';

export interface WorkspaceResult {
  results: ProjectResult[];
  cancelled?: boolean;
}

export interface AnalysisExecutionContext {
  resolutionIssues: AnalysisResolutionIssue[];
}

export interface AnalysisExecutionResult {
  outcome: AnalysisOutcome;
  context: AnalysisExecutionContext;
}

export interface WorkspaceExecutionResult {
  results: ProjectResult[];
  cancelled?: boolean;
  context: AnalysisExecutionContext;
}

export async function analyzeFileDetailed(
  config: Config,
  uri: Uri
): Promise<AnalysisExecutionResult> {
  const context = createExecutionContext();

  try {
    const result = await resolveFileAnalysisTargetDetailed(uri);
    context.resolutionIssues.push(...result.issues);

    if (result.resolution.status !== 'ok') {
      return {
        outcome: {
          findings: [],
          targetPath: uri.fsPath,
          failure: {
            kind: 'target',
            level: 'warn',
            code: result.resolution.errorCode,
            message: result.resolution.message,
          },
        },
        context,
      };
    }

    try {
      return {
        outcome: await runAnalysis(config, result.resolution.target),
        context,
      };
    } catch (error) {
      Logger.error('Analyzer: analyzeFile failed', error);
      return {
        outcome: { findings: [] },
        context,
      };
    }
  } catch (error) {
    Logger.error('Analyzer: analyzeFile failed', error);
    return {
      outcome: { findings: [] },
      context,
    };
  }
}

export async function analyzeFile(config: Config, uri: Uri): Promise<AnalysisOutcome> {
  const result = await analyzeFileDetailed(config, uri);
  return result.outcome;
}

export async function analyzeWorkspace(
  config: Config,
  workspaceFolder: Uri,
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken
): Promise<WorkspaceResult> {
  const projectUris = await getWorkspaceProjects(workspaceFolder);
  return analyzeWorkspaceFromProjects(config, workspaceFolder, projectUris, notify, token);
}

export async function analyzeWorkspaceFromProjectsDetailed(
  config: Config,
  workspaceFolder: Uri,
  projectUris: string[],
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken
): Promise<WorkspaceExecutionResult> {
  const results: ProjectResult[] = [];
  const context = createExecutionContext();
  let cancelled = false;

  for (let index = 0; index < projectUris.length; index++) {
    const uriString = projectUris[index];
    if (token?.isCancellationRequested) {
      Logger.log('Workspace analysis cancelled by user.');
      cancelled = true;
      break;
    }

    notify?.onStart?.(uriString, index + 1, projectUris.length);

    const result = await analyzeProjectDetailed(
      config,
      Uri.parse(uriString),
      workspaceFolder
    );
    if (result.projectResult.error) {
      notify?.onFail?.(uriString, result.projectResult.error);
    } else {
      notify?.onDone?.(uriString, result.projectResult.findings.length);
    }

    results.push(result.projectResult);
    context.resolutionIssues.push(...result.context.resolutionIssues);
  }

  return { results, cancelled, context };
}

export async function analyzeWorkspaceFromProjects(
  config: Config,
  workspaceFolder: Uri,
  projectUris: string[],
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken
): Promise<WorkspaceResult> {
  const result = await analyzeWorkspaceFromProjectsDetailed(
    config,
    workspaceFolder,
    projectUris,
    notify,
    token
  );
  return {
    results: result.results,
    cancelled: result.cancelled,
  };
}

export async function getWorkspaceProjects(workspaceFolder: Uri): Promise<string[]> {
  return getWorkspaceProjectUris(workspaceFolder);
}

async function analyzeProject(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<ProjectResult> {
  const result = await analyzeProjectDetailed(config, project, workspaceFolder);
  return result.projectResult;
}

async function analyzeProjectDetailed(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<{ projectResult: ProjectResult; context: AnalysisExecutionContext }> {
  const projectUri = normalizeProjectRef(project);
  const projectUriString = projectUri.toString();
  const context = createExecutionContext();

  try {
    const result = await resolveProjectAnalysisTargetDetailed(projectUri, workspaceFolder);
    context.resolutionIssues.push(...result.issues);

    if (result.resolution.status !== 'ok') {
      return {
        projectResult: {
          projectUri: projectUriString,
          findings: [],
          error: result.resolution.message,
          errorCode: result.resolution.errorCode,
        },
        context,
      };
    }

    try {
      const outcome = await runAnalysis(config, result.resolution.target);
      return {
        projectResult: projectResultFromOutcome(projectUriString, outcome),
        context,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        projectResult: { projectUri: projectUriString, findings: [], error: message },
        context,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      projectResult: { projectUri: projectUriString, findings: [], error: message },
      context,
    };
  }
}

async function runAnalysis(
  config: Config,
  context: AnalysisContext
): Promise<AnalysisOutcome> {
  const targetPath = context.targetPath;
  const settings = config.getAnalysisSettings(context.preferredProject);
  const preflightFilterError = await validateFilterFilesPreflight(settings);
  if (preflightFilterError) {
    const combined = formatAnalysisErrors([preflightFilterError]);
    Logger.error(`SpotBugs filter configuration error: ${combined}`);
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
  const preflightAuxClasspathError = await validateExtraAuxClasspathPreflight(settings);
  if (preflightAuxClasspathError) {
    const combined = formatAnalysisErrors([preflightAuxClasspathError]);
    Logger.error(`SpotBugs extra aux classpath configuration error: ${combined}`);
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

  const payload = buildAnalysisRequestPayload(settings, {
    targetResolutionRoots: context.targetResolutionRoots ?? null,
    runtimeClasspaths: context.runtimeClasspaths ?? null,
    extraAuxClasspaths: settings.extraAuxClasspaths ?? null,
    sourcepaths: context.sourcepaths ?? null,
  });
  const result = await runSpotBugsAnalysis({
    targetPath: context.targetPath,
    payload,
  });

  if (!result) {
    return { findings: [] };
  }

  const parsed = parseAnalysisResponse(result);
  if (!parsed.ok) {
    if (parsed.error.kind === 'invalid-json') {
      Logger.error('Failed to parse analysis result', parsed.error.cause ?? parsed.error.message);
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
    Logger.error(`SpotBugs analysis error: ${parsed.error.message}`);
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

  const { bugs, errors, stats, schemaVersion } = parsed.value;

  if (
    typeof schemaVersion === 'number' &&
    schemaVersion !== ANALYSIS_PROTOCOL_SCHEMA_VERSION
  ) {
    Logger.log(`Unexpected analysis response schemaVersion=${schemaVersion}`);
  }
  if (Array.isArray(errors) && errors.length > 0) {
    const combined = formatAnalysisErrors(errors);
    Logger.error(`SpotBugs analysis error: ${combined}`);
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

  const findings = mapBugsToFindings(bugs);
  const withFullPaths = await addFullPaths(findings, context.preferredProject);
  const logParts: string[] = [];
  logParts.push(`findings=${withFullPaths.length}`);
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
  Logger.log(`Successfully parsed and added full paths (${logParts.join(', ')}).`);
  const outcome: AnalysisOutcome = {
    findings: withFullPaths,
    stats,
    targetPath,
    schemaVersion,
  };
  if (Array.isArray(errors) && errors.length > 0) {
    outcome.errors = errors;
  }
  return outcome;
}

function normalizeProjectRef(project: ProjectRef): Uri {
  if (!project) {
    throw new Error('Project reference is required');
  }

  if (project instanceof Uri) {
    return project;
  }

  if (typeof project === 'string') {
    return Uri.parse(project);
  }

  throw new Error('Unsupported project reference');
}

function createExecutionContext(): AnalysisExecutionContext {
  return {
    resolutionIssues: [],
  };
}
