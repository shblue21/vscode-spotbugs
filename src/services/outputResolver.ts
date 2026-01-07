import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_OUTPUT_DIRS = [
  path.join('build', 'classes', 'java', 'main'),
  path.join('build', 'classes', 'kotlin', 'main'),
  path.join('build', 'classes'),
  path.join('target', 'classes'),
  path.join('bin', 'main'),
  'bin',
  path.join('out', 'production'),
  'out',
  'classes',
];

export function isBytecodeTarget(targetPath: string): boolean {
  const ext = path.extname(targetPath).toLowerCase();
  return ext === '.class' || ext === '.jar' || ext === '.zip';
}

export async function hasClassTargets(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isFile()) {
      return isBytecodeTarget(targetPath);
    }
    if (stat.isDirectory()) {
      return await containsClassFile(targetPath);
    }
  } catch {
    return false;
  }
  return false;
}

export async function findOutputFolderFromProject(
  projectRoot: string
): Promise<string | undefined> {
  for (const rel of DEFAULT_OUTPUT_DIRS) {
    const candidate = path.join(projectRoot, rel);
    if (await hasClassTargets(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function containsClassFile(root: string): Promise<boolean> {
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
        if (entry.name.toLowerCase().endsWith('.class')) {
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
