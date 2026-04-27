import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
}

describe('classpathCommandRunner', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    clearModule('../workspace/classpathCommandRunner');
    clearModule('../lsp/javaLsGateway');
    clearModule('../core/utils');
    clearModule('../core/logger');
  });

  it('returns the first successful command result without degradation issues', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      return {
        classpaths: ['/workspace/bin'],
        sourcepaths: ['/workspace/src/main/java'],
        output: '/workspace/bin',
      };
    }) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => undefined) as typeof utils.getJavaExtension;

    const outcome = await runner.runClasspathAttemptsOutcome([
      { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
    ]);

    assert.strictEqual(callCount, 1);
    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(outcome.issues, []);
    assert.deepStrictEqual(
      outcome.status === 'resolved' ? outcome.classpath.runtimeClasspaths : [],
      ['/workspace/bin']
    );
  });

  it('does not leak earlier command failures when a later command variant succeeds', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('uri-scope failed');
      }
      return {
        classpaths: ['/workspace/bin'],
        sourcepaths: [],
        output: '/workspace/bin',
      };
    }) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => undefined) as typeof utils.getJavaExtension;

    const outcome = await runner.runClasspathAttemptsOutcome([
      { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
    ]);

    assert.strictEqual(callCount, 2);
    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(outcome.issues, []);
  });

  it('summarizes no-result fallback when the extension API fallback succeeds', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    gateway.requestJavaClasspaths = (async () => undefined) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => ({
      exports: {
        getClasspaths: async () => ({
          classpaths: ['/workspace/bin'],
          sourcepaths: ['/workspace/src/main/java'],
          output: '/workspace/bin',
        }),
      },
    })) as typeof utils.getJavaExtension;

    const outcome = await runner.runClasspathAttemptsOutcome([
      { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
    ]);

    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT', 'JAVA_LS_EXTENSION_FALLBACK_USED']
    );
  });

  it('collapses mixed command variant failure history into a single no-result summary issue', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('uri-scope failed');
      }
      return undefined;
    }) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => ({
      exports: {
        getClasspaths: async () => ({
          classpaths: ['/workspace/bin'],
          sourcepaths: ['/workspace/src/main/java'],
          output: '/workspace/bin',
        }),
      },
    })) as typeof utils.getJavaExtension;

    const outcome = await runner.runClasspathAttemptsOutcome([
      { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
    ]);

    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT', 'JAVA_LS_EXTENSION_FALLBACK_USED']
    );
  });

  it('emits an empty runtime classpath issue when metadata resolves without runtime entries', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    gateway.requestJavaClasspaths = (async () => ({
      classpaths: [],
      sourcepaths: [],
      output: '/workspace/bin',
    })) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => undefined) as typeof utils.getJavaExtension;

    const outcome = await runner.runClasspathAttemptsOutcome([
      { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
    ]);

    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_EMPTY_RUNTIME_CLASSPATH']
    );
  });

  it('returns an unavailable outcome and preserves the legacy failure log side effect', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const logger = require('../core/logger') as typeof import('../core/logger');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    const logs: string[] = [];
    gateway.requestJavaClasspaths = (async () => {
      throw new Error('boom');
    }) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => undefined) as typeof utils.getJavaExtension;
    logger.Logger.log = ((message: string) => {
      logs.push(message);
    }) as typeof logger.Logger.log;

    const outcome = await runner.runClasspathAttemptsOutcome(
      [{ label: 'no-arg' }],
      { logFailures: true }
    );

    assert.strictEqual(outcome.status, 'unavailable');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_REQUEST_FAILED']
    );
    assert.ok(
      logs.some((message) => message.includes('getClasspaths failed (no-arg within no-arg): boom'))
    );
  });

  it('returns only JAVA_LS_NO_RESULT for mixed unavailable command history', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    const utils = require('../core/utils') as typeof import('../core/utils');
    const runner =
      require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('uri-scope failed');
      }
      return undefined;
    }) as typeof gateway.requestJavaClasspaths;
    utils.getJavaExtension = (async () => undefined) as typeof utils.getJavaExtension;

    const outcome = await runner.runClasspathAttemptsOutcome([
      { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
    ]);

    assert.strictEqual(outcome.status, 'unavailable');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT']
    );
  });
});
