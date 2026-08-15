import * as fs from 'fs';
import * as path from 'path';
import { containsMatchingFile } from './fileTraversal';

const DEFAULT_OUTPUT_DIRS = [
  path.join('build', 'classes', 'java', 'main'),
  path.join('build', 'classes', 'kotlin', 'main'),
  path.join('target', 'classes'),
  path.join('bin', 'main'),
  path.join('out', 'production'),
  path.join('build', 'classes', 'java', 'test'),
  path.join('build', 'classes', 'kotlin', 'test'),
  path.join('target', 'test-classes'),
  path.join('bin', 'test'),
  path.join('build', 'classes'),
  'bin',
  'out',
  'classes',
];

export type OutputTargetPredicate = (targetPath: string) => Promise<boolean>;

export interface OutputFolderCandidate {
  targetPath: string;
  relativePath?: string;
  index: number;
}

export interface OutputFolderSelectionOptions {
  rankCandidate?: (candidate: OutputFolderCandidate) => number;
  allowRecognizedOutputOutsideBoundary?: boolean;
}

export function isBytecodeTarget(targetPath: string): boolean {
  const ext = path.extname(targetPath).toLowerCase();
  return ext === '.class' || ext === '.jar' || ext === '.zip';
}

function isLooseClassTarget(targetPath: string): boolean {
  return path.extname(targetPath).toLowerCase() === '.class';
}

export async function hasClassTargets(targetPath: string): Promise<boolean> {
  return containsMatchingFile(targetPath, isBytecodeTarget);
}

export async function hasLooseClassTargets(targetPath: string): Promise<boolean> {
  return containsMatchingFile(targetPath, isLooseClassTarget);
}

export async function findOutputFolderFromProject(
  projectRoot: string,
  hasTargets: OutputTargetPredicate = hasClassTargets,
  options: OutputFolderSelectionOptions = {}
): Promise<string | undefined> {
  const candidates = orderOutputFolderCandidates(
    DEFAULT_OUTPUT_DIRS.map((relativePath, index) => ({
      targetPath: path.join(projectRoot, relativePath),
      relativePath,
      index,
    })),
    options
  );
  for (const candidate of candidates) {
    if (!(await isDirectory(candidate.targetPath))) {
      continue;
    }
    if (await hasTargets(candidate.targetPath)) {
      return candidate.targetPath;
    }
  }
  return undefined;
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

export function orderOutputFolderCandidates<T extends OutputFolderCandidate>(
  candidates: readonly T[],
  options: OutputFolderSelectionOptions = {}
): T[] {
  return [...candidates].sort((a, b) => {
    const aRank = options.rankCandidate?.(a) ?? 0;
    const bRank = options.rankCandidate?.(b) ?? 0;
    return aRank - bRank || a.index - b.index;
  });
}
