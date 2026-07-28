import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import { Finding } from '../model/finding';
import { getClasspaths } from './classpathService';
import { getProjectRootPaths } from './projectDiscovery';
import { getPrimaryWorkspaceFolder } from './workspaceRoots';

const SOURCE_ROOTS = [
  ['src', 'main', 'java'],
  ['src', 'test', 'java'],
  ['src'],
  [],
] as const;

type LoggerLike = Pick<typeof Logger, 'log'>;

export interface PathResolverDeps {
  getClasspaths: typeof getClasspaths;
  getProjectRootPaths: typeof getProjectRootPaths;
  getPrimaryWorkspaceFolder: typeof getPrimaryWorkspaceFolder;
  statPath(candidatePath: string): Promise<unknown>;
  logger: LoggerLike;
}

const defaultDeps: PathResolverDeps = {
  getClasspaths,
  getProjectRootPaths,
  getPrimaryWorkspaceFolder,
  statPath: async (candidatePath) => workspace.fs.stat(Uri.file(candidatePath)),
  logger: Logger,
};

export function createPathResolver(overrides: Partial<PathResolverDeps> = {}) {
  const deps: PathResolverDeps = { ...defaultDeps, ...overrides };

  async function loadSourcepaths(
    preferredProject?: Uri
  ): Promise<readonly string[] | undefined> {
    try {
      const workspaceFolder = deps.getPrimaryWorkspaceFolder();
      const classpaths = await deps.getClasspaths(
        preferredProject ?? workspaceFolder?.uri
      );
      return Array.isArray(classpaths?.sourcepaths)
        ? classpaths.sourcepaths.slice()
        : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.logger.log(
        `Sourcepath lookup failed; falling back to workspace scan: ${message}`
      );
      return undefined;
    }
  }

  async function firstExistingPath(
    roots: readonly string[],
    realSourcePath: string
  ): Promise<string | null> {
    for (const root of roots) {
      const candidatePath = path.join(root, realSourcePath);
      try {
        await deps.statPath(candidatePath);
        return candidatePath;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  }

  async function resolveWithSourcepaths(
    realSourcePath: string,
    sourcepaths: readonly string[] | undefined,
    loadFallbackRoots: () => Promise<readonly string[]>
  ): Promise<string | null> {
    if (sourcepaths && sourcepaths.length > 0) {
      const resolved = await firstExistingPath(sourcepaths, realSourcePath);
      if (resolved) {
        return resolved;
      }
    }

    const rootCandidates = await loadFallbackRoots();
    for (const root of rootCandidates) {
      for (const segments of SOURCE_ROOTS) {
        const candidatePath = path.join(root, ...segments, realSourcePath);
        try {
          await deps.statPath(candidatePath);
          return candidatePath;
        } catch {
          // Try the next common source root.
        }
      }
    }

    return null;
  }

  async function resolveSourceFullPath(
    realSourcePath: string,
    preferredProject?: Uri
  ): Promise<string | null> {
    if (!realSourcePath) {
      return null;
    }

    const sourcepaths = await loadSourcepaths(preferredProject);
    return resolveWithSourcepaths(
      realSourcePath,
      sourcepaths,
      deps.getProjectRootPaths
    );
  }

  async function addFullPaths(
    findings: Finding[],
    preferredProject?: Uri,
    sourcepaths?: readonly string[] | null
  ): Promise<Finding[]> {
    if (!findings.length) {
      return [];
    }

    const hasSnapshot = Array.isArray(sourcepaths);
    const capturedSourcepaths = hasSnapshot ? sourcepaths.slice() : undefined;
    let recoveredSourcepaths: Promise<readonly string[] | undefined> | undefined;
    let fallbackRoots: Promise<readonly string[]> | undefined;

    function getEffectiveSourcepaths(): Promise<
      readonly string[] | undefined
    > {
      if (hasSnapshot) {
        return Promise.resolve(capturedSourcepaths);
      }
      if (!recoveredSourcepaths) {
        recoveredSourcepaths = loadSourcepaths(preferredProject);
      }
      return recoveredSourcepaths;
    }

    function getFallbackRoots(): Promise<readonly string[]> {
      if (!fallbackRoots) {
        fallbackRoots = deps.getProjectRootPaths().then((roots) => roots.slice());
      }
      return fallbackRoots;
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
        const full = await resolveWithSourcepaths(
          finding.location.realSourcePath,
          await getEffectiveSourcepaths(),
          getFallbackRoots
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
          deps.logger.log(
            `Could not resolve full path for: ${finding.location.realSourcePath}`
          );
          resolved.push(finding);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.log(
          `Path resolve failed for ${finding.location.realSourcePath}: ${message}`
        );
        resolved.push(finding);
      }
    }
    return resolved;
  }

  return { addFullPaths, resolveSourceFullPath };
}

const defaultResolver = createPathResolver();

/**
 * Resolve a SpotBugs realSourcePath (e.g., com/foo/Bar.java) to a full filesystem path.
 * Performs an on-demand Java LS lookup, then tries common workspace fallbacks.
 */
export function resolveSourceFullPath(
  realSourcePath: string,
  preferredProject?: Uri
): Promise<string | null> {
  return defaultResolver.resolveSourceFullPath(realSourcePath, preferredProject);
}

/**
 * Resolve SpotBugs findings to absolute file paths when possible.
 * A provided sourcepath array is an immutable snapshot for this call, including [].
 */
export function addFullPaths(
  findings: Finding[],
  preferredProject?: Uri,
  sourcepaths?: readonly string[] | null
): Promise<Finding[]> {
  return defaultResolver.addFullPaths(findings, preferredProject, sourcepaths);
}
