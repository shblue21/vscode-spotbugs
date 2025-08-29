import { commands, Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../logger';
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
    const cp = await getClasspaths(wsFolder?.uri);
    if (cp && Array.isArray(cp.sourcepaths) && cp.sourcepaths.length > 0) {
      for (const sourcePath of cp.sourcepaths) {
        const candidatePath = path.join(sourcePath, realSourcePath);
        try {
          await fs.promises.access(candidatePath);
          return candidatePath;
        } catch {
          // try next source path
        }
      }
    } else {
      Logger.log('No source paths from Java Language Server; trying fallbacks');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    Logger.log(`Could not get source paths for path resolution: ${msg}`);
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
  if (rootCandidates.length === 0 && wsFolder) {
    rootCandidates.push(wsFolder.uri.fsPath);
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

