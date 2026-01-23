import { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import { Bug } from '../model/bug';
import { AnalysisOutcome, AnalysisNotice } from '../model/analysisOutcome';
import { ProjectRef } from '../workspace/classpathService';
import { addFullPaths } from '../workspace/pathResolver';
import { runSpotBugsAnalysis } from '../lsp/spotbugsClient';
import { parseAnalysisResponse } from '../lsp/spotbugsParser';
import { buildAnalysisRequestPayload } from '../lsp/analysisRequestBuilder';
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

type AnalysisOptions = {
  includeHints?: boolean;
};

export { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetResolver';
export interface ProjectResult {
  projectUri: string;
  findings: Bug[];
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
        errorCode: resolution.errorCode,
        notices: [
          {
            level: 'warn',
            code: resolution.errorCode,
            message: resolution.message,
          },
        ],
      };
    }
    return await runAnalysis(config, resolution.target, { includeHints: true });
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

    const outcome = await runAnalysis(config, resolution.target, { includeHints: false });
    return { projectUri: projectUriString, findings: outcome.findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { projectUri: projectUriString, findings: [], error: message };
  }
}

async function runAnalysis(
  config: Config,
  context: AnalysisContext,
  options: AnalysisOptions = {}
): Promise<AnalysisOutcome> {
  const notices: AnalysisNotice[] = [];
  const payload = buildAnalysisRequestPayload(config.getAnalysisSettings(), {
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
      notices.push({
        level: 'error',
        message: 'SpotBugs analysis failed: Invalid response payload.',
      });
      return { findings: [], notices };
    }
    Logger.error(`SpotBugs analysis error: ${parsed.error.message}`);
    notices.push({
      level: 'error',
      message: `SpotBugs analysis failed: ${parsed.error.message}`,
    });
    return { findings: [], notices };
  }

  const { bugs, errors, stats, schemaVersion } = parsed.value;

  if (typeof schemaVersion === 'number' && schemaVersion !== 1) {
    Logger.log(`Unexpected analysis response schemaVersion=${schemaVersion}`);
  }
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((err) => {
      const code = err.code ? `[${err.code}]` : '';
      const message = err.message || 'Unknown error';
      return `${code} ${message}`.trim();
    });
    const combined = messages.join('; ');
    Logger.error(`SpotBugs analysis error: ${combined}`);
    const hasResults = bugs.length > 0;
    if (!hasResults) {
      notices.push({
        level: 'error',
        message: `SpotBugs analysis failed: ${combined}`,
      });
      return { findings: [], errors, stats, notices };
    }
    notices.push({
      level: 'warn',
      message: `SpotBugs analysis completed with warnings: ${combined}`,
    });
  }

  const withFullPaths = await addFullPaths(bugs, context.preferredProject);
  if (options.includeHints && withFullPaths.length === 0) {
    const target = context.targetPath.replace(/\\/g, '/').toLowerCase();
    const isBytecodeTarget =
      target.endsWith('.class') || target.endsWith('.jar') || target.endsWith('.zip');
    const looksLikeSourceTarget = target.endsWith('.java') || target.includes('/src/');
    const classpathCount = typeof stats?.classpathCount === 'number' ? stats.classpathCount : undefined;
    const targetCount = typeof stats?.targetCount === 'number' ? stats.targetCount : undefined;

    if (!isBytecodeTarget) {
      if (targetCount === 0) {
        if ((classpathCount ?? 0) === 0) {
          notices.push({
            level: 'warn',
            message:
              'SpotBugs: No compiled classes found (classpath unavailable). Make sure the target is inside a Java project and build the workspace.',
          });
        } else {
          notices.push({
            level: 'warn',
            message:
              'SpotBugs: No compiled classes found for the selected target. Build the project or select an output folder (e.g. build/classes or target/classes).',
          });
        }
      } else if (looksLikeSourceTarget && (classpathCount ?? 0) === 0) {
        notices.push({
          level: 'warn',
          message:
            'SpotBugs: Classpath is unavailable for this target; results may be incomplete. Try building the workspace and re-run.',
        });
      }
    }
  }
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
  const outcome: AnalysisOutcome = { findings: withFullPaths, stats };
  if (Array.isArray(errors) && errors.length > 0) {
    outcome.errors = errors;
  }
  if (notices.length > 0) {
    outcome.notices = notices;
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
