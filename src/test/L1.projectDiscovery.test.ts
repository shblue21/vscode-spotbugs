import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

const projectRequest = ['java.execute.workspaceCommand', 'java.project.getAll'];

describe('projectDiscovery', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
  });

  it('returns resolved project discovery without fallback issues', async () => {
    const vscode = installVscodeMock();
    const discovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');

    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      return ['file:///workspace/project-a'];
    };

    const result = await discovery.getWorkspaceProjectDiscovery(
      vscode.Uri.file('/workspace') as any,
    );

    assert.deepStrictEqual(result, {
      projectUris: ['file:///workspace/project-a'],
      issues: [],
    });
    assert.deepStrictEqual(calls, [projectRequest]);
  });

  it('falls back to the workspace folder and appends WORKSPACE_FALLBACK_USED when discovery is unavailable', async () => {
    const vscode = installVscodeMock();
    const discovery =
      require('../workspace/projectDiscovery') as typeof import('../workspace/projectDiscovery');

    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      throw new Error('request failed');
    };

    const result = await discovery.getWorkspaceProjectDiscovery(
      vscode.Uri.file('/workspace') as any,
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
          cause: 'request failed',
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
    assert.deepStrictEqual(calls, [projectRequest]);
  });
});
