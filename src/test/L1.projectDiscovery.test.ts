import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
}

describe('projectDiscovery', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    clearModule('../workspace/projectDiscovery');
    clearModule('../services/javaLsClient');
    clearModule('../core/logger');
  });

  it('returns resolved project discovery without fallback issues', async () => {
    const vscode = installVscodeMock();
    const discovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    client.JavaLsClient.getAllProjectsOutcome = (async () => ({
      status: 'resolved',
      projectUris: ['file:///workspace/project-a'],
      issues: [],
    })) as typeof client.JavaLsClient.getAllProjectsOutcome;

    const result = await discovery.getWorkspaceProjectDiscovery(
      vscode.Uri.file('/workspace') as any
    );

    assert.deepStrictEqual(result, {
      projectUris: ['file:///workspace/project-a'],
      issues: [],
    });
  });

  it('falls back to the workspace folder and appends WORKSPACE_FALLBACK_USED when discovery is unavailable', async () => {
    const vscode = installVscodeMock();
    const discovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    client.JavaLsClient.getAllProjectsOutcome = (async () => ({
      status: 'unavailable',
      projectUris: [],
      issues: [
        {
          code: 'JAVA_LS_REQUEST_FAILED',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-all-projects',
          message: 'Java LS project discovery request failed.',
        },
      ],
    })) as typeof client.JavaLsClient.getAllProjectsOutcome;

    const result = await discovery.getWorkspaceProjectDiscovery(
      vscode.Uri.file('/workspace') as any
    );

    assert.deepStrictEqual(result, {
      projectUris: ['file:///workspace'],
      issues: [
        {
          code: 'JAVA_LS_REQUEST_FAILED',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-all-projects',
          message: 'Java LS project discovery request failed.',
        },
        {
          code: 'WORKSPACE_FALLBACK_USED',
          level: 'info',
          source: 'project-discovery',
          phase: 'workspace-fallback',
          message: 'Workspace-folder fallback was used for project discovery.',
        },
      ],
    });
  });

  it('preserves the legacy fallback log when the wrapper falls back after an empty result', async () => {
    const vscode = installVscodeMock();
    const discovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');
    const logger = require('../core/logger') as typeof import('../core/logger');

    const logs: string[] = [];
    client.JavaLsClient.getAllProjectsOutcome = (async () => ({
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
    })) as typeof client.JavaLsClient.getAllProjectsOutcome;
    logger.Logger.log = ((message: string) => {
      logs.push(message);
    }) as typeof logger.Logger.log;

    const projectUris = await discovery.getWorkspaceProjectUris(
      vscode.Uri.file('/workspace') as any
    );

    assert.deepStrictEqual(projectUris, ['file:///workspace']);
    assert.ok(
      logs.some((message) =>
        message.includes('No Java projects from LS; falling back to workspace folder analysis.')
      )
    );
  });
});
