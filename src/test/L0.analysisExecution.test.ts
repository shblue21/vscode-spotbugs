import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { AnalysisSettings } from '../core/config';
import type { AnalysisExecutionUnit } from '../model/analysisExecutionUnit';
import type { AnalysisExecutorDeps } from '../services/analysisExecution';
import type { Finding } from '../model/finding';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

type AnalysisExecutionModule = typeof import('../services/analysisExecution');

function loadAnalysisExecution(): AnalysisExecutionModule {
  delete require.cache[require.resolve('../services/analysisExecution')];
  return require('../services/analysisExecution') as AnalysisExecutionModule;
}

function makeTarget(vscode: ReturnType<typeof installVscodeMock>): AnalysisExecutionUnit {
  const preferredResource = vscode.Uri.file('/workspace/sources') as unknown as Uri;
  return {
    inputs: [
      {
        kind: 'source' as const,
        path: '/workspace/build/classes',
        resolutionRoots: ['/workspace/build/classes'],
        sourceOutputs: Object.fromEntries([
          ['/workspace/src/main/java', '/workspace/build/classes'],
        ]),
      },
    ],
    environment: {
      runtimeClasspaths: ['/workspace/build/classes', '/workspace/lib/dependency.jar'],
    },
    sourceLookup: {
      preferredResource,
      roots: ['/workspace/src/main/java'],
    },
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP',
    type: 'NP_ALWAYS_NULL',
    message: 'Null pointer',
    location: {
      realSourcePath: 'com/acme/Foo.java',
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AnalysisExecutorDeps> = {}): AnalysisExecutorDeps {
  return {
    validateFilterFilesPreflight: async () => undefined,
    validateExtraAuxClasspathPreflight: async () => undefined,
    validatePluginJarsPreflight: async () => undefined,
    buildAnalysisRequestPayload: (settings, options) => ({
      schemaVersion: 2,
      inputs: [],
      effort: settings.effort,
      targetResolutionRoots: options.targetResolutionRoots ?? null,
      runtimeClasspaths: options.runtimeClasspaths ?? null,
      extraAuxClasspaths: options.extraAuxClasspaths ?? null,
      sourcepaths: options.sourcepaths ?? null,
    }),
    runSpotBugsAnalysis: async () =>
      JSON.stringify({
        schemaVersion: 2,
        inputs: [],
        results: [],
      }),
    parseAnalysisResponse: () => ({
      ok: true,
      value: {
        bugs: [],
      },
    }),
    mapBugsToFindings: () => [],
    addFullPaths: async (findings) => findings,
    logger: {
      log: () => undefined,
      error: () => undefined,
    },
    ...overrides,
  };
}

describe('analysisExecution', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
  });

  const preflightCases = [
    ['filter', 'CFG_INCLUDE_FILTER_NOT_FOUND', 'Include filter not found'],
    ['aux', 'CFG_AUX_CLASSPATH_NOT_FOUND', 'Extra aux classpath not found'],
    ['plugin', 'CFG_PLUGIN_NOT_FOUND', 'SpotBugs plugin jar not found'],
  ] as const;
  for (const [index, [stage, code, message]] of preflightCases.entries()) {
    it(`short-circuits ${stage} preflight failures before payload or backend execution`, async () => {
      const { createAnalysisExecutor } = loadAnalysisExecution();
      const callOrder: string[] = [];
      const backendCalls: unknown[] = [];
      const validate = (name: string) => async () => {
        callOrder.push(name);
        return name === stage ? { code, message } : undefined;
      };
      const executor = createAnalysisExecutor(makeDeps({
        validateFilterFilesPreflight: validate('filter'),
        validateExtraAuxClasspathPreflight: validate('aux'),
        validatePluginJarsPreflight: validate('plugin'),
        buildAnalysisRequestPayload: () => {
          throw new Error('buildAnalysisRequestPayload should not run');
        },
        runSpotBugsAnalysis: async (request) => {
          backendCalls.push(request);
          return JSON.stringify({ schemaVersion: 2, inputs: [], results: [] });
        },
      }));
      const outcome = await executor.run(
        { effort: 'default', ...(stage === 'plugin' ? { plugins: ['/workspace/missing-plugin.jar'] } : {}) },
        makeTarget(installVscodeMock()),
      );

      assert.deepStrictEqual(callOrder, preflightCases.slice(0, index + 1).map(([name]) => name));
      assert.deepStrictEqual(backendCalls, []);
      assert.deepStrictEqual(outcome.findings, []);
      assert.strictEqual(outcome.targetPath, '/workspace/build/classes');
      assert.strictEqual(outcome.errors?.[0]?.code, code);
      assert.strictEqual(outcome.failure?.kind, 'analysis-error');
      assert.strictEqual(outcome.failure?.code, code);
      assert.strictEqual(outcome.failure?.message, `SpotBugs analysis failed: [${code}] ${message}`);
    });
  }

  it('passes resolved target settings into the backend request and parser', async () => {
    const vscode = installVscodeMock();
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const settings: AnalysisSettings = {
      effort: 'max',
      extraAuxClasspaths: ['/workspace/lib/extra.jar'],
    };
    const target = makeTarget(vscode);
    const backendResponse = JSON.stringify({
      schemaVersion: 2,
      inputs: [],
      results: [],
    });
    const payload = {
      schemaVersion: 2,
      inputs: [],
      effort: 'max',
      targetResolutionRoots: ['/payload/root'],
      runtimeClasspaths: ['/payload/runtime'],
      extraAuxClasspaths: ['/payload/extra.jar'],
      sourcepaths: ['/payload/source'],
    };
    let builderSettings: AnalysisSettings | undefined;
    let builderOptions:
      | Parameters<AnalysisExecutorDeps['buildAnalysisRequestPayload']>[1]
      | undefined;
    let backendRequest: Parameters<AnalysisExecutorDeps['runSpotBugsAnalysis']>[0] | undefined;
    let parserInput: string | undefined;

    const executor = createAnalysisExecutor(
      makeDeps({
        buildAnalysisRequestPayload: (receivedSettings, options) => {
          builderSettings = receivedSettings;
          builderOptions = options;
          return payload;
        },
        runSpotBugsAnalysis: async (request) => {
          backendRequest = request;
          return backendResponse;
        },
        parseAnalysisResponse: (raw) => {
          parserInput = raw;
          return {
            ok: true,
            value: {
              bugs: [],
            },
          };
        },
      }),
    );

    await executor.run(settings, target);

    assert.strictEqual(builderSettings, settings);
    assert.deepStrictEqual(builderOptions, {
      inputs: [{ kind: 'source', path: target.inputs[0].path }],
      targetResolutionRoots: target.inputs[0].resolutionRoots,
      runtimeClasspaths: target.environment.runtimeClasspaths,
      extraAuxClasspaths: settings.extraAuxClasspaths,
      sourcepaths: target.sourceLookup.roots,
      sourceOutputs: target.inputs[0].sourceOutputs,
    });
    assert.deepStrictEqual(backendRequest, {
      targetPath: target.inputs[0].path,
      payload,
    });
    assert.strictEqual(backendRequest?.payload, payload);
    assert.strictEqual(parserInput, backendResponse);
  });

  it('returns ANALYSIS_NO_RESPONSE when backend returns no payload', async () => {
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const executor = createAnalysisExecutor(
      makeDeps({
        runSpotBugsAnalysis: async () => undefined,
        addFullPaths: async () => {
          throw new Error('addFullPaths should not run');
        },
      }),
    );

    const outcome = await executor.run({ effort: 'default' }, makeTarget(installVscodeMock()));

    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.targetPath, '/workspace/build/classes');
    assert.strictEqual(outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(outcome.failure?.code, 'ANALYSIS_NO_RESPONSE');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: No response from SpotBugs backend.',
    );
  });

  it('preserves terminal backend errors with stats and schemaVersion', async () => {
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const executor = createAnalysisExecutor(
      makeDeps({
        parseAnalysisResponse: () => ({
          ok: true,
          value: {
            bugs: [],
            errors: [{ code: 'ANALYSIS_FAILED', message: 'boom' }],
            warnings: [
              {
                code: 'PLUGIN_CLEANUP_FAILED',
                message: 'Could not delete plugin',
              },
            ],
            stats: {
              target: '/workspace/build/classes',
              durationMs: 9,
              spotbugsVersion: '4.9.8',
            },
            schemaVersion: 2,
            inputs: [],
          },
        }),
      }),
    );

    const outcome = await executor.run({ effort: 'default' }, makeTarget(installVscodeMock()));

    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.errors?.[0]?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(outcome.warnings, undefined);
    assert.strictEqual(outcome.stats?.target, '/workspace/build/classes');
    assert.strictEqual(outcome.schemaVersion, 2);
    assert.strictEqual(outcome.failure?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
    );
  });

  it('returns partial-success findings with backend errors and enriched paths', async () => {
    const vscode = installVscodeMock();
    const { createAnalysisExecutor } = loadAnalysisExecution();
    let addFullPathsProject: Uri | undefined;
    let addFullPathsSourcepaths: readonly string[] | null | undefined;
    const mappedFinding = makeFinding();
    const enrichedFinding = makeFinding({
      location: {
        realSourcePath: 'com/acme/Foo.java',
        fullPath: '/workspace/src/main/java/com/acme/Foo.java',
      },
    });
    const executor = createAnalysisExecutor(
      makeDeps({
        parseAnalysisResponse: () => ({
          ok: true,
          value: {
            bugs: [{ type: 'NP_ALWAYS_NULL' }],
            errors: [{ code: 'ANALYSIS_WARNING', message: 'partial' }],
            stats: {
              target: '/workspace/build/classes',
              durationMs: 12,
            },
            reportSummary: { analyzedClassCount: 3 },
            nativeSarif: '{"version":"2.1.0","runs":[]}',
            schemaVersion: 2,
            inputs: [],
          },
        }),
        mapBugsToFindings: () => [mappedFinding],
        addFullPaths: async (findings, preferredProject, sourcepaths) => {
          assert.deepStrictEqual(findings, [mappedFinding]);
          addFullPathsProject = preferredProject;
          addFullPathsSourcepaths = sourcepaths;
          return [enrichedFinding];
        },
      }),
    );

    const target = makeTarget(vscode);
    const outcome = await executor.run({ effort: 'default' }, target);

    assert.strictEqual(
      addFullPathsProject?.toString(),
      target.sourceLookup.preferredResource?.toString(),
    );
    assert.deepStrictEqual(addFullPathsSourcepaths, target.sourceLookup.roots);
    assert.deepStrictEqual(outcome.findings, [enrichedFinding]);
    assert.strictEqual(outcome.errors?.[0]?.code, 'ANALYSIS_WARNING');
    assert.strictEqual(outcome.failure, undefined);
    assert.strictEqual(outcome.stats?.durationMs, 12);
    assert.strictEqual(outcome.reportSummary?.analyzedClassCount, 3);
    assert.strictEqual(outcome.nativeSarif, '{"version":"2.1.0","runs":[]}');
    assert.strictEqual(outcome.schemaVersion, 2);
  });

  it('keeps the analysis-start sourcepath snapshot through backend execution', async () => {
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const target = makeTarget(installVscodeMock());
    let backendSourcepaths: string[] | null | undefined;
    let enrichmentSourcepaths: readonly string[] | null | undefined;
    const executor = createAnalysisExecutor(
      makeDeps({
        runSpotBugsAnalysis: async (request) => {
          backendSourcepaths = request.payload.sourcepaths;
          const roots = target.sourceLookup.roots as string[];
          roots.splice(0, roots.length, '/mutated');
          return JSON.stringify({ schemaVersion: 2, inputs: [], results: [] });
        },
        parseAnalysisResponse: () => ({
          ok: true,
          value: {
            bugs: [{ type: 'NP_ALWAYS_NULL' }],
          },
        }),
        mapBugsToFindings: () => [makeFinding()],
        addFullPaths: async (findings, _preferredProject, sourcepaths) => {
          enrichmentSourcepaths = sourcepaths;
          return findings;
        },
      }),
    );

    await executor.run({ effort: 'default' }, target);

    assert.deepStrictEqual(backendSourcepaths, ['/workspace/src/main/java']);
    assert.deepStrictEqual(enrichmentSourcepaths, ['/workspace/src/main/java']);
  });
});
