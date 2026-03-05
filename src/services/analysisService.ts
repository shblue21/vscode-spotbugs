import { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import { Finding } from '../model/finding';
import { AnalysisOutcome } from '../model/analysisOutcome';
import { formatAnalysisErrors } from '../model/analysisErrors';
import { ProjectRef } from '../workspace/classpathService';
import { addFullPaths } from '../workspace/pathResolver';
import { runSpotBugsAnalysis } from '../lsp/spotbugsClient';
import { parseAnalysisResponse } from '../lsp/spotbugsParser';
import { buildAnalysisRequestPayload } from '../lsp/analysisRequestBuilder';
import { mapBugsToFindings } from '../lsp/spotbugsMapper';
import { validateFilterFilesPreflight } from './filterFileValidation';
import {
  resolveFileAnalysisTarget,
  resolveProjectAnalysisTarget,
} from '../workspace/analysisTargetResolver';
import { getWorkspaceProjectUris } from '../workspace/projectDiscovery';

type AnalysisContext = {
  targetPath: string;
  preferredProject?: Uri;
  classpaths?: string[] | null;
  sourcepaths?: string[] | null;
};

export { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetResolver';
export interface ProjectResult {
  projectUri: string;
  findings: Finding[];
  error?: string;
  errorCode?: string;
}

export interface WorkspaceResult {
  results: ProjectResult[];
  cancelled?: boolean;
}

export async function analyzeFile(config: Config, uri: Uri): Promise<AnalysisOutcome> {
  try {
    const resolution = await resolveFileAnalysisTarget(uri);
    if (resolution.status !== 'ok') {
      return {
        findings: [],
        targetPath: uri.fsPath,
        failure: {
          kind: 'target',
          level: 'warn',
          code: resolution.errorCode,
          message: resolution.message,
        },
      };
    }
    return await runAnalysis(config, resolution.target);
  } catch (error) {
    Logger.error('Analyzer: analyzeFile failed', error);
    return { findings: [] };
  }
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
  const results: ProjectResult[] = [];
  let cancelled = false;

  for (let index = 0; index < projectUris.length; index++) {
    const uriString = projectUris[index];
    if (token?.isCancellationRequested) {
      Logger.log('Workspace analysis cancelled by user.');
      cancelled = true;
      break;
    }

    notify?.onStart?.(uriString, index + 1, projectUris.length);

    const projectResult = await analyzeProject(config, Uri.parse(uriString), workspaceFolder);
    if (projectResult.error) {
      notify?.onFail?.(uriString, projectResult.error);
    } else {
      notify?.onDone?.(uriString, projectResult.findings.length);
    }

    results.push(projectResult);
  }

  return { results, cancelled };
}

export async function getWorkspaceProjects(workspaceFolder: Uri): Promise<string[]> {
  return getWorkspaceProjectUris(workspaceFolder);
}

async function analyzeProject(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<ProjectResult> {
  const projectUri = normalizeProjectRef(project);
  const projectUriString = projectUri.toString();

  try {
    const resolution = await resolveProjectAnalysisTarget(projectUri, workspaceFolder);
    if (resolution.status !== 'ok') {
      return {
        projectUri: projectUriString,
        findings: [],
        error: resolution.message,
        errorCode: resolution.errorCode,
      };
    }

    const outcome = await runAnalysis(config, resolution.target);
    return { projectUri: projectUriString, findings: outcome.findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { projectUri: projectUriString, findings: [], error: message };
  }
}

async function runAnalysis(
  config: Config,
  context: AnalysisContext
): Promise<AnalysisOutcome> {
  const targetPath = context.targetPath;
  const settings = config.getAnalysisSettings();
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

  const payload = buildAnalysisRequestPayload(settings, {
    classpaths: context.classpaths ?? null,
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

  if (typeof schemaVersion === 'number' && schemaVersion !== 1) {
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
  if (typeof stats?.classpathCount === 'number') {
    logParts.push(`classpathCount=${stats.classpathCount}`);
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
