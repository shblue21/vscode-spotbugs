import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

const projectRequest = ['java.execute.workspaceCommand', 'java.project.getAll'];

describe('javaLsClient', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
  });

  it('returns unavailable with JAVA_LS_REQUEST_FAILED when project discovery throws', async () => {
    const vscode = installVscodeMock();
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      throw new Error('request failed');
    };

    const outcome = await client.JavaLsClient.getAllProjectsOutcome();

    assert.deepStrictEqual(outcome, {
      status: 'unavailable',
      projectUris: [],
      issues: [
        {
          code: 'JAVA_LS_REQUEST_FAILED',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-all-projects',
          message: 'Java LS project discovery request failed.',
          cause: 'request failed',
        },
      ],
    });
    assert.deepStrictEqual(await client.JavaLsClient.getAllProjects(), []);
    assert.deepStrictEqual(calls, [projectRequest, projectRequest]);
  });

  it('treats undefined responses as unavailable with JAVA_LS_NO_RESULT', async () => {
    const vscode = installVscodeMock();
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      return undefined;
    };

    const outcome = await client.JavaLsClient.getAllProjectsOutcome();

    assert.deepStrictEqual(outcome, {
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
    });
    assert.deepStrictEqual(calls, [projectRequest]);
  });

  it('returns empty only when normalized projects are empty after pseudo-project filtering', async () => {
    const vscode = installVscodeMock();
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      return ['file:///tmp/jdt.ls-java-project'];
    };

    const outcome = await client.JavaLsClient.getAllProjectsOutcome();

    assert.deepStrictEqual(outcome, {
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
    });
    assert.deepStrictEqual(calls, [projectRequest]);
  });

  it('returns resolved project URIs after filtering pseudo-project entries', async () => {
    const vscode = installVscodeMock();
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      return [
        'file:///workspace/project-a',
        'file:///workspace/jdt.ls-java-project',
        'file:///workspace/project-b',
      ];
    };

    const outcome = await client.JavaLsClient.getAllProjectsOutcome();

    assert.deepStrictEqual(outcome, {
      status: 'resolved',
      projectUris: ['file:///workspace/project-a', 'file:///workspace/project-b'],
      issues: [],
    });
    assert.deepStrictEqual(await client.JavaLsClient.getAllProjects(), [
      'file:///workspace/project-a',
      'file:///workspace/project-b',
    ]);
    assert.deepStrictEqual(calls, [projectRequest, projectRequest]);
  });
});
