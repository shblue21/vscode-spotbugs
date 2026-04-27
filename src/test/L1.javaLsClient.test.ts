import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
}

describe('javaLsClient', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    clearModule('../services/javaLsClient');
    clearModule('../lsp/javaLsGateway');
    clearModule('../services/workspaceBuildService');
  });

  it('returns unavailable with JAVA_LS_REQUEST_FAILED when project discovery throws', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    gateway.requestAllJavaProjects = (async () => {
      throw new Error('request failed');
    }) as typeof gateway.requestAllJavaProjects;

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
  });

  it('treats undefined responses as unavailable with JAVA_LS_NO_RESULT', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    gateway.requestAllJavaProjects = (async () => undefined) as typeof gateway.requestAllJavaProjects;

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
  });

  it('returns empty only when normalized projects are empty after pseudo-project filtering', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    gateway.requestAllJavaProjects = (async () => [
      'file:///tmp/jdt.ls-java-project',
    ]) as typeof gateway.requestAllJavaProjects;

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
  });

  it('returns resolved project URIs after filtering pseudo-project entries', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const client = require('../services/javaLsClient') as typeof import('../services/javaLsClient');

    gateway.requestAllJavaProjects = (async () => [
      'file:///workspace/project-a',
      'file:///workspace/jdt.ls-java-project',
      'file:///workspace/project-b',
    ]) as typeof gateway.requestAllJavaProjects;

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
  });
});
