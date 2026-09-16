/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

describe('Java project settings snapshot transport', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    delete require.cache[require.resolve('../lsp/javaLsGateway')];
    delete require.cache[require.resolve('../workspace/classpathCommandRunner')];
  });

  it('retains runtime metadata and the existing warning when the replacement settings command fails', async () => {
    const calls: string[] = [];
    resetVscodeMock({ commands: { executeCommand: async (_outer: string, command: string) => {
      calls.push(command);
      if (command === 'java.project.getClasspaths') return {
        projectRoot: 'file:///p', classpaths: ['/p/runtime.jar'], modulepaths: [],
      };
      return JSON.stringify({ results: [], errors: [{ code: 'COMMAND_FAILED', message: 'settings unavailable' }] });
    } } as any });
    const { lookupJavaProjectClasspath } = require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');
    const result = await lookupJavaProjectClasspath('file:///p', { scope: 'runtime' });
    assert.strictEqual(result.status, 'resolved');
    if (result.status !== 'resolved') throw new Error('Expected existing degraded result');
    assert.deepStrictEqual(result.classpath.runtimeClasspaths, ['/p/runtime.jar']);
    assert.deepStrictEqual(result.classpath.sourcepaths, []);
    assert.deepStrictEqual(result.issues.map((issue) => issue.code), ['JAVA_LS_PROJECT_SETTINGS_FAILED']);
    assert.deepStrictEqual(calls, ['java.project.getClasspaths', 'java.spotbugs.project.settings']);
  });

  it('propagates cancellation after settings lookup instead of degrading or retrying', async () => {
    const token = { isCancellationRequested: false } as any;
    resetVscodeMock({ commands: { executeCommand: async (_outer: string, command: string) => {
      if (command === 'java.project.getClasspaths') return { projectRoot: 'file:///p', classpaths: [], modulepaths: [] };
      token.isCancellationRequested = true;
      return JSON.stringify({ results: [{ settings: {}, declaredSourceOutputs: {} }], errors: [] });
    } } as any });
    const { lookupJavaProjectClasspath } = require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');
    await assert.rejects(lookupJavaProjectClasspath('file:///p', { scope: 'runtime', token }));
  });

  it('uses one replacement command and decodes the singleton response', async () => {
    const calls: unknown[][] = [];
    const token = { isCancellationRequested: false } as any;
    const snapshot = { settings: {}, declaredSourceOutputs: { '/p/src': '/p/out' } };
    resetVscodeMock({ commands: { executeCommand: async (...args: unknown[]) => {
      calls.push(args);
      return JSON.stringify({ schemaVersion: 2, results: [snapshot], errors: [] });
    } } as any });
    const { requestJavaProjectSettings } = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    assert.deepStrictEqual(await requestJavaProjectSettings('file:///p', token), snapshot);
    assert.deepStrictEqual(calls, [['java.execute.workspaceCommand', 'java.spotbugs.project.settings', 'file:///p', token]]);
  });

  it('rejects malformed or failed responses without trying the old settings command', async () => {
    const { requestJavaProjectSettings } = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    for (const response of [
      '{',
      { results: [], errors: [] },
      { results: [{ settings: {}, declaredSourceOutputs: {} }, { settings: {}, declaredSourceOutputs: {} }] },
      { results: [{ settings: {}, declaredSourceOutputs: { '/p/src': 3 } }] },
      { results: [{ settings: {}, declaredSourceOutputs: {} }], errors: [{ code: 'COMMAND_FAILED', message: 'read failed' }] },
    ]) {
      let calls = 0;
      resetVscodeMock({ commands: { executeCommand: async () => { calls++; return response; } } } as any);
      await assert.rejects(requestJavaProjectSettings('file:///p'));
      assert.strictEqual(calls, 1);
    }
  });
});
