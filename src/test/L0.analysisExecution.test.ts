import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { AnalysisSettings } from '../core/config';
import type {
  AnalysisExecutionTarget,
  AnalysisExecutorDeps,
} from '../services/analysisExecution';
import type { Finding } from '../model/finding';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

type AnalysisExecutionModule = typeof import('../services/analysisExecution');

function loadAnalysisExecution(): AnalysisExecutionModule {
  delete require.cache[require.resolve('../services/analysisExecution')];
  return require('../services/analysisExecution') as AnalysisExecutionModule;
}

function makeConfig(settings: AnalysisSettings = { effort: 'default' }) {
  return {
    getAnalysisSettings: (_resource?: Uri) => settings,
  };
}

function makeTarget(
  vscode: ReturnType<typeof installVscodeMock>
): AnalysisExecutionTarget {
  return {
    targetPath: '/workspace/build/classes',
    preferredProject: vscode.Uri.file('/workspace') as unknown as Uri,
    targetResolutionRoots: ['/workspace/build/classes'],
    runtimeClasspaths: ['/workspace/build/classes', '/workspace/lib/dependency.jar'],
    sourcepaths: ['/workspace/src/main/java'],
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
      effort: settings.effort,
      targetResolutionRoots: options.targetResolutionRoots ?? null,
      runtimeClasspaths: options.runtimeClasspaths ?? null,
      extraAuxClasspaths: options.extraAuxClasspaths ?? null,
      sourcepaths: options.sourcepaths ?? null,
    }),
    runSpotBugsAnalysis: async () =>
      JSON.stringify({
        schemaVersion: 2,
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

  it('short-circuits filter preflight failures before backend execution', async () => {
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const backendCalls: unknown[] = [];
    const executor = createAnalysisExecutor(
      makeDeps({
        validateFilterFilesPreflight: async () => ({
          code: 'CFG_INCLUDE_FILTER_NOT_FOUND',
          message: 'Include filter not found',
        }),
        runSpotBugsAnalysis: async (request) => {
          backendCalls.push(request);
          return JSON.stringify({ schemaVersion: 2, results: [] });
        },
      })
    );

    const outcome = await executor.run(
      makeConfig(),
      makeTarget(installVscodeMock())
    );

    assert.deepStrictEqual(backendCalls, []);
    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.targetPath, '/workspace/build/classes');
    assert.strictEqual(outcome.errors?.[0]?.code, 'CFG_INCLUDE_FILTER_NOT_FOUND');
    assert.strictEqual(outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(outcome.failure?.code, 'CFG_INCLUDE_FILTER_NOT_FOUND');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: [CFG_INCLUDE_FILTER_NOT_FOUND] Include filter not found'
    );
  });

  it('short-circuits extra aux classpath preflight failures before backend execution', async () => {
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const callOrder: string[] = [];
    const backendCalls: unknown[] = [];
    const executor = createAnalysisExecutor(
      makeDeps({
        validateFilterFilesPreflight: async () => {
          callOrder.push('filter');
          return undefined;
        },
        validateExtraAuxClasspathPreflight: async () => {
          callOrder.push('aux');
          return {
            code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
            message: 'Extra aux classpath not found',
          };
        },
        runSpotBugsAnalysis: async (request) => {
          backendCalls.push(request);
          return JSON.stringify({ schemaVersion: 2, results: [] });
        },
      })
    );

    const outcome = await executor.run(
      makeConfig(),
      makeTarget(installVscodeMock())
    );

    assert.deepStrictEqual(callOrder, ['filter', 'aux']);
    assert.deepStrictEqual(backendCalls, []);
    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.targetPath, '/workspace/build/classes');
    assert.strictEqual(outcome.errors?.[0]?.code, 'CFG_AUX_CLASSPATH_NOT_FOUND');
    assert.strictEqual(outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(outcome.failure?.code, 'CFG_AUX_CLASSPATH_NOT_FOUND');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_NOT_FOUND] Extra aux classpath not found'
    );
  });

  it('short-circuits plugin jar preflight failures before backend execution', async () => {
    const { createAnalysisExecutor } = loadAnalysisExecution();
    const callOrder: string[] = [];
    const backendCalls: unknown[] = [];
    const executor = createAnalysisExecutor(
      makeDeps({
        validateFilterFilesPreflight: async () => {
          callOrder.push('filter');
          return undefined;
        },
        validateExtraAuxClasspathPreflight: async () => {
          callOrder.push('aux');
          return undefined;
        },
        validatePluginJarsPreflight: async () => {
          callOrder.push('plugin');
          return {
            code: 'CFG_PLUGIN_NOT_FOUND',
            message: 'SpotBugs plugin jar not found',
          };
        },
        buildAnalysisRequestPayload: () => {
          throw new Error('buildAnalysisRequestPayload should not run');
        },
        runSpotBugsAnalysis: async (request) => {
          backendCalls.push(request);
          return JSON.stringify({ schemaVersion: 2, results: [] });
        },
      })
    );

    const outcome = await executor.run(
      makeConfig({ effort: 'default', plugins: ['/workspace/missing-plugin.jar'] }),
      makeTarget(installVscodeMock())
    );

    assert.deepStrictEqual(callOrder, ['filter', 'aux', 'plugin']);
    assert.deepStrictEqual(backendCalls, []);
    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.targetPath, '/workspace/build/classes');
    assert.strictEqual(outcome.errors?.[0]?.code, 'CFG_PLUGIN_NOT_FOUND');
    assert.strictEqual(outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(outcome.failure?.code, 'CFG_PLUGIN_NOT_FOUND');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: [CFG_PLUGIN_NOT_FOUND] SpotBugs plugin jar not found'
    );
  });

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
      results: [],
    });
    const payload = {
      schemaVersion: 2,
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
    let backendRequest:
      | Parameters<AnalysisExecutorDeps['runSpotBugsAnalysis']>[0]
      | undefined;
    let parserInput: string | undefined;
    let settingsResource: Uri | undefined;

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
      })
    );

    await executor.run(
      {
        getAnalysisSettings: (resource?: Uri) => {
          settingsResource = resource;
          return settings;
        },
      },
      target
    );

    assert.strictEqual(settingsResource, target.preferredProject);
    assert.strictEqual(builderSettings, settings);
    assert.deepStrictEqual(builderOptions, {
      targetResolutionRoots: target.targetResolutionRoots,
      runtimeClasspaths: target.runtimeClasspaths,
      extraAuxClasspaths: settings.extraAuxClasspaths,
      sourcepaths: target.sourcepaths,
    });
    assert.deepStrictEqual(backendRequest, {
      targetPath: target.targetPath,
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
      })
    );

    const outcome = await executor.run(
      makeConfig(),
      makeTarget(installVscodeMock())
    );

    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.targetPath, '/workspace/build/classes');
    assert.strictEqual(outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(outcome.failure?.code, 'ANALYSIS_NO_RESPONSE');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: No response from SpotBugs backend.'
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
          },
        }),
      })
    );

    const outcome = await executor.run(
      makeConfig(),
      makeTarget(installVscodeMock())
    );

    assert.deepStrictEqual(outcome.findings, []);
    assert.strictEqual(outcome.errors?.[0]?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(outcome.warnings, undefined);
    assert.strictEqual(outcome.stats?.target, '/workspace/build/classes');
    assert.strictEqual(outcome.schemaVersion, 2);
    assert.strictEqual(outcome.failure?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(
      outcome.failure?.message,
      'SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
  });

  it('returns partial-success findings with backend errors and enriched paths', async () => {
    const vscode = installVscodeMock();
    const { createAnalysisExecutor } = loadAnalysisExecution();
    let addFullPathsProject: Uri | undefined;
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
            schemaVersion: 2,
          },
        }),
        mapBugsToFindings: () => [mappedFinding],
        addFullPaths: async (findings, preferredProject) => {
          assert.deepStrictEqual(findings, [mappedFinding]);
          addFullPathsProject = preferredProject;
          return [enrichedFinding];
        },
      })
    );

    const target = makeTarget(vscode);
    const outcome = await executor.run(makeConfig(), target);

    assert.strictEqual(
      addFullPathsProject?.toString(),
      target.preferredProject?.toString()
    );
    assert.deepStrictEqual(outcome.findings, [enrichedFinding]);
    assert.strictEqual(outcome.errors?.[0]?.code, 'ANALYSIS_WARNING');
    assert.strictEqual(outcome.failure, undefined);
    assert.strictEqual(outcome.stats?.durationMs, 12);
    assert.strictEqual(outcome.reportSummary?.analyzedClassCount, 3);
    assert.strictEqual(outcome.schemaVersion, 2);
  });

});
