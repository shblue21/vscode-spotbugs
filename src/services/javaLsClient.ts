import { Uri } from 'vscode';
import type { JavaProjectsOutcome } from '../lsp/javaLsOutcome';
import { requestAllJavaProjects } from '../lsp/javaLsGateway';
import { buildWorkspace, BuildMode } from './workspaceBuildService';

export class JavaLsClient {
  static async getAllProjectsOutcome(): Promise<JavaProjectsOutcome> {
    try {
      const uris = await requestAllJavaProjects();
      if (uris === undefined || uris === null) {
        return {
          status: 'unavailable',
          projectUris: [],
          issues: [
            {
              code: 'JAVA_LS_NO_RESULT',
              level: 'warn',
              source: 'java-ls',
              phase: 'get-all-projects',
              message: 'Java LS project discovery returned no usable result.',
            },
          ],
        };
      }

      const projectUris = uris.filter((uriString) => {
        try {
          const p = Uri.parse(uriString).fsPath;
          return !p.endsWith('jdt.ls-java-project');
        } catch {
          return true;
        }
      });

      if (projectUris.length === 0) {
        return {
          status: 'empty',
          projectUris: [],
          issues: [
            {
              code: 'JAVA_LS_EMPTY_PROJECT_LIST',
              level: 'info',
              source: 'project-discovery',
              phase: 'get-all-projects',
              message: 'Java LS reported no Java projects.',
            },
          ],
        };
      }

      return {
        status: 'resolved',
        projectUris,
        issues: [],
      };
    } catch (error) {
      return {
        status: 'unavailable',
        projectUris: [],
        issues: [
          {
            code: 'JAVA_LS_REQUEST_FAILED',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-all-projects',
            message: 'Java LS project discovery request failed.',
            cause: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  static async getAllProjects(): Promise<string[]> {
    const outcome = await JavaLsClient.getAllProjectsOutcome();
    return outcome.projectUris;
  }

  static async buildWorkspace(mode: BuildMode = 'auto'): Promise<number | undefined> {
    return buildWorkspace({ mode, ensureCommands: false });
  }
}
