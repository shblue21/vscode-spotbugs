import { CancellationToken, Uri } from 'vscode';
import * as path from 'path';
import { executeJavaLanguageServerCommand } from '../core/command';
import { SpotBugsLSCommands } from '../constants/commands';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import { BugInfo } from '../models/bugInfo';
import { getClasspaths, ProjectRef, deriveOutputFolder } from './classpathService';
import { JavaLsClient } from './javaLsClient';
import { addFullPaths, primeSourcepathsCache } from './pathResolver';
import { defaultNotifier } from '../core/notifier';

type AnalysisError = {
  code?: string;
  message?: string;
};

type AnalysisStats = {
  target?: string;
  durationMs?: number;
  findingCount?: number;
  spotbugsVersion?: string;
  classpathCount?: number;
  pluginCount?: number;
};

type AnalysisResponse = {
  schemaVersion?: number;
  results?: BugInfo[];
  errors?: AnalysisError[];
  stats?: AnalysisStats;
};

type AnalysisContext = {
  targetPath: string;
  preferredProject?: Uri;
  classpaths?: string[] | null;
  sourcepaths?: string[] | null;
};

type AnalysisOptions = {
  notify?: boolean;
};

export interface ProjectResult {
  projectUri: string;
  findings: BugInfo[];
  error?: string;
}

export interface WorkspaceResult {
  results: ProjectResult[];
}

export async function analyzeFile(config: Config, uri: Uri): Promise<BugInfo[]> {
  try {
    let classpaths: string[] | undefined;
    let sourcepaths: string[] | undefined;
    if (uri.fsPath.endsWith('.java') || uri.fsPath.endsWith('.class')) {
      try {
        const cp = await getClasspaths(uri);
        if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
          classpaths = cp.classpaths;
          Logger.log(`Set ${cp.classpaths.length} classpaths for analysis`);
        } else {
          Logger.log('No classpaths returned from Java Language Server; using system classpath');
        }
        if (Array.isArray(cp?.sourcepaths)) {
          sourcepaths = cp.sourcepaths;
          primeSourcepathsCache(cp.sourcepaths);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.log(
          `Warning: Could not get project classpaths (${message}), using system classpath`
        );
      }
    }

    return await runAnalysis(
      config,
      { targetPath: uri.fsPath, preferredProject: uri, classpaths, sourcepaths },
      { notify: true }
    );
  } catch (error) {
    Logger.error('Analyzer: analyzeFile failed', error);
    return [];
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

  for (let index = 0; index < projectUris.length; index++) {
    const uriString = projectUris[index];
    if (token?.isCancellationRequested) {
      Logger.log('Workspace analysis cancelled by user.');
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

  return { results };
}

export async function getWorkspaceProjects(workspaceFolder: Uri): Promise<string[]> {
  let projectUris: string[] = await JavaLsClient.getAllProjects();
  projectUris = projectUris.filter((uriString) => {
    try {
      const fsPath = Uri.parse(uriString).fsPath;
      return path.basename(fsPath) !== 'jdt.ls-java-project';
    } catch {
      return true;
    }
  });

  if (projectUris.length === 0) {
    projectUris = [workspaceFolder.toString()];
    Logger.log('No Java projects from LS; falling back to workspace folder analysis.');
  } else {
    Logger.log(`Workspace contains ${projectUris.length} Java projects.`);
  }

  return projectUris;
}

async function analyzeProject(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<ProjectResult> {
  const projectUri = normalizeProjectRef(project);
  const projectUriString = projectUri.toString();

  try {
    const cp = await getClasspaths(projectUri);
    let classpaths: string[] | undefined;
    let sourcepaths: string[] | undefined;
    if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
      classpaths = cp.classpaths;
    }

    if (Array.isArray(cp?.sourcepaths)) {
      sourcepaths = cp.sourcepaths;
      primeSourcepathsCache(cp.sourcepaths);
    }

    let outputPath: string | undefined = cp?.output;
    if (!outputPath && Array.isArray(classpaths)) {
      outputPath = await deriveOutputFolder(classpaths, workspaceFolder.fsPath);
    }
    if (!outputPath) {
      throw new Error('No output folder determined');
    }

    const findings = await runAnalysis(
      config,
      { targetPath: outputPath, preferredProject: projectUri, classpaths, sourcepaths },
      { notify: false }
    );
    return { projectUri: projectUriString, findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { projectUri: projectUriString, findings: [], error: message };
  }
}

async function runAnalysis(
  config: Config,
  context: AnalysisContext,
  options: AnalysisOptions = {}
): Promise<BugInfo[]> {
  const notify = options.notify !== false;
  const payload = config.toJSON({
    classpaths: context.classpaths ?? null,
    sourcepaths: context.sourcepaths ?? null,
  });
  const result = await executeJavaLanguageServerCommand<string>(
    SpotBugsLSCommands.RUN_ANALYSIS,
    context.targetPath,
    JSON.stringify(payload)
  );

  if (!result) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch (error) {
    Logger.error('Failed to parse analysis result', error);
    if (notify) {
      defaultNotifier.error('SpotBugs analysis failed: Invalid response payload.');
    }
    return [];
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as { error?: unknown }).error
  ) {
    const message = String((parsed as { error?: unknown }).error);
    Logger.error(`SpotBugs analysis error: ${message}`);
    if (notify) {
      defaultNotifier.error(`SpotBugs analysis failed: ${message}`);
    }
    return [];
  }

  let bugs: BugInfo[] = [];
  let stats: AnalysisStats | undefined;

  if (Array.isArray(parsed)) {
    bugs = parsed as BugInfo[];
  } else if (parsed && typeof parsed === 'object') {
    const envelope = parsed as AnalysisResponse;
    if (typeof envelope.schemaVersion === 'number' && envelope.schemaVersion !== 1) {
      Logger.log(`Unexpected analysis response schemaVersion=${envelope.schemaVersion}`);
    }
    if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
      const messages = envelope.errors.map((err) => {
        const code = err.code ? `[${err.code}]` : '';
        const message = err.message || 'Unknown error';
        return `${code} ${message}`.trim();
      });
      const combined = messages.join('; ');
      Logger.error(`SpotBugs analysis error: ${combined}`);
      const hasResults = Array.isArray(envelope.results) && envelope.results.length > 0;
      if (notify) {
        if (hasResults) {
          defaultNotifier.warn(`SpotBugs analysis completed with warnings: ${combined}`);
        } else {
          defaultNotifier.error(`SpotBugs analysis failed: ${combined}`);
        }
      }
      if (!hasResults) {
        return [];
      }
    }
    if (Array.isArray(envelope.results)) {
      bugs = envelope.results;
    }
    stats = envelope.stats;
  }

  const withFullPaths = await addFullPaths(bugs, context.preferredProject);
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
  if (typeof stats?.pluginCount === 'number') {
    logParts.push(`pluginCount=${stats.pluginCount}`);
  }
  Logger.log(`Successfully parsed and added full paths (${logParts.join(', ')}).`);
  return withFullPaths;
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
