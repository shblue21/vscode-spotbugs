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

export type TargetResolution =
  | { status: 'ok'; target: AnalysisTarget }
  | { status: 'no-class-targets'; errorCode: string; message: string };

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

  async function resolveFileAnalysisTarget(uri: Uri): Promise<TargetResolution> {
    let classpaths: string[] | undefined;
    let sourcepaths: string[] | undefined;
    let outputPath: string | undefined;

    try {
      const cp = await deps.getClasspaths(uri);
      if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
        classpaths = cp.classpaths;
        deps.logger.log(`Set ${cp.classpaths.length} classpaths for analysis`);
      } else {
        deps.logger.log('No classpaths returned from Java Language Server; using system classpath');
      }
      outputPath = cp?.output;
      if (Array.isArray(cp?.sourcepaths)) {
        sourcepaths = cp.sourcepaths;
        deps.primeSourcepathsCache(cp.sourcepaths);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.logger.log(
        `Warning: Could not get project classpaths (${message}), using system classpath`
      );
    }

    const targetPath = uri.fsPath;
    if (!deps.isBytecodeTarget(targetPath)) {
      if (!outputPath && Array.isArray(classpaths)) {
        const workspaceFolder = deps.getWorkspaceFolder(uri);
        const workspacePath = workspaceFolder?.uri.fsPath ?? deps.dirname(targetPath);
        outputPath = await deps.deriveOutputFolder(classpaths, workspacePath);
      }
      if (!outputPath) {
        const workspaceFolder = deps.getWorkspaceFolder(uri);
        const workspacePath = workspaceFolder?.uri.fsPath ?? deps.dirname(targetPath);
        outputPath = await deps.findOutputFolderFromProject(workspacePath);
      }
      if (!outputPath || !(await deps.hasClassTargets(outputPath))) {
        deps.logger.log(
          `Skipping SpotBugs analysis for ${targetPath}: no compiled classes found.`
        );
        return {
          status: 'no-class-targets',
          errorCode: NO_CLASS_TARGETS_CODE,
          message: NO_CLASS_TARGETS_MESSAGE,
        };
      }
    } else if (!(await deps.hasClassTargets(targetPath))) {
      deps.logger.log(`Skipping SpotBugs analysis for ${targetPath}: target does not exist.`);
      return {
        status: 'no-class-targets',
        errorCode: NO_CLASS_TARGETS_CODE,
        message: NO_CLASS_TARGETS_MESSAGE,
      };
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
    const cp = await deps.getClasspaths(projectUri);
    let classpaths: string[] | undefined;
    let sourcepaths: string[] | undefined;

    if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
      classpaths = cp.classpaths;
    }

    if (Array.isArray(cp?.sourcepaths)) {
      sourcepaths = cp.sourcepaths;
      deps.primeSourcepathsCache(cp.sourcepaths);
    }

    let outputPath: string | undefined = cp?.output;
    if (!outputPath && Array.isArray(classpaths)) {
      outputPath = await deps.deriveOutputFolder(classpaths, workspaceFolder.fsPath);
    }
    if (!outputPath) {
      const projectRoot = projectUri.scheme === 'file' ? projectUri.fsPath : workspaceFolder.fsPath;
      outputPath = await deps.findOutputFolderFromProject(projectRoot);
    }
    if (!outputPath) {
      deps.logger.log(`Skipping SpotBugs analysis for ${projectUriString}: no output folder.`);
      return {
        status: 'no-class-targets',
        errorCode: NO_CLASS_TARGETS_CODE,
        message: NO_CLASS_TARGETS_MESSAGE,
      };
    }

    if (!(await deps.hasClassTargets(outputPath))) {
      deps.logger.log(
        `Skipping SpotBugs analysis for ${projectUriString}: no compiled classes in ${outputPath}`
      );
      return {
        status: 'no-class-targets',
        errorCode: NO_CLASS_TARGETS_CODE,
        message: NO_CLASS_TARGETS_MESSAGE,
      };
    }

    return {
      status: 'ok',
      target: {
        targetPath: outputPath,
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
