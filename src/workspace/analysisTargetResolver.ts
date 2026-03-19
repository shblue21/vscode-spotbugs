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
  targetResolutionRoots?: string[];
  runtimeClasspaths?: string[];
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
    targetResolutionRoots?: string[];
    runtimeClasspaths?: string[];
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
    let targetResolutionRoots: string[] | undefined;
    let runtimeClasspaths: string[] | undefined;
    let sourcepaths: string[] | undefined;
    let outputPath: string | undefined;

    try {
      const cp = await deps.getClasspaths(project, { logFailures: options.logFailure });
      if (cp && Array.isArray(cp.runtimeClasspaths) && cp.runtimeClasspaths.length > 0) {
        runtimeClasspaths = cp.runtimeClasspaths;
        if (options.logSuccess) {
          deps.logger.log(
            `Set ${cp.runtimeClasspaths.length} runtime classpaths and ${cp.targetResolutionRoots.length} target-resolution roots for analysis`
          );
        }
      } else if (options.logEmpty) {
        deps.logger.log(
          'No runtime classpaths returned from Java Language Server; target resolution will use output folder fallbacks, and aux analysis may fall back to explicit extras or the system classpath.'
        );
      }
      if (Array.isArray(cp?.targetResolutionRoots) && cp.targetResolutionRoots.length > 0) {
        targetResolutionRoots = cp.targetResolutionRoots;
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
          `Warning: Could not get project runtime classpaths (${message}); target resolution will use output folder fallbacks, and aux analysis may fall back to explicit extras or the system classpath.`
        );
      }
    }

    return { targetResolutionRoots, runtimeClasspaths, sourcepaths, outputPath };
  }

  async function resolveOutputPath(
    targetResolutionRoots: string[] | undefined,
    outputPath: string | undefined,
    classpathsRoot: string,
    projectRoot: string
  ): Promise<string | undefined> {
    let resolved = outputPath;
    if (!resolved && Array.isArray(targetResolutionRoots)) {
      resolved = await deps.deriveOutputFolder(targetResolutionRoots, classpathsRoot);
    }
    if (!resolved) {
      resolved = await deps.findOutputFolderFromProject(projectRoot);
    }
    return resolved;
  }

  async function resolveFileAnalysisTarget(uri: Uri): Promise<TargetResolution> {
    const { targetResolutionRoots, runtimeClasspaths, sourcepaths, outputPath } =
      await readClasspaths(uri, {
      logSuccess: true,
      logEmpty: true,
      logFailure: true,
      });

    const targetPath = uri.fsPath;
    if (!deps.isBytecodeTarget(targetPath)) {
      const workspaceFolder = deps.getWorkspaceFolder(uri);
      const workspacePath = workspaceFolder?.uri.fsPath ?? deps.dirname(targetPath);
      const resolvedOutput = await resolveOutputPath(
        targetResolutionRoots,
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
        targetResolutionRoots,
        runtimeClasspaths,
        sourcepaths,
      },
    };
  }

  async function resolveProjectAnalysisTarget(
    projectUri: Uri,
    workspaceFolder: Uri
  ): Promise<TargetResolution> {
    const projectUriString = projectUri.toString();
    const { targetResolutionRoots, runtimeClasspaths, sourcepaths, outputPath } =
      await readClasspaths(projectUri, {
        logEmpty: true,
        logFailure: true,
      });
    const projectRoot =
      projectUri.scheme === 'file' ? projectUri.fsPath : workspaceFolder.fsPath;
    const resolvedOutput = await resolveOutputPath(
      targetResolutionRoots,
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
        targetResolutionRoots,
        runtimeClasspaths,
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
