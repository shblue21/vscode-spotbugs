import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import {
  deriveOutputFolder,
  getClasspathsOutcome,
} from './classpathService';
import { primeSourcepathsCache } from './pathResolver';
import { NO_CLASS_TARGETS_CODE, NO_CLASS_TARGETS_MESSAGE } from './analysisTargetCodes';
import {
  findOutputFolderFromProject,
  hasClassTargets,
  isBytecodeTarget,
} from './outputResolver';

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

export interface TargetResolutionResult {
  resolution: TargetResolution;
  issues: AnalysisResolutionIssue[];
}

export interface TargetResolverDeps {
  getClasspathsOutcome: typeof getClasspathsOutcome;
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
  getClasspathsOutcome,
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
    issues: AnalysisResolutionIssue[];
  };

  type OutputResolution = {
    outputPath?: string;
    usedFallback: boolean;
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
    let issues: AnalysisResolutionIssue[] = [];

    try {
      const outcome = await deps.getClasspathsOutcome(project, {
        logFailures: options.logFailure,
      });
      issues = outcome.issues;
      const cp = outcome.status === 'resolved' ? outcome.classpath : undefined;

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

    return { targetResolutionRoots, runtimeClasspaths, sourcepaths, outputPath, issues };
  }

  async function resolveOutputPath(
    targetResolutionRoots: string[] | undefined,
    outputPath: string | undefined,
    classpathsRoot: string,
    projectRoot: string
  ): Promise<OutputResolution> {
    let resolved = outputPath;
    let usedFallback = false;

    if (!resolved && Array.isArray(targetResolutionRoots)) {
      resolved = await deps.deriveOutputFolder(targetResolutionRoots, classpathsRoot);
      usedFallback = !!resolved;
    }

    if (!resolved) {
      resolved = await deps.findOutputFolderFromProject(projectRoot);
      usedFallback = !!resolved;
    }

    return {
      outputPath: resolved,
      usedFallback,
    };
  }

  async function resolveFileAnalysisTargetDetailed(
    uri: Uri
  ): Promise<TargetResolutionResult> {
    const { targetResolutionRoots, runtimeClasspaths, sourcepaths, outputPath, issues } =
      await readClasspaths(uri, {
      logSuccess: true,
      logEmpty: true,
      logFailure: true,
    });
    const resolutionIssues = [...issues];

    const targetPath = uri.fsPath;
    if (!deps.isBytecodeTarget(targetPath)) {
      const workspaceFolder = deps.getWorkspaceFolder(uri);
      const workspacePath = workspaceFolder?.uri.fsPath ?? deps.dirname(targetPath);
      const outputResolution = await resolveOutputPath(
        targetResolutionRoots,
        outputPath,
        workspacePath,
        workspacePath
      );
      if (
        !outputResolution.outputPath ||
        !(await deps.hasClassTargets(outputResolution.outputPath))
      ) {
        return {
          resolution: noClassTargets(
          `Skipping SpotBugs analysis for ${targetPath}: no compiled classes found.`
          ),
          issues: resolutionIssues,
        };
      }

      if (outputResolution.usedFallback) {
        resolutionIssues.push(createOutputFallbackIssue());
      }
    } else if (!(await deps.hasClassTargets(targetPath))) {
      return {
        resolution: noClassTargets(
          `Skipping SpotBugs analysis for ${targetPath}: target does not exist.`
        ),
        issues: resolutionIssues,
      };
    }

    return {
      resolution: {
        status: 'ok',
        target: {
          targetPath,
          preferredProject: uri,
          targetResolutionRoots,
          runtimeClasspaths,
          sourcepaths,
        },
      },
      issues: resolutionIssues,
    };
  }

  async function resolveProjectAnalysisTargetDetailed(
    projectUri: Uri,
    workspaceFolder: Uri
  ): Promise<TargetResolutionResult> {
    const projectUriString = projectUri.toString();
    const { targetResolutionRoots, runtimeClasspaths, sourcepaths, outputPath, issues } =
      await readClasspaths(projectUri, {
        logEmpty: true,
        logFailure: true,
      });
    const resolutionIssues = [...issues];
    const projectRoot =
      projectUri.scheme === 'file' ? projectUri.fsPath : workspaceFolder.fsPath;
    const outputResolution = await resolveOutputPath(
      targetResolutionRoots,
      outputPath,
      workspaceFolder.fsPath,
      projectRoot
    );
    if (!outputResolution.outputPath) {
      return {
        resolution: noClassTargets(
          `Skipping SpotBugs analysis for ${projectUriString}: no output folder.`
        ),
        issues: resolutionIssues,
      };
    }

    if (!(await deps.hasClassTargets(outputResolution.outputPath))) {
      return {
        resolution: noClassTargets(
          `Skipping SpotBugs analysis for ${projectUriString}: no compiled classes in ${outputResolution.outputPath}`
        ),
        issues: resolutionIssues,
      };
    }

    if (outputResolution.usedFallback) {
      resolutionIssues.push(createOutputFallbackIssue());
    }

    return {
      resolution: {
        status: 'ok',
        target: {
          targetPath: outputResolution.outputPath,
          preferredProject: projectUri,
          targetResolutionRoots,
          runtimeClasspaths,
          sourcepaths,
        },
      },
      issues: resolutionIssues,
    };
  }

  async function resolveFileAnalysisTarget(uri: Uri): Promise<TargetResolution> {
    const result = await resolveFileAnalysisTargetDetailed(uri);
    return result.resolution;
  }

  async function resolveProjectAnalysisTarget(
    projectUri: Uri,
    workspaceFolder: Uri
  ): Promise<TargetResolution> {
    const result = await resolveProjectAnalysisTargetDetailed(projectUri, workspaceFolder);
    return result.resolution;
  }

  return {
    resolveFileAnalysisTarget,
    resolveFileAnalysisTargetDetailed,
    resolveProjectAnalysisTarget,
    resolveProjectAnalysisTargetDetailed,
  };
}

const defaultResolver = createTargetResolver();

export async function resolveFileAnalysisTargetDetailed(
  uri: Uri
): Promise<TargetResolutionResult> {
  return defaultResolver.resolveFileAnalysisTargetDetailed(uri);
}

export async function resolveFileAnalysisTarget(uri: Uri): Promise<TargetResolution> {
  return defaultResolver.resolveFileAnalysisTarget(uri);
}

export async function resolveProjectAnalysisTargetDetailed(
  projectUri: Uri,
  workspaceFolder: Uri
): Promise<TargetResolutionResult> {
  return defaultResolver.resolveProjectAnalysisTargetDetailed(projectUri, workspaceFolder);
}

export async function resolveProjectAnalysisTarget(
  projectUri: Uri,
  workspaceFolder: Uri
): Promise<TargetResolution> {
  return defaultResolver.resolveProjectAnalysisTarget(projectUri, workspaceFolder);
}

function createOutputFallbackIssue(): AnalysisResolutionIssue {
  return {
    code: 'OUTPUT_FALLBACK_USED',
    level: 'info',
    source: 'target-resolution',
    phase: 'output-fallback',
    message: 'Output folder fallback was used because Java build output metadata was unavailable.',
  };
}
