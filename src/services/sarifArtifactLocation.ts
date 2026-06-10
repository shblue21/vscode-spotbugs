import * as path from 'path';
import { pathToFileURL } from 'url';
import { Finding } from '../model/finding';

export interface SarifArtifactUriOptions {
  workspaceRootPath?: string;
}

export function getSarifArtifactUri(
  finding: Finding,
  options: SarifArtifactUriOptions = {}
): string | undefined {
  const fullPath = finding.location.fullPath;
  if (fullPath && path.isAbsolute(fullPath)) {
    const workspaceRelative = toWorkspaceRelativePath(fullPath, options.workspaceRootPath);
    if (workspaceRelative) {
      return workspaceRelative;
    }
  }

  const sourcePath = toPortablePath(finding.location.realSourcePath);
  if (sourcePath) {
    return sourcePath;
  }

  if (fullPath && path.isAbsolute(fullPath)) {
    return pathToFileURL(fullPath).toString();
  }

  const sourceFilePath = finding.location.sourceFile;
  if (!sourceFilePath) {
    return undefined;
  }

  const resolvedPath =
    path.isAbsolute(sourceFilePath) || !options.workspaceRootPath
      ? sourceFilePath
      : path.join(options.workspaceRootPath, sourceFilePath);
  if (path.isAbsolute(resolvedPath)) {
    const workspaceRelative = toWorkspaceRelativePath(resolvedPath, options.workspaceRootPath);
    if (workspaceRelative) {
      return workspaceRelative;
    }
    return pathToFileURL(resolvedPath).toString();
  }
  return toPortablePath(resolvedPath);
}

function toWorkspaceRelativePath(
  targetPath: string,
  workspaceRootPath?: string
): string | undefined {
  if (!workspaceRootPath) {
    return undefined;
  }
  const relativePath = path.relative(workspaceRootPath, targetPath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }
  return toPortablePath(relativePath);
}

function toPortablePath(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replace(/\\/g, '/');
}
