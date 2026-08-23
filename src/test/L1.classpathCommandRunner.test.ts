import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
}

type GatewayModule = typeof import('../lsp/javaLsGateway');
type UtilsModule = typeof import('../core/utils');
type RunnerModule = typeof import('../workspace/classpathCommandRunner');

function loadHarness(): {
  gateway: GatewayModule;
  utils: UtilsModule;
  runner: RunnerModule;
} {
  const gateway = require('../lsp/javaLsGateway') as GatewayModule;
  const utils = require('../core/utils') as UtilsModule;
  const runner = require('../workspace/classpathCommandRunner') as RunnerModule;
  utils.getJavaExtension = (async () => undefined) as typeof utils.getJavaExtension;
  return { gateway, utils, runner };
}

function runPreferredAttempt(runner: RunnerModule) {
  return runner.runClasspathAttemptsOutcome([
    { label: 'preferred:file:///workspace/project', arg: 'file:///workspace/project' },
  ]);
}

function installResolvedExtension(utils: UtilsModule): void {
  utils.getJavaExtension = (async () => ({
    exports: {
      getClasspaths: async () => ({
        classpaths: ['/workspace/bin'],
        sourcepaths: ['/workspace/src/main/java'],
        output: '/workspace/bin',
      }),
    },
  })) as typeof utils.getJavaExtension;
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
    const { gateway, runner } = loadHarness();

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      return {
        classpaths: ['/workspace/bin'],
        sourcepaths: ['/workspace/src/main/java'],
        output: '/workspace/bin',
      };
    }) as typeof gateway.requestJavaClasspaths;

    const outcome = await runPreferredAttempt(runner);

    assert.strictEqual(callCount, 1);
    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(outcome.issues, []);
    assert.deepStrictEqual(
      outcome.status === 'resolved' ? outcome.classpath.runtimeClasspaths : [],
      ['/workspace/bin']
    );
  });

  it('does not leak earlier command failures when a later command variant succeeds', async () => {
    const { gateway, runner } = loadHarness();

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

    const outcome = await runPreferredAttempt(runner);

    assert.strictEqual(callCount, 2);
    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(outcome.issues, []);
  });

  it('summarizes no-result fallback when the extension API fallback succeeds', async () => {
    const { gateway, utils, runner } = loadHarness();

    gateway.requestJavaClasspaths = (async () => undefined) as typeof gateway.requestJavaClasspaths;
    installResolvedExtension(utils);

    const outcome = await runPreferredAttempt(runner);

    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT', 'JAVA_LS_EXTENSION_FALLBACK_USED']
    );
  });

  it('collapses mixed command variant failure history into a single no-result summary issue', async () => {
    const { gateway, utils, runner } = loadHarness();

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('uri-scope failed');
      }
      return undefined;
    }) as typeof gateway.requestJavaClasspaths;
    installResolvedExtension(utils);

    const outcome = await runPreferredAttempt(runner);

    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT', 'JAVA_LS_EXTENSION_FALLBACK_USED']
    );
  });

  it('emits an empty runtime classpath issue when metadata resolves without runtime entries', async () => {
    const { gateway, runner } = loadHarness();

    gateway.requestJavaClasspaths = (async () => ({
      classpaths: [],
      sourcepaths: [],
      output: '/workspace/bin',
    })) as typeof gateway.requestJavaClasspaths;

    const outcome = await runPreferredAttempt(runner);

    assert.strictEqual(outcome.status, 'resolved');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_EMPTY_RUNTIME_CLASSPATH']
    );
  });

  it('returns an unavailable outcome and preserves the legacy failure log side effect', async () => {
    const { gateway, runner } = loadHarness();
    const logger = require('../core/logger') as typeof import('../core/logger');

    const logs: string[] = [];
    gateway.requestJavaClasspaths = (async () => {
      throw new Error('boom');
    }) as typeof gateway.requestJavaClasspaths;
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
    const { gateway, runner } = loadHarness();

    let callCount = 0;
    gateway.requestJavaClasspaths = (async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('uri-scope failed');
      }
      return undefined;
    }) as typeof gateway.requestJavaClasspaths;

    const outcome = await runPreferredAttempt(runner);

    assert.strictEqual(outcome.status, 'unavailable');
    assert.deepStrictEqual(
      outcome.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT']
    );
  });
});
