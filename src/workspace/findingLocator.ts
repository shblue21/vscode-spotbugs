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

export async function resolveFindingFilePath(
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
