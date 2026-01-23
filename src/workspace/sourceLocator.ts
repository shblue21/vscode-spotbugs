import { Uri } from 'vscode';
import * as path from 'path';
import { Finding } from '../model/finding';
import { resolveSourceFullPath } from './pathResolver';
import { getWorkspaceRootPath } from './workspaceRoots';

export function getBestEffortFilePath(
  finding: Finding,
  workspaceRootPath?: string
): string | undefined {
  const filePath =
    finding.location.fullPath ||
    finding.location.realSourcePath ||
    finding.location.sourceFile;
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

export function getBestEffortFileUri(
  finding: Finding,
  workspaceRootPath?: string
): Uri | undefined {
  const filePath = getBestEffortFilePath(
    finding,
    workspaceRootPath ?? getWorkspaceRootPath()
  );
  if (!filePath) {
    return undefined;
  }
  try {
    return Uri.file(filePath);
  } catch {
    return undefined;
  }
}

export function getBestEffortArtifactUri(
  finding: Finding,
  workspaceRootPath?: string
): string | undefined {
  const raw =
    finding.location.fullPath ||
    finding.location.realSourcePath ||
    finding.location.sourceFile;
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
  finding: Finding,
  preferredProject?: Uri
): Promise<string | undefined> {
  const root = getWorkspaceRootPath();

  if (finding.location.fullPath) {
    if (path.isAbsolute(finding.location.fullPath)) {
      return finding.location.fullPath;
    }
    if (root) {
      return path.join(root, finding.location.fullPath);
    }
  }

  if (finding.location.realSourcePath) {
    const resolved = await resolveSourceFullPath(
      finding.location.realSourcePath,
      preferredProject
    );
    if (resolved) {
      return resolved;
    }
  }

  return getBestEffortFilePath(finding, root);
}

export async function resolveBugFileUri(
  finding: Finding,
  preferredProject?: Uri
): Promise<Uri | undefined> {
  const filePath = await resolveBugFilePath(finding, preferredProject);
  if (!filePath) {
    return undefined;
  }
  try {
    return Uri.file(filePath);
  } catch {
    return undefined;
  }
}
