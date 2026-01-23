import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import { deriveOutputFolder, getClasspaths } from './classpathService';
import { primeSourcepathsCache } from './pathResolver';
import {
  findOutputFolderFromProject,
  hasClassTargets,
  isBytecodeTarget,
} from './outputResolver';

export const NO_CLASS_TARGETS_CODE = 'no-class-targets';
export const NO_CLASS_TARGETS_MESSAGE =
  'SpotBugs could not build the project. Run a manual build, then try again.';

export interface AnalysisTarget {
  targetPath: string;
  preferredProject?: Uri;
  classpaths?: string[];
  sourcepaths?: string[];
}

export interface TargetResolutionOk {
  status: 'ok';
  target: AnalysisTarget;
}

export interface TargetResolutionFailure {
  status: 'no-class-targets';
  errorCode: string;
  message: string;
}

export type TargetResolution = TargetResolutionOk | TargetResolutionFailure;

export interface TargetResolverDeps {
  getClasspaths: typeof getClasspaths;
  deriveOutputFolder: typeof deriveOutputFolder;
  findOutputFolderFromProject: typeof findOutputFolderFromProject;
  hasClassTargets: typeof hasClassTargets;
  isBytecodeTarget: typeof isBytecodeTarget;
  primeSourcepathsCache: typeof primeSourcepathsCache;
  getWorkspaceFolder: typeof workspace.getWorkspaceFolder;
  dirname: typeof path.dirname;
  logger: typeof Logger;
}

const defaultDeps: TargetResolverDeps = {
  getClasspaths,
  deriveOutputFolder,
  findOutputFolderFromProject,
  hasClassTargets,
  isBytecodeTarget,
  primeSourcepathsCache,
  getWorkspaceFolder: workspace.getWorkspaceFolder,
  dirname: path.dirname,
  logger: Logger,
};

export function createTargetResolver(overrides: Partial<TargetResolverDeps> = {}) {
  const deps: TargetResolverDeps = { ...defaultDeps, ...overrides };

  type ClasspathInfo = {
    classpaths?: string[];
    sourcepaths?: string[];
    outputPath?: string;
  };

  function noClassTargets(logMessage?: string): TargetResolutionFailure {
    if (logMessage) {
      deps.logger.log(logMessage);
    }
    return {
      status: 'no-class-targets',
      errorCode: NO_CLASS_TARGETS_CODE,
      message: NO_CLASS_TARGETS_MESSAGE,
    };
  }

  async function readClasspaths(
    project: Uri,
    options: { logSuccess?: boolean; logEmpty?: boolean; logFailure?: boolean }
  ): Promise<ClasspathInfo> {
    let classpaths: string[] | undefined;
    let sourcepaths: string[] | undefined;
    let outputPath: string | undefined;

    try {
      const cp = await deps.getClasspaths(project, { logFailures: options.logFailure });
      if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
        classpaths = cp.classpaths;
        if (options.logSuccess) {
          deps.logger.log(`Set ${cp.classpaths.length} classpaths for analysis`);
        }
      } else if (options.logEmpty) {
        deps.logger.log('No classpaths returned from Java Language Server; using system classpath');
      }
      outputPath = cp?.output;
      if (Array.isArray(cp?.sourcepaths)) {
        sourcepaths = cp.sourcepaths;
        deps.primeSourcepathsCache(cp.sourcepaths);
      }
    } catch (error) {
      if (options.logFailure) {
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.log(
          `Warning: Could not get project classpaths (${message}), using system classpath`
        );
      }
    }

    return { classpaths, sourcepaths, outputPath };
  }

  async function resolveOutputPath(
    classpaths: string[] | undefined,
    outputPath: string | undefined,
    classpathsRoot: string,
    projectRoot: string
  ): Promise<string | undefined> {
    let resolved = outputPath;
    if (!resolved && Array.isArray(classpaths)) {
      resolved = await deps.deriveOutputFolder(classpaths, classpathsRoot);
    }
    if (!resolved) {
      resolved = await deps.findOutputFolderFromProject(projectRoot);
    }
    return resolved;
  }

  async function resolveFileAnalysisTarget(uri: Uri): Promise<TargetResolution> {
    const { classpaths, sourcepaths, outputPath } = await readClasspaths(uri, {
      logSuccess: true,
      logEmpty: true,
      logFailure: true,
    });

    const targetPath = uri.fsPath;
    if (!deps.isBytecodeTarget(targetPath)) {
      const workspaceFolder = deps.getWorkspaceFolder(uri);
      const workspacePath = workspaceFolder?.uri.fsPath ?? deps.dirname(targetPath);
      const resolvedOutput = await resolveOutputPath(
        classpaths,
        outputPath,
        workspacePath,
        workspacePath
      );
      if (!resolvedOutput || !(await deps.hasClassTargets(resolvedOutput))) {
        return noClassTargets(
          `Skipping SpotBugs analysis for ${targetPath}: no compiled classes found.`
        );
      }
    } else if (!(await deps.hasClassTargets(targetPath))) {
      return noClassTargets(
        `Skipping SpotBugs analysis for ${targetPath}: target does not exist.`
      );
    }

    return {
      status: 'ok',
      target: {
        targetPath,
        preferredProject: uri,
        classpaths,
        sourcepaths,
      },
    };
  }

  async function resolveProjectAnalysisTarget(
    projectUri: Uri,
    workspaceFolder: Uri
  ): Promise<TargetResolution> {
    const projectUriString = projectUri.toString();
    const { classpaths, sourcepaths, outputPath } = await readClasspaths(projectUri, {
      logEmpty: true,
      logFailure: true,
    });
    const projectRoot =
      projectUri.scheme === 'file' ? projectUri.fsPath : workspaceFolder.fsPath;
    const resolvedOutput = await resolveOutputPath(
      classpaths,
      outputPath,
      workspaceFolder.fsPath,
      projectRoot
    );
    if (!resolvedOutput) {
      return noClassTargets(
        `Skipping SpotBugs analysis for ${projectUriString}: no output folder.`
      );
    }

    if (!(await deps.hasClassTargets(resolvedOutput))) {
      return noClassTargets(
        `Skipping SpotBugs analysis for ${projectUriString}: no compiled classes in ${resolvedOutput}`
      );
    }

    return {
      status: 'ok',
      target: {
        targetPath: resolvedOutput,
        preferredProject: projectUri,
        classpaths,
        sourcepaths,
      },
    };
  }

  return { resolveFileAnalysisTarget, resolveProjectAnalysisTarget };
}

const defaultResolver = createTargetResolver();

export async function resolveFileAnalysisTarget(uri: Uri): Promise<TargetResolution> {
  return defaultResolver.resolveFileAnalysisTarget(uri);
}

export async function resolveProjectAnalysisTarget(
  projectUri: Uri,
  workspaceFolder: Uri
): Promise<TargetResolution> {
  return defaultResolver.resolveProjectAnalysisTarget(projectUri, workspaceFolder);
}
