import { Uri, workspace } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../core/logger';
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import {
  deriveOutputFolder,
  filterAdmissibleTargetResolutionRoots,
  getClasspathsOutcome,
} from './classpathService';
import { primeSourcepathsCache } from './pathResolver';
import { NO_CLASS_TARGETS_CODE, NO_CLASS_TARGETS_MESSAGE } from './analysisTargetCodes';
import {
  findOutputFolderFromProject,
  hasClassTargets,
  hasLooseClassTargets,
  isBytecodeTarget,
  orderOutputFolderCandidates,
  type OutputFolderSelectionOptions,
} from './outputResolver';

export interface AnalysisTarget {
  targetPath: string;
  preferredProject?: Uri;
  targetResolutionRoots?: string[];
  runtimeClasspaths?: string[];
  sourcepaths?: string[];
  diagnosticScope?: DiagnosticUpdateScope;
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
  hasLooseClassTargets: typeof hasLooseClassTargets;
  isBytecodeTarget: typeof isBytecodeTarget;
  containsJavaSources: typeof containsJavaSources;
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
  hasLooseClassTargets,
  isBytecodeTarget,
  containsJavaSources,
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
    targetResolutionRoots: string[];
  };

  type ResolveOutputPathOptions = OutputFolderSelectionOptions & {
    allowFallbackFromUnusableOutput?: boolean;
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
    outputPathRoot: string,
    targetRootsBoundary: string,
    projectRoot: string,
    hasTargets: (targetPath: string) => Promise<boolean> = deps.hasClassTargets,
    options: ResolveOutputPathOptions = {}
  ): Promise<OutputResolution> {
    const scopedTargetResolutionRoots = Array.isArray(targetResolutionRoots)
      ? filterAdmissibleTargetResolutionRoots(
          targetResolutionRoots,
          targetRootsBoundary,
          options
        )
      : [];
    const usableTargetResolutionRoots = await filterTargetResolutionRootsWithTargets(
      scopedTargetResolutionRoots,
      hasTargets
    );
    const admissibleOutputPath = outputPath
      ? filterAdmissibleTargetResolutionRoots([outputPath], outputPathRoot, options)[0]
      : undefined;
    if (
      admissibleOutputPath &&
      (!options.allowFallbackFromUnusableOutput ||
        (await hasTargets(admissibleOutputPath)))
    ) {
      return {
        outputPath: admissibleOutputPath,
        usedFallback: false,
        targetResolutionRoots: usableTargetResolutionRoots,
      };
    }

    let resolved: string | undefined;

    if (usableTargetResolutionRoots.length > 0) {
      resolved = await deps.deriveOutputFolder(
        usableTargetResolutionRoots,
        targetRootsBoundary,
        hasTargets,
        options
      );
      if (resolved) {
        return {
          outputPath: resolved,
          usedFallback: true,
          targetResolutionRoots: usableTargetResolutionRoots,
        };
      }
    }

    resolved = await deps.findOutputFolderFromProject(
      projectRoot,
      hasTargets,
      options
    );
    if (resolved) {
      return {
        outputPath: resolved,
        usedFallback: true,
        targetResolutionRoots: [],
      };
    }

    return {
      outputPath: undefined,
      usedFallback: false,
      targetResolutionRoots: usableTargetResolutionRoots,
    };
  }

  async function filterTargetResolutionRootsWithTargets(
    targetResolutionRoots: readonly string[],
    hasTargets: (targetPath: string) => Promise<boolean>
  ): Promise<string[]> {
    const result: string[] = [];
    for (const targetRoot of targetResolutionRoots) {
      if (await hasTargets(targetRoot)) {
        result.push(targetRoot);
      }
    }
    return result;
  }

  function createOutputTargetPredicate(
    targetPath: string,
    sourcepaths: readonly string[] | undefined,
    requiresMappedLooseOutput: boolean,
    isJavaSourceTarget: boolean,
    directTargetHasClassTargets: boolean
  ): (targetPath: string) => Promise<boolean> {
    if (!requiresMappedLooseOutput) {
      if (directTargetHasClassTargets) {
        return deps.hasClassTargets;
      }
      return (outputRoot: string) =>
        hasMappedJavaSourceTreeClassTarget(
          targetPath,
          outputRoot,
          sourcepaths,
          deps.hasClassTargets
        );
    }
    if (isJavaSourceTarget) {
      return (outputRoot: string) =>
        hasJavaSourceClassTarget(
          targetPath,
          outputRoot,
          sourcepaths,
          deps.hasClassTargets
        );
    }
    return (outputRoot: string) =>
      hasJavaSourceDirectoryClassTarget(
        targetPath,
        outputRoot,
        sourcepaths,
        deps.hasLooseClassTargets
      );
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
    let resolvedOutputPath: string | undefined;
    let targetRootCandidates = targetResolutionRoots ?? [];
    let isJavaSourceDirectoryTarget = false;
    if (!deps.isBytecodeTarget(targetPath)) {
      const isJavaSourceTarget = isJavaSourceFile(targetPath);
      isJavaSourceDirectoryTarget = await isJavaSourceDirectoryPath(
        targetPath,
        sourcepaths,
        deps.containsJavaSources
      );
      const requiresMappedLooseOutput =
        isJavaSourceTarget || isJavaSourceDirectoryTarget;
      const directTargetHasClassTargets =
        !requiresMappedLooseOutput && (await deps.hasClassTargets(targetPath));
      const outputHasTargets = createOutputTargetPredicate(
        targetPath,
        sourcepaths,
        requiresMappedLooseOutput,
        isJavaSourceTarget,
        directTargetHasClassTargets
      );
      const outputSelectionOptions = requiresMappedLooseOutput
        ? createJavaSourceOutputSelectionOptions(targetPath, sourcepaths)
        : undefined;
      const workspaceFolder = deps.getWorkspaceFolder(uri);
      const workspacePath = workspaceFolder?.uri.fsPath ?? deps.dirname(targetPath);
      const targetRootsBoundary = inferAnalysisFallbackRoot(
        targetPath,
        sourcepaths,
        outputPath,
        workspacePath,
        requiresMappedLooseOutput
      );
      const outputPathRoot = inferOutputPathRoot(
        targetPath,
        outputPath,
        targetRootsBoundary
      );
      const outputResolution = await resolveOutputPath(
        targetResolutionRoots,
        outputPath,
        outputPathRoot,
        targetRootsBoundary,
        targetRootsBoundary,
        outputHasTargets,
        {
          ...outputSelectionOptions,
          allowFallbackFromUnusableOutput:
            requiresMappedLooseOutput || !directTargetHasClassTargets,
          allowRecognizedOutputOutsideBoundary: false,
        }
      );
      resolvedOutputPath = outputResolution.outputPath;
      targetRootCandidates = outputResolution.targetResolutionRoots;
      const outputResolutionHasTargets =
        !!outputResolution.outputPath &&
        (await outputHasTargets(outputResolution.outputPath));
      if (!directTargetHasClassTargets && !outputResolutionHasTargets) {
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

    const classTargetRoots = orderClassTargetRootsForTarget(
      targetPath,
      sourcepaths,
      uniquePaths([resolvedOutputPath, ...targetRootCandidates]),
      isJavaSourceDirectoryTarget
    );

    return {
      resolution: {
        status: 'ok',
        target: {
          targetPath,
          preferredProject: uri,
          targetResolutionRoots:
            classTargetRoots.length > 0 ? classTargetRoots : targetResolutionRoots,
          runtimeClasspaths,
          sourcepaths,
          diagnosticScope: createDiagnosticScope(uri, targetPath, classTargetRoots),
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
    const targetRootsBoundary = inferAnalysisFallbackRoot(
      projectRoot,
      sourcepaths,
      outputPath,
      projectRoot,
      false
    );
    const outputPathRoot = inferOutputPathRoot(
      projectRoot,
      outputPath,
      targetRootsBoundary
    );
    const outputResolution = await resolveOutputPath(
      targetResolutionRoots,
      outputPath,
      outputPathRoot,
      targetRootsBoundary,
      projectRoot,
      deps.hasClassTargets,
      { allowRecognizedOutputOutsideBoundary: false }
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
    const classTargetRoots = uniquePaths([
      outputResolution.outputPath,
      ...outputResolution.targetResolutionRoots,
    ]);

    return {
      resolution: {
        status: 'ok',
        target: {
          targetPath: outputResolution.outputPath,
          preferredProject: projectUri,
          targetResolutionRoots: classTargetRoots,
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

const OUTPUT_PROJECT_ROOT_SUFFIXES = [
  '/build/classes/java/main',
  '/build/classes/kotlin/main',
  '/build/classes/java/test',
  '/build/classes/kotlin/test',
  '/target/test-classes',
  '/target/classes',
  '/bin/main',
  '/bin/test',
  '/out/production',
  '/build/classes',
  '/classes',
  '/bin',
  '/out',
];

function inferAnalysisFallbackRoot(
  targetPath: string,
  sourcepaths: readonly string[] | undefined,
  outputPath: string | undefined,
  workspacePath: string,
  useSourceMarkers: boolean
): string {
  if (useSourceMarkers) {
    const markerRoot = inferProjectRootFromSourceMarker(targetPath);
    if (markerRoot) {
      return markerRoot;
    }
  }

  const sourcepathRoot = inferProjectRootFromSourcepaths(targetPath, sourcepaths);
  if (sourcepathRoot) {
    return sourcepathRoot;
  }

  const outputProjectRoot = outputPath
    ? inferProjectRootFromOutputPath(outputPath)
    : undefined;
  if (
    outputProjectRoot &&
    isPathInsideOrEqual(outputProjectRoot, targetPath) &&
    !isPathInsideOrEqual(outputProjectRoot, workspacePath)
  ) {
    return outputProjectRoot;
  }

  return workspacePath;
}

function inferOutputPathRoot(
  targetPath: string,
  outputPath: string | undefined,
  targetRootsBoundary: string
): string {
  const outputProjectRoot = outputPath
    ? inferProjectRootFromOutputPath(outputPath)
    : undefined;
  if (outputProjectRoot && isPathInsideOrEqual(outputProjectRoot, targetPath)) {
    return outputProjectRoot;
  }
  return targetRootsBoundary;
}

function inferProjectRootFromOutputPath(outputPath: string): string | undefined {
  const normalized = normalizeForSourceSet(outputPath);
  for (const suffix of OUTPUT_PROJECT_ROOT_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      const root = normalized.slice(0, normalized.length - suffix.length);
      if (root) {
        return root;
      }
    }
  }
  return undefined;
}

function inferProjectRootFromSourceMarker(sourcePath: string): string | undefined {
  const normalized = normalizeForSourceSet(sourcePath);
  const markers = ['/src/main/java', '/src/test/java', '/src/java', '/src'];
  for (const marker of markers) {
    const markerWithChild = `${marker}/`;
    const markerIndex = normalized.indexOf(markerWithChild);
    if (markerIndex >= 0) {
      return normalized.substring(0, markerIndex);
    }
    if (normalized.endsWith(marker)) {
      return normalized.substring(0, normalized.length - marker.length);
    }
  }

  const generatedSourceRoot = inferProjectRootFromGeneratedSourcepath(normalized);
  if (generatedSourceRoot) {
    return generatedSourceRoot;
  }

  const javaRootIndex = normalized.lastIndexOf('/java/');
  if (javaRootIndex >= 0) {
    return normalized.substring(0, javaRootIndex);
  }
  if (normalized.endsWith('/java')) {
    return normalized.substring(0, normalized.length - '/java'.length);
  }

  return undefined;
}

function inferProjectRootFromSourcepaths(
  targetPath: string,
  sourcepaths: readonly string[] | undefined
): string | undefined {
  const sourcepathCandidates = sortSourcepathCandidates(
    normalizeSourcepathCandidates(sourcepaths).filter((candidate) =>
      isPathInsideOrEqual(candidate.root, targetPath)
    )
  );
  const sourcepathRoot = sourcepathCandidates[0]?.root;
  if (sourcepathRoot) {
    return inferProjectRootFromSourcepathRoot(sourcepathRoot);
  }

  const nestedSourcepathCandidates = sortSourcepathCandidates(
    normalizeSourcepathCandidates(sourcepaths).filter((candidate) =>
      isPathInsideOrEqual(targetPath, candidate.root)
    )
  );
  for (const candidate of nestedSourcepathCandidates) {
    const projectRoot = inferProjectRootFromSourcepathRoot(candidate.root);
    if (projectRoot && path.resolve(projectRoot) === path.resolve(targetPath)) {
      return projectRoot;
    }
  }

  return undefined;
}

function sortSourcepathCandidates<T extends { root: string; index: number }>(
  candidates: readonly T[]
): T[] {
  return [...candidates].sort(
    (a, b) =>
      path.resolve(b.root).length - path.resolve(a.root).length ||
      a.index - b.index
  );
}

function inferProjectRootFromSourcepathRoot(sourcepathRoot: string): string | undefined {
  const markerRoot = inferProjectRootFromSourceMarker(sourcepathRoot);
  if (markerRoot) {
    return markerRoot;
  }

  const generatedSourceRoot = inferProjectRootFromGeneratedSourcepath(sourcepathRoot);
  if (generatedSourceRoot) {
    return generatedSourceRoot;
  }

  const parent = path.dirname(sourcepathRoot);
  return parent && parent !== sourcepathRoot ? parent : undefined;
}

function inferProjectRootFromGeneratedSourcepath(
  sourcepathRoot: string
): string | undefined {
  const normalized = normalizeForSourceSet(sourcepathRoot);
  const markers = [
    '/target/generated-sources',
    '/target/generated-test-sources',
    '/build/generated/sources',
    '/build/generated/source',
    '/generated-sources',
    '/generated-test-sources',
    '/generated/main/java',
    '/generated/test/java',
    '/generated/java',
  ];
  for (const marker of markers) {
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }
    const markerEnd = markerIndex + marker.length;
    if (markerEnd !== normalized.length && normalized.charAt(markerEnd) !== '/') {
      continue;
    }
    const root = normalized.substring(0, markerIndex);
    if (root) {
      return root;
    }
  }
  return undefined;
}

function createOutputFallbackIssue(): AnalysisResolutionIssue {
  return {
    code: 'OUTPUT_FALLBACK_USED',
    level: 'info',
    source: 'target-resolution',
    phase: 'output-fallback',
    message: 'Output folder fallback was used because Java build output metadata was unavailable or unusable for the selected target.',
  };
}

function createDiagnosticScope(
  uri: Uri,
  targetPath: string,
  classTargetRoots: readonly string[] = []
): DiagnosticUpdateScope {
  const ext = path.extname(targetPath).toLowerCase();
  if (ext === '.java') {
    return { kind: 'file', uri };
  }
  if (
    ext === '.class' ||
    ext === '.jar' ||
    ext === '.zip' ||
    classTargetRoots.some((root) => isPathInsideOrEqual(root, targetPath))
  ) {
    return { kind: 'returned-files', uri };
  }
  return { kind: 'folder', uri };
}

async function hasJavaSourceClassTarget(
  sourcePath: string,
  outputRoot: string,
  sourcepaths: readonly string[] | undefined,
  hasClassTarget: (targetPath: string) => Promise<boolean>
): Promise<boolean> {
  for (const classPath of resolveJavaSourceClassPaths(sourcePath, outputRoot, sourcepaths)) {
    if (await hasClassTarget(classPath)) {
      return true;
    }
  }
  return false;
}

async function hasJavaSourceDirectoryClassTarget(
  sourceDir: string,
  outputRoot: string,
  sourcepaths: readonly string[] | undefined,
  hasLooseClassTarget: (targetPath: string) => Promise<boolean>
): Promise<boolean> {
  for (const relativeDir of deriveRelativeJavaSourceDirectoryPaths(
    sourceDir,
    sourcepaths
  )) {
    if (!relativeDir) {
      if (
        await hasMappedJavaSourceTreeClassTarget(
          sourceDir,
          outputRoot,
          sourcepaths,
          hasLooseClassTarget
        )
      ) {
        return true;
      }
      continue;
    }
    const outputDir = path.join(
      outputRoot,
      ...relativeDir.split(/[\\/]+/).filter(Boolean)
    );
    if (await hasLooseClassTarget(outputDir)) {
      return true;
    }
  }
  return false;
}

async function hasMappedJavaSourceTreeClassTarget(
  sourceDir: string,
  outputRoot: string,
  sourcepaths: readonly string[] | undefined,
  hasLooseClassTarget: (targetPath: string) => Promise<boolean>
): Promise<boolean> {
  const queue: string[] = [sourceDir];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile()) {
        if (
          isJavaSourceFile(entryPath) &&
          (await hasJavaSourceClassTarget(
            entryPath,
            outputRoot,
            sourcepaths,
            hasLooseClassTarget
          ))
        ) {
          return true;
        }
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
  return false;
}

function isJavaSourceFile(targetPath: string): boolean {
  return path.extname(targetPath).toLowerCase() === '.java';
}

async function containsJavaSources(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isFile()) {
      return isJavaSourceFile(targetPath);
    }
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const queue: string[] = [targetPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile()) {
        if (isJavaSourceFile(entryPath)) {
          return true;
        }
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
  return false;
}

async function isJavaSourceDirectoryPath(
  targetPath: string,
  sourcepaths: readonly string[] | undefined,
  containsJavaSources: (targetPath: string) => Promise<boolean>
): Promise<boolean> {
  return (
    deriveRelativeJavaSourceDirectoryPaths(targetPath, sourcepaths).length > 0 &&
    (await containsJavaSources(targetPath))
  );
}

type JavaSourceSet = 'main' | 'test' | 'unknown';

function createJavaSourceOutputSelectionOptions(
  sourcePath: string,
  sourcepaths: readonly string[] | undefined
): OutputFolderSelectionOptions {
  const sourceSet = inferJavaSourceSet(sourcePath, sourcepaths);
  if (sourceSet === 'unknown') {
    return {};
  }

  return {
    rankCandidate: ({ targetPath }) =>
      rankOutputFolderForSourceSet(targetPath, sourceSet),
  };
}

function orderClassTargetRootsForTarget(
  targetPath: string,
  sourcepaths: readonly string[] | undefined,
  classTargetRoots: readonly string[],
  isJavaSourceDirectoryTarget = false
): string[] {
  if (
    (!isJavaSourceFile(targetPath) &&
      !isJavaSourceDirectoryTarget) ||
    classTargetRoots.length < 2
  ) {
    return [...classTargetRoots];
  }
  const options = createJavaSourceOutputSelectionOptions(targetPath, sourcepaths);
  return orderOutputFolderCandidates(
    classTargetRoots.map((root, index) => ({ targetPath: root, index })),
    options
  ).map((candidate) => candidate.targetPath);
}

function inferJavaSourceSet(
  sourcePath: string,
  sourcepaths: readonly string[] | undefined
): JavaSourceSet {
  const sourcepathCandidates = sortSourcepathCandidates(
    normalizeSourcepathCandidates(sourcepaths).filter((candidate) =>
      isPathInsideOrEqual(candidate.root, sourcePath)
    )
  );

  for (const candidate of sourcepathCandidates) {
    const sourceSet = classifyJavaSourcePath(candidate.root);
    if (sourceSet !== 'unknown') {
      return sourceSet;
    }
  }

  return classifyJavaSourcePath(sourcePath);
}

function rankOutputFolderForSourceSet(
  targetPath: string,
  sourceSet: Exclude<JavaSourceSet, 'unknown'>
): number {
  const outputSet = classifyJavaOutputPath(targetPath);
  if (outputSet === sourceSet) {
    return 0;
  }
  if (outputSet === 'unknown') {
    return 1;
  }
  return 2;
}

function classifyJavaSourcePath(sourcePath: string): JavaSourceSet {
  const normalized = normalizeForSourceSet(sourcePath);
  if (
    normalized.includes('/src/test/java/') ||
    normalized.endsWith('/src/test/java') ||
    normalized.includes('/src/test/') ||
    normalized.endsWith('/src/test')
  ) {
    return 'test';
  }
  if (
    normalized.includes('/src/main/java/') ||
    normalized.endsWith('/src/main/java') ||
    normalized.includes('/src/main/') ||
    normalized.endsWith('/src/main')
  ) {
    return 'main';
  }
  return 'unknown';
}

function classifyJavaOutputPath(outputPath: string): JavaSourceSet {
  const normalized = normalizeForSourceSet(outputPath);
  if (
    normalized.endsWith('/target/test-classes') ||
    normalized.includes('/target/test-classes/') ||
    normalized.endsWith('/build/classes/java/test') ||
    normalized.includes('/build/classes/java/test/') ||
    normalized.endsWith('/build/classes/kotlin/test') ||
    normalized.includes('/build/classes/kotlin/test/') ||
    normalized.endsWith('/bin/test') ||
    normalized.includes('/bin/test/')
  ) {
    return 'test';
  }
  if (
    normalized.endsWith('/target/classes') ||
    normalized.includes('/target/classes/') ||
    normalized.endsWith('/build/classes/java/main') ||
    normalized.includes('/build/classes/java/main/') ||
    normalized.endsWith('/build/classes/kotlin/main') ||
    normalized.includes('/build/classes/kotlin/main/') ||
    normalized.endsWith('/bin/main') ||
    normalized.includes('/bin/main/') ||
    normalized.endsWith('/out/production') ||
    normalized.includes('/out/production/')
  ) {
    return 'main';
  }
  return 'unknown';
}

function normalizeForSourceSet(value: string): string {
  let normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  while (normalized.endsWith('/.')) {
    normalized = normalized.slice(0, -2).replace(/\/+$/, '');
  }
  return normalized;
}

function resolveJavaSourceClassPaths(
  sourcePath: string,
  outputRoot: string,
  sourcepaths: readonly string[] | undefined
): string[] {
  return deriveRelativeJavaSourcePaths(sourcePath, sourcepaths).map(
    (relativeSourcePath) => {
      const extension = path.extname(relativeSourcePath);
      const relativeClassPath = `${relativeSourcePath.slice(0, -extension.length)}.class`;
      return path.join(outputRoot, ...relativeClassPath.split(/[\\/]+/).filter(Boolean));
    }
  );
}

function deriveRelativeJavaSourcePaths(
  sourcePath: string,
  sourcepaths: readonly string[] | undefined
): string[] {
  const candidates: string[] = [];
  const sourcepathCandidates = sortSourcepathCandidates(
    normalizeSourcepathCandidates(sourcepaths).filter((candidate) =>
      isPathInsideOrEqual(candidate.root, sourcePath)
    )
  );

  for (const candidate of sourcepathCandidates) {
    const relative = path.relative(path.resolve(candidate.root), path.resolve(sourcePath));
    if (relative && path.extname(relative).toLowerCase() === '.java') {
      return uniqueRelativeJavaSourcePaths([relative]);
    }
    return [];
  }

  const markerCandidate = deriveMarkerRelativeJavaSourcePath(sourcePath);
  if (markerCandidate) {
    candidates.push(markerCandidate);
  }

  return uniqueRelativeJavaSourcePaths(candidates);
}

function deriveRelativeJavaSourceDirectoryPaths(
  sourceDir: string,
  sourcepaths: readonly string[] | undefined
): string[] {
  const sourcepathCandidates = sortSourcepathCandidates(
    normalizeSourcepathCandidates(sourcepaths).filter((candidate) =>
      isPathInsideOrEqual(candidate.root, sourceDir)
    )
  );

  for (const candidate of sourcepathCandidates) {
    return uniqueRelativeJavaSourceDirectoryPaths([
      path.relative(path.resolve(candidate.root), path.resolve(sourceDir)),
    ]);
  }

  const markerCandidate = deriveMarkerRelativeJavaSourceDirectoryPath(sourceDir);
  return markerCandidate === undefined
    ? []
    : uniqueRelativeJavaSourceDirectoryPaths([markerCandidate]);
}

function normalizeSourcepathCandidates(
  sourcepaths: readonly string[] | undefined
): Array<{ root: string; index: number }> {
  const result: Array<{ root: string; index: number }> = [];
  const seen = new Set<string>();
  for (const [index, sourcepath] of (sourcepaths ?? []).entries()) {
    const trimmed = sourcepath.trim();
    if (!trimmed) {
      continue;
    }
    const root = path.resolve(trimmed);
    if (seen.has(root)) {
      continue;
    }
    seen.add(root);
    result.push({ root, index });
  }
  return result;
}

function uniqueRelativeJavaSourceDirectoryPaths(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const key = normalizeForSourceSet(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function uniqueRelativeJavaSourcePaths(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (path.extname(candidate).toLowerCase() !== '.java') {
      continue;
    }
    const key = candidate.replace(/\\/g, '/');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function deriveMarkerRelativeJavaSourcePath(sourcePath: string): string | undefined {
  const normalized = sourcePath.replace(/\\/g, '/');
  const markers = ['/src/main/java/', '/src/test/java/', '/src/java/', '/src/'];
  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      return normalized.substring(index + marker.length);
    }
  }

  const javaRootIndex = normalized.lastIndexOf('/java/');
  if (javaRootIndex >= 0 && javaRootIndex + '/java/'.length < normalized.length) {
    return normalized.substring(javaRootIndex + '/java/'.length);
  }
  return undefined;
}

function deriveMarkerRelativeJavaSourceDirectoryPath(
  sourceDir: string
): string | undefined {
  const normalized = normalizeForSourceSet(sourceDir);
  const markers = ['/src/main/java', '/src/test/java', '/src/java', '/src'];
  for (const marker of markers) {
    const markerWithChild = `${marker}/`;
    const markerIndex = normalized.indexOf(markerWithChild);
    if (markerIndex >= 0) {
      return normalized.substring(markerIndex + markerWithChild.length);
    }
    const exactMarkerIndex = normalized.indexOf(marker);
    if (
      exactMarkerIndex >= 0 &&
      exactMarkerIndex + marker.length === normalized.length
    ) {
      return '';
    }
  }

  const javaRootIndex = normalized.lastIndexOf('/java/');
  if (javaRootIndex >= 0 && javaRootIndex + '/java/'.length < normalized.length) {
    return normalized.substring(javaRootIndex + '/java/'.length);
  }
  if (normalized.endsWith('/java')) {
    return '';
  }
  return undefined;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of paths) {
    if (!candidate) {
      continue;
    }
    const key = path.resolve(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function isPathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return (
    relative === '' ||
    (relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
