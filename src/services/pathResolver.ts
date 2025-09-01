import { commands, Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getClasspaths } from './classpathService';

/**
 * Resolve a SpotBugs realSourcePath (e.g., com/foo/Bar.java) to a full filesystem path.
 * Tries Java LS sourcepaths first, then common workspace fallbacks.
 */
export async function resolveSourceFullPath(realSourcePath: string): Promise<string | null> {
  if (!realSourcePath) {
    return null;
  }

  const wsFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;

  // 1) Try Java LS sourcepaths via classpathService
  try {
    const sourcepaths = await getSourcepathsCached(wsFolder?.uri);
    if (sourcepaths && sourcepaths.length > 0) {
      for (const sourcePath of sourcepaths) {
        const candidatePath = path.join(sourcePath, realSourcePath);
        try {
          await fs.promises.access(candidatePath);
          return candidatePath;
        } catch {
          // try next source path
        }
      }
    }
  } catch (error) {
    // ignore; fall back to workspace scans
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

// Simple in-memory cache to avoid repeated LS calls while resolving many paths
let cachedSourcepaths: string[] | undefined;
let cachedAt = 0;
const CACHE_MS = 5000;

async function getSourcepathsCached(preferred?: Uri): Promise<string[] | undefined> {
  const now = Date.now();
  if (cachedSourcepaths && now - cachedAt < CACHE_MS) {
    return cachedSourcepaths;
  }
  const cp = await getClasspaths(preferred);
  const res = cp && Array.isArray(cp.sourcepaths) ? cp.sourcepaths : undefined;
  if (res) {
    cachedSourcepaths = res;
    cachedAt = now;
  }
  return res;
}
