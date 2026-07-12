import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';
import type { ClasspathLookupOutcome } from '../lsp/javaLsOutcome';
import { collectClasspathAttempts } from './classpathAttemptSelector';
import {
  runClasspathAttempts,
  runClasspathAttemptsOutcome,
} from './classpathCommandRunner';
import type { ClasspathResult } from './classpathTypes';
import {
  orderOutputFolderCandidates,
  type OutputFolderSelectionOptions,
} from './outputResolver';

export interface ClasspathLookupOptions {
  verbose?: boolean;
  logFailures?: boolean;
  strictProject?: boolean;
}

const PREFERRED_OUTPUT_SUFFIXES = [
  '/target/classes',
  '/build/classes/java/main',
  '/build/classes/kotlin/main',
  '/bin/main',
  '/out/production',
  '/target/test-classes',
  '/build/classes/java/test',
  '/build/classes/kotlin/test',
  '/bin/test',
  '/build/classes',
  '/bin',
  '/out',
  '/classes',
];

export type ProjectRef = string | Uri | undefined;
export type OutputFolderPredicate = (targetPath: string) => Promise<boolean>;

export async function getClasspathsOutcome(
  project?: ProjectRef,
  options?: ClasspathLookupOptions
): Promise<ClasspathLookupOutcome> {
  const attempts = await collectClasspathAttempts(project, options);
  return runClasspathAttemptsOutcome(attempts, options);
}

export async function getClasspaths(
  project?: ProjectRef,
  options?: ClasspathLookupOptions
): Promise<ClasspathResult | undefined> {
  const outcome = await getClasspathsOutcome(project, options);
  return outcome.status === 'resolved' ? outcome.classpath : undefined;
}

export async function deriveOutputFolder(
  targetResolutionRoots: string[],
  workspacePath: string,
  hasTargets?: OutputFolderPredicate,
  options: OutputFolderSelectionOptions = {}
): Promise<string | undefined> {
  const candidateRoots = filterAdmissibleTargetResolutionRoots(
    targetResolutionRoots,
    workspacePath,
    options
  );
  const rankedCandidates = orderOutputFolderCandidates(
    candidateRoots.map((targetPath, rootIndex) => ({
      targetPath,
      index: getOutputFolderBaseRank(targetPath) * candidateRoots.length + rootIndex,
    })),
    options
  );
  for (const c of rankedCandidates) {
    try {
      const st = await fs.promises.stat(c.targetPath);
      if (
        st.isDirectory() &&
        (!hasTargets || (await hasTargets(c.targetPath)))
      ) {
        return c.targetPath;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

export function filterAdmissibleTargetResolutionRoots(
  targetResolutionRoots: readonly string[],
  workspacePath: string,
  options: OutputFolderSelectionOptions = {}
): string[] {
  const allowRecognizedOutputOutsideBoundary =
    options.allowRecognizedOutputOutsideBoundary ?? true;
  return uniqueCandidateRoots(
    targetResolutionRoots.filter((cp) =>
      isAdmissibleOutputCandidate(
        workspacePath,
        cp,
        allowRecognizedOutputOutsideBoundary
      )
    )
  );
}

function isAdmissibleOutputCandidate(
  workspacePath: string,
  candidatePath: string,
  allowRecognizedOutputOutsideBoundary: boolean
): boolean {
  if (isWorkspacePrefixSibling(workspacePath, candidatePath)) {
    return false;
  }
  if (isPathInsideOrEqual(workspacePath, candidatePath)) {
    return true;
  }
  return (
    allowRecognizedOutputOutsideBoundary && isRecognizedOutputRoot(candidatePath)
  );
}

function uniqueCandidateRoots(candidateRoots: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidateRoots) {
    const pathFlavor = selectPathFlavor(candidate);
    const key = normalizeForPathComparison(candidate, pathFlavor);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function isRecognizedOutputRoot(targetPath: string): boolean {
  const normalized = normalizeForOutputSuffix(targetPath);
  return PREFERRED_OUTPUT_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function getOutputFolderBaseRank(targetPath: string): number {
  const normalized = normalizeForOutputSuffix(targetPath);
  const rank = PREFERRED_OUTPUT_SUFFIXES.findIndex(
    (suffix) => normalized.endsWith(suffix) || normalized.includes(`${suffix}/`)
  );
  return rank >= 0 ? rank : PREFERRED_OUTPUT_SUFFIXES.length;
}

function isPathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const pathFlavor = selectPathFlavor(parentPath, candidatePath);
  const relative = pathFlavor.relative(
    pathFlavor.resolve(parentPath),
    pathFlavor.resolve(candidatePath)
  );
  return (
    relative === '' ||
    (relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith(`..${pathFlavor.sep}`) &&
      !pathFlavor.isAbsolute(relative))
  );
}

export function isWorkspacePrefixSibling(
  workspacePath: string,
  candidatePath: string
): boolean {
  const pathFlavor = selectPathFlavor(workspacePath, candidatePath);
  const resolvedWorkspace = normalizeForPathComparison(workspacePath, pathFlavor);
  const resolvedCandidate = normalizeForPathComparison(candidatePath, pathFlavor);
  return (
    !isPathInsideOrEqual(resolvedWorkspace, resolvedCandidate) &&
    resolvedCandidate.startsWith(resolvedWorkspace)
  );
}

type PathFlavor = Pick<
  typeof path,
  'isAbsolute' | 'parse' | 'relative' | 'resolve' | 'sep'
>;

function selectPathFlavor(...values: string[]): PathFlavor {
  return values.some(isWindowsPathString) ? path.win32 : path;
}

function isWindowsPathString(value: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//')
  );
}

function normalizeForPathComparison(
  value: string,
  pathFlavor: PathFlavor
): string {
  const resolved = stripTrailingSeparators(pathFlavor.resolve(value), pathFlavor);
  return pathFlavor.sep === '\\' ? resolved.toLowerCase() : resolved;
}

function stripTrailingSeparators(value: string, pathFlavor: PathFlavor): string {
  const root = pathFlavor.parse(value).root;
  let end = value.length;
  while (end > root.length && /[\\/]/.test(value.charAt(end - 1))) {
    end--;
  }
  return value.slice(0, end);
}

function normalizeForOutputSuffix(value: string): string {
  const normalized = normalizeSeparators(value);
  return isWindowsPathString(value) ? normalized.toLowerCase() : normalized;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}
