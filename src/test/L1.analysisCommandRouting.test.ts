import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import type { AnalysisRequest } from '../model/analysisProtocol';

describe('analysis command boundaries', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    delete require.cache[require.resolve('../lsp/spotbugsClient')];
    delete require.cache[require.resolve('../lsp/javaLsGateway')];
  });

  for (const kind of ['source', 'artifact'] as const) {
    it(`routes all ${kind} inputs in one request without changing the payload`, async () => {
      const calls: unknown[][] = [];
      resetVscodeMock({ commands: { executeCommand: async (...args: unknown[]) => {
        calls.push(args);
        return 'response';
      } } as any });
      const { runSpotBugsAnalysis } = require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
      const token = { isCancellationRequested: false } as any;
      const request: AnalysisRequest = {
        targetPath: '/display/project',
        payload: { schemaVersion: 2, effort: 'default',
          inputs: [{ kind, path: '/first' }, { kind, path: '/second' }],
          runtimeClasspaths: ['/runtime'], sourcepaths: ['/navigation'], includeBaselineXml: true,
        },
      };
      const originalPayload = JSON.stringify(request.payload);
      assert.strictEqual(await runSpotBugsAnalysis(request, token), 'response');
      assert.deepStrictEqual(calls, [[
        'java.execute.workspaceCommand',
        kind === 'source' ? 'java.spotbugs.analyzeSources' : 'java.spotbugs.analyzeArtifacts',
        '/display/project', originalPayload, token,
      ]]);
      assert.strictEqual(JSON.stringify(request.payload), originalPayload);
    });

    it(`does not retry ${kind} failures with the other endpoint or old run command`, async () => {
      const calls: string[] = [];
      resetVscodeMock({ commands: { executeCommand: async (_outer: string, command: string) => {
        calls.push(command);
        throw new Error('Unknown command');
      } } as any });
      const { runSpotBugsAnalysis } = require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
      await assert.rejects(runSpotBugsAnalysis({ targetPath: '/display', payload: {
        schemaVersion: 2, effort: 'default', inputs: [{ kind, path: '/input' }],
      } }), /Unknown command/);
      assert.deepStrictEqual(calls, [kind === 'source' ? 'java.spotbugs.analyzeSources' : 'java.spotbugs.analyzeArtifacts']);
    });
  }

  it('rejects empty and mixed units before dispatch instead of splitting or using the first input', async () => {
    let calls = 0;
    resetVscodeMock({ commands: { executeCommand: async () => { calls++; } } } as any);
    const { runSpotBugsAnalysis } = require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    for (const inputs of [[], [{ kind: 'source', path: '/a' }, { kind: 'artifact', path: '/b' }],
      [{ kind: 'artifact', path: '/b' }, { kind: 'source', path: '/a' }]]) {
      await assert.rejects(runSpotBugsAnalysis({ targetPath: '/display', payload: {
        schemaVersion: 2, effort: 'default', inputs,
      } } as AnalysisRequest), /inputs of one kind/);
    }
    assert.strictEqual(calls, 0);
  });
});
