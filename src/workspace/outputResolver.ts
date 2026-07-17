import * as fs from 'fs';
import * as path from 'path';

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
  return hasTargets(targetPath, isBytecodeTarget);
}

export async function hasLooseClassTargets(targetPath: string): Promise<boolean> {
  return hasTargets(targetPath, isLooseClassTarget);
}

async function hasTargets(
  targetPath: string,
  isTargetFile: (targetPath: string) => boolean
): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isFile()) {
      return isTargetFile(targetPath);
    }
    if (stat.isDirectory()) {
      return await containsTarget(targetPath, isTargetFile);
    }
  } catch {
    return false;
  }
  return false;
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

async function containsTarget(
  root: string,
  isTargetFile: (targetPath: string) => boolean
): Promise<boolean> {
  const queue: string[] = [root];
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
      if (entry.isFile()) {
        if (isTargetFile(entry.name)) {
          return true;
        }
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(path.join(current, entry.name));
      }
    }
  }
  return false;
}
