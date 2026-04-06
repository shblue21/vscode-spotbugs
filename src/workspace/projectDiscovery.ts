import { Uri, workspace } from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { JavaLsClient } from '../services/javaLsClient';

export interface WorkspaceProjectDiscoveryResult {
  projectUris: string[];
  issues: AnalysisResolutionIssue[];
}

export async function getWorkspaceProjectDiscovery(
  workspaceFolder: Uri
): Promise<WorkspaceProjectDiscoveryResult> {
  const outcome = await JavaLsClient.getAllProjectsOutcome();
  const projectUris = outcome.projectUris.filter((uriString) => {
    try {
      const fsPath = Uri.parse(uriString).fsPath;
      return path.basename(fsPath) !== 'jdt.ls-java-project';
    } catch {
      return true;
    }
  });

  if (outcome.status === 'resolved' && projectUris.length > 0) {
    Logger.log(`Workspace contains ${projectUris.length} Java projects.`);
    return {
      projectUris,
      issues: outcome.issues,
    };
  }

  Logger.log('No Java projects from LS; falling back to workspace folder analysis.');
  return {
    projectUris: [workspaceFolder.toString()],
    issues: [
      ...outcome.issues,
      {
        code: 'WORKSPACE_FALLBACK_USED',
        level: 'info',
        source: 'project-discovery',
        phase: 'workspace-fallback',
        message: 'Workspace-folder fallback was used for project discovery.',
      },
    ],
  };
}

export async function getWorkspaceProjectUris(workspaceFolder: Uri): Promise<string[]> {
  const discovery = await getWorkspaceProjectDiscovery(workspaceFolder);
  return discovery.projectUris;
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
