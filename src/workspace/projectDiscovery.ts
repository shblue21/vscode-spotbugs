import { Uri, workspace, type CancellationToken } from 'vscode';
import { Logger } from '../core/logger';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { JavaLsClient } from '../services/javaLsClient';

export interface WorkspaceProjectDiscoveryResult {
  projectUris: string[];
  issues: AnalysisResolutionIssue[];
}

export async function getWorkspaceProjectDiscovery(
  workspaceFolder: Uri,
  token?: CancellationToken
): Promise<WorkspaceProjectDiscoveryResult> {
  const outcome = await JavaLsClient.getAllProjectsOutcome(token);
  const projectUris = outcome.projectUris;

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

export async function getProjectRootPaths(
  options: {
    includeWorkspaceFallback?: boolean;
    token?: CancellationToken;
  } = {}
): Promise<string[]> {
  const rootCandidates: string[] = [];

  try {
    const uris = await JavaLsClient.getAllProjects(options.token);
    for (const u of uris) {
      try {
        rootCandidates.push(Uri.parse(u).fsPath);
      } catch {
        // ignore parse error
      }
    }
  } catch (error) {
    if (options.token?.isCancellationRequested) {
      throw error;
    }
    // ignore
  }

  if (
    rootCandidates.length === 0 &&
    options.includeWorkspaceFallback !== false
  ) {
    const folders = workspace.workspaceFolders ?? [];
    for (const f of folders) {
      rootCandidates.push(f.uri.fsPath);
    }
  }

  return rootCandidates;
}
