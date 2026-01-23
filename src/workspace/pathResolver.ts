import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import { Finding } from '../model/finding';
import { getClasspaths } from './classpathService';
import { getProjectRootPaths } from './projectDiscovery';
import { getPrimaryWorkspaceFolder } from './workspaceRoots';

/**
 * Resolve a SpotBugs realSourcePath (e.g., com/foo/Bar.java) to a full filesystem path.
 * Tries Java LS sourcepaths first, then common workspace fallbacks.
 */
export async function resolveSourceFullPath(
  realSourcePath: string,
  preferredProject?: Uri
): Promise<string | null> {
  if (!realSourcePath) {
    return null;
  }

  const wsFolder = getPrimaryWorkspaceFolder();

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
  const rootCandidates = await getProjectRootPaths();

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
  findings: Finding[],
  preferredProject?: Uri
): Promise<Finding[]> {
  if (!findings.length) {
    return [];
  }

  const resolved: Finding[] = [];
  for (const finding of findings) {
    if (
      typeof finding.location.fullPath === 'string' &&
      finding.location.fullPath.length > 0
    ) {
      resolved.push(finding);
      continue;
    }
    if (!finding.location.realSourcePath) {
      resolved.push(finding);
      continue;
    }
    try {
      const full = await resolveSourceFullPath(
        finding.location.realSourcePath,
        preferredProject
      );
      if (full) {
        resolved.push({
          ...finding,
          location: {
            ...finding.location,
            fullPath: full,
          },
        });
      } else {
        Logger.log(`Could not resolve full path for: ${finding.location.realSourcePath}`);
        resolved.push(finding);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.log(`Path resolve failed for ${finding.location.realSourcePath}: ${message}`);
      resolved.push(finding);
    }
  }
  return resolved;
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
