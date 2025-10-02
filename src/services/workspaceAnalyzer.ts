import { CancellationToken, Uri } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import { BugInfo } from '../models/bugInfo';
import { ProjectRef, deriveOutputFolder, getClasspaths } from './classpathService';
import { JavaLsClient } from './javaLsClient';
import { runConfiguredAnalysis } from './analyzer';
import { primeSourcepathsCache } from './pathResolver';

export interface ProjectResult {
  projectUri: string;
  findings: BugInfo[];
  error?: string;
}

export interface WorkspaceResult {
  results: ProjectResult[];
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

export async function analyzeProject(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<ProjectResult> {
  const projectUri = normalizeProjectRef(project);
  const projectUriString = projectUri.toString();

  try {
    const cp = await getClasspaths(projectUri);
    let classpaths: string[] | undefined;
    if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
      classpaths = cp.classpaths;
      config.setClasspaths(classpaths);
    }

    if (Array.isArray(cp?.sourcepaths)) {
      primeSourcepathsCache(cp.sourcepaths);
    }

    let outputPath: string | undefined = cp?.output;
    if (!outputPath && Array.isArray(classpaths)) {
      outputPath = await deriveOutputFolder(classpaths, workspaceFolder.fsPath);
    }
    if (!outputPath) {
      throw new Error('No output folder determined');
    }

    const findings = await runConfiguredAnalysis(config, outputPath, projectUri);
    return { projectUri: projectUriString, findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { projectUri: projectUriString, findings: [], error: message };
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
