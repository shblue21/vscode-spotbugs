import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import { JavaLsClient } from '../services/javaLsClient';

export async function getWorkspaceProjectUris(workspaceFolder: Uri): Promise<string[]> {
  let projectUris = await JavaLsClient.getAllProjects();
  projectUris = projectUris.filter((uriString) => {
    try {
      const fsPath = Uri.parse(uriString).fsPath;
      return path.basename(fsPath) !== 'jdt.ls-java-project';
    } catch {
      return true;
    }
  });

  if (projectUris.length === 0) {
    projectUris = [workspaceFolder.toString()];
    Logger.log('No Java projects from LS; falling back to workspace folder analysis.');
  } else {
    Logger.log(`Workspace contains ${projectUris.length} Java projects.`);
  }

  return projectUris;
}

export async function getProjectRootPaths(): Promise<string[]> {
  const rootCandidates: string[] = [];

  try {
    const uris = await JavaLsClient.getAllProjects();
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

  if (rootCandidates.length === 0) {
    const folders = workspace.workspaceFolders ?? [];
    for (const f of folders) {
      rootCandidates.push(f.uri.fsPath);
    }
  }

  return rootCandidates;
}
