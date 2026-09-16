import * as path from 'path';
import { Uri, type CancellationToken } from 'vscode';
import type { JavaProjectsOutcome } from '../lsp/javaLsOutcome';
import { requestAllJavaProjects } from '../lsp/javaLsGateway';

export class JavaLsClient {
  static async getAllProjectsOutcome(
    token?: CancellationToken
  ): Promise<JavaProjectsOutcome> {
    try {
      const uris = await requestAllJavaProjects(token);
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
          return path.basename(p) !== 'jdt.ls-java-project';
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
      if (token?.isCancellationRequested) {
        throw error;
      }
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

  static async getAllProjects(token?: CancellationToken): Promise<string[]> {
    const outcome = await JavaLsClient.getAllProjectsOutcome(token);
    return outcome.projectUris;
  }
}
