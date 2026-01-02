import { commands, Uri, workspace } from 'vscode';
import * as path from 'path';
import { getClasspaths } from './classpathService';
import { Logger } from '../core/logger';
import { BugInfo } from '../models/bugInfo';

/**
 * Resolve a SpotBugs realSourcePath (e.g., com/foo/Bar.java) to a full filesystem path.
 * Tries Java LS sourcepaths first, then common workspace fallbacks.
 */
export async function resolveSourceFullPath(
  realSourcePath: string,
  preferredProject?: Uri,
): Promise<string | null> {
  if (!realSourcePath) {
    return null;
  }

  const wsFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;

  // 1) Try Java LS sourcepaths via classpathService
  try {
    const sourcepaths = await getSourcepathsCached(preferredProject ?? wsFolder?.uri);
    if (sourcepaths && sourcepaths.length > 0) {
      for (const sourcePath of sourcepaths) {
        const candidatePath = path.join(sourcePath, realSourcePath);
        try {
          await workspace.fs.stat(Uri.file(candidatePath));
          return candidatePath;
        } catch {
          // try next source path
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.log(`Sourcepath lookup failed; falling back to workspace scan: ${message}`);
  }

  // 2) Fallback: scan common Java project layout roots under known project/workspace roots
  const rootCandidates: string[] = [];
  try {
    const uris = (await commands.executeCommand<string[]>('java.project.getAll')) || [];
    for (const u of uris) {
      try {
        rootCandidates.push(Uri.parse(u).fsPath);
      } catch {
        // ignore parse error
      }
    }
  } catch {
    // ignore
  }
  if (rootCandidates.length === 0 && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    for (const f of workspace.workspaceFolders) {
      rootCandidates.push(f.uri.fsPath);
    }
  }

  const sourceRoots = [
    ['src', 'main', 'java'],
    ['src', 'test', 'java'],
    ['src'],
    [],
  ];
  for (const root of rootCandidates) {
    for (const segs of sourceRoots) {
      const base = path.join(root, ...segs);
      const candidatePath = path.join(base, realSourcePath);
      try {
        await workspace.fs.stat(Uri.file(candidatePath));
        return candidatePath;
      } catch {
        // Continue
      }
    }
  }

  return null;
}

/**
 * Resolve SpotBugs findings to absolute file paths when possible.
 */
export async function addFullPaths(
  bugs: BugInfo[],
  preferredProject?: Uri
): Promise<BugInfo[]> {
  if (!bugs.length) {
    return [];
  }

  for (const bug of bugs) {
    if (typeof bug.fullPath === 'string' && bug.fullPath.length > 0) {
      continue;
    }
    if (!bug.realSourcePath) continue;
    try {
      const full = await resolveSourceFullPath(bug.realSourcePath, preferredProject);
      if (full) {
        bug.fullPath = full;
      } else {
        Logger.log(`Could not resolve full path for: ${bug.realSourcePath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.log(`Path resolve failed for ${bug.realSourcePath}: ${message}`);
    }
  }
  return bugs;
}

// Simple in-memory cache to avoid repeated LS calls while resolving many paths
let cachedSourcepaths: string[] | undefined;
let cachedAt = 0;
const CACHE_MS = 5000;

export function primeSourcepathsCache(sourcepaths?: string[]): void {
  if (Array.isArray(sourcepaths)) {
    cachedSourcepaths = sourcepaths;
    cachedAt = Date.now();
  }
}

async function getSourcepathsCached(preferred?: Uri): Promise<string[] | undefined> {
  const now = Date.now();
  if (cachedSourcepaths && now - cachedAt < CACHE_MS) {
    return cachedSourcepaths;
  }
  const cp = await getClasspaths(preferred);
  if (Array.isArray(cp?.sourcepaths)) {
    primeSourcepathsCache(cp.sourcepaths);
    return cp.sourcepaths.length > 0 ? cp.sourcepaths : undefined;
  }
  return undefined;
}
