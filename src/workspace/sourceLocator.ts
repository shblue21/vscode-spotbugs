import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Bug } from '../model/bug';
import { resolveSourceFullPath } from './pathResolver';

export function getWorkspaceRootPath(): string | undefined {
  return workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getBestEffortFilePath(bug: Bug, workspaceRootPath?: string): string | undefined {
  const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
  if (!filePath) {
    return undefined;
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  if (workspaceRootPath) {
    return path.join(workspaceRootPath, filePath);
  }
  return undefined;
}

export function getBestEffortFileUri(bug: Bug, workspaceRootPath?: string): Uri | undefined {
  const filePath = getBestEffortFilePath(bug, workspaceRootPath ?? getWorkspaceRootPath());
  if (!filePath) {
    return undefined;
  }
  try {
    return Uri.file(filePath);
  } catch {
    return undefined;
  }
}

export function getBestEffortArtifactUri(bug: Bug, workspaceRootPath?: string): string | undefined {
  const raw = bug.fullPath || bug.realSourcePath || bug.sourceFile;
  if (!raw) return undefined;

  const root = workspaceRootPath ?? getWorkspaceRootPath();
  const filePath = path.isAbsolute(raw) ? raw : root ? path.join(root, raw) : raw;
  if (path.isAbsolute(filePath)) {
    try {
      return Uri.file(filePath).toString();
    } catch {
      return filePath;
    }
  }
  return filePath.replace(/\\/g, '/');
}

export async function resolveBugFilePath(
  bug: Bug,
  preferredProject?: Uri
): Promise<string | undefined> {
  const root = getWorkspaceRootPath();

  if (bug.fullPath) {
    if (path.isAbsolute(bug.fullPath)) {
      return bug.fullPath;
    }
    if (root) {
      return path.join(root, bug.fullPath);
    }
  }

  if (bug.realSourcePath) {
    const resolved = await resolveSourceFullPath(bug.realSourcePath, preferredProject);
    if (resolved) {
      return resolved;
    }
  }

  return getBestEffortFilePath(bug, root);
}

export async function resolveBugFileUri(
  bug: Bug,
  preferredProject?: Uri
): Promise<Uri | undefined> {
  const filePath = await resolveBugFilePath(bug, preferredProject);
  if (!filePath) {
    return undefined;
  }
  try {
    return Uri.file(filePath);
  } catch {
    return undefined;
  }
}
