import * as assert from 'assert';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function analysisTarget(
  path: string,
  resource: any,
  options: {
    resolutionRoots?: string[];
    runtimeClasspaths?: string[];
    sourcepaths?: string[];
    sourceOutputs?: Record<string, string>;
    diagnosticScope?: any;
  } = {},
) {
  return {
    unit: {
      inputs: [
        {
          kind: 'source' as const,
          path,
          resolutionRoots: options.resolutionRoots,
          sourceOutputs: options.sourceOutputs,
        },
      ],
      environment: { runtimeClasspaths: options.runtimeClasspaths },
      sourceLookup: {
        preferredResource: resource,
        roots: options.sourcepaths,
      },
    },
    diagnosticScope: options.diagnosticScope,
  };
}

describe('analysisService', () => {
  let vscode: ReturnType<typeof installVscodeMock>;
  let resolverModule: typeof import('../workspace/analysisTargetResolver');
  let spotbugsClient: typeof import('../lsp/spotbugsClient');
  let service: typeof import('../services/analysisService');
  let restoreMocks: () => void;

  beforeEach(() => {
    vscode = installVscodeMock();
    resetVscodeMock();
    resolverModule = require('../workspace/analysisTargetResolver');
    spotbugsClient = require('../lsp/spotbugsClient');
    const originalResolver = { ...resolverModule };
    const originalClient = { ...spotbugsClient };
    restoreMocks = () => {
      Object.assign(resolverModule, originalResolver);
      Object.assign(spotbugsClient, originalClient);
    };
    service = require('../services/analysisService');
  });

  afterEach(() => restoreMocks());

  it('preserves every source input for a project instead of inferring artifacts from paths', async () => {
    const resource = vscode.Uri.file('/workspace') as any;
    const inputs = [
      { kind: 'source' as const, path: '/workspace/src/A.java' },
      { kind: 'source' as const, path: '/workspace/src/B.java' },
    ];
    resolverModule.resolveProjectAnalysisTargetDetailed = async () => ({
      resolution: { status: 'ok', target: {
        unit: { inputs, environment: {}, sourceLookup: {} },
      } }, issues: [],
    });
    const requests: unknown[] = [];
    spotbugsClient.runSpotBugsAnalysis = async (request) => {
      requests.push(request.payload.inputs);
      return undefined;
    };
    await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      resource, [resource.toString()],
    );
    assert.deepStrictEqual(requests, [inputs]);
  });

  it('returns resolution issues through analyzeFileDetailed', async () => {
    resolverModule.resolveFileAnalysisTargetDetailed = (async () => ({
      resolution: {
        status: 'no-class-targets',
        errorCode: 'NO_CLASS_TARGETS',
        message: 'No class targets',
      },
      issues: [
        {
          code: 'OUTPUT_FALLBACK_USED',
          level: 'info',
          source: 'target-resolution',
          phase: 'output-fallback',
          message:
            'Output folder fallback was used because Java build output metadata was unavailable or unusable for the selected target.',
        },
      ],
    })) as typeof resolverModule.resolveFileAnalysisTargetDetailed;

    const detailed = await service.analyzeFileDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace/src/Foo.java') as any,
    );
    assert.deepStrictEqual(
      detailed.context.resolutionIssues.map((issue) => issue.code),
      ['OUTPUT_FALLBACK_USED'],
    );
    assert.strictEqual(detailed.outcome.failure?.code, 'NO_CLASS_TARGETS');
  });

  it('carries file-analysis diagnostic scope into detailed analysis context', async () => {
    const folderUri = vscode.Uri.file('/workspace/src') as any;
    const token = { isCancellationRequested: false } as any;
    let receivedToken: unknown;

    resolverModule.resolveFileAnalysisTargetDetailed = (async (_uri, actualToken) => {
      assert.strictEqual(actualToken, token);
      return {
        resolution: {
          status: 'ok',
          target: analysisTarget('/workspace/build/classes', folderUri, {
            resolutionRoots: ['/workspace/build/classes'],
            runtimeClasspaths: ['/workspace/build/classes'],
            sourcepaths: ['/workspace/src'],
            diagnosticScope: { kind: 'folder', uri: folderUri },
          }),
        },
        issues: [],
      };
    }) as typeof resolverModule.resolveFileAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async (request, actualToken) => {
      receivedToken = actualToken;
      assert.strictEqual(request.payload.includeBaselineXml, undefined);
      return undefined;
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeFileDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      folderUri,
      token,
    );

    assert.strictEqual(receivedToken, token);
    assert.strictEqual(result.context.diagnosticScope?.kind, 'folder');
    assert.strictEqual(result.context.diagnosticScope?.uri.fsPath, folderUri.fsPath);
  });

  it('aggregates per-project resolution issues in analyzeWorkspaceFromProjectsDetailed', async () => {
    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'no-class-targets',
        errorCode: 'NO_CLASS_TARGETS',
        message: `No classes for ${projectUri.toString()}`,
      },
      issues: [
        {
          code: projectUri.toString().includes('project-a')
            ? 'JAVA_LS_REQUEST_FAILED'
            : 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-classpaths',
          message: 'Resolution issue',
        },
      ],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;

    const detailed = await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b'],
    );
    assert.deepStrictEqual(
      detailed.context.resolutionIssues.map((issue) => issue.code),
      ['JAVA_LS_REQUEST_FAILED', 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH'],
    );
    assert.strictEqual(detailed.results.length, 2);
  });

  it('aggregates backend cleanup warnings in workspace context without adding project result state', async () => {
    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: analysisTarget(
          `/workspace/${projectUri.toString().split('/').pop()}/target/classes`,
          projectUri,
          {
            resolutionRoots: ['/workspace/project/target/classes'],
            runtimeClasspaths: ['/workspace/project/target/classes'],
            sourcepaths: ['/workspace/project/src/main/java'],
          },
        ),
      },
      issues: [],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () =>
      JSON.stringify({
        results: [],
        warnings: [
          {
            code: 'PLUGIN_CLEANUP_FAILED',
            message: 'Could not delete plugin jar',
          },
        ],
        stats: {
          target: '/workspace/project-a/target/classes',
          durationMs: 4,
        },
      })) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a'],
    );

    assert.deepStrictEqual(result.context.cleanupWarnings, [
      {
        projectUri: 'file:///workspace/project-a',
        warning: {
          code: 'PLUGIN_CLEANUP_FAILED',
          message: 'Could not delete plugin jar',
        },
      },
    ]);
    assert.deepStrictEqual(result.results, [
      {
        projectUri: 'file:///workspace/project-a',
        findings: [],
      },
    ]);
  });

  it('snapshots analysis settings for every project before a workspace run', async () => {
    const receivedEfforts: string[] = [];
    const settingsResources: string[] = [];
    const events: string[] = [];
    let configuredEffort = 'min';
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spotbugs-snapshot-'));
    const pluginPath = path.join(directory, 'plugin.jar');
    await writeFile(pluginPath, '');
    const plugins = [{ path: pluginPath }];
    const baselineXml = '<BugCollection/>';

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => {
      const project = projectUri.toString().split('/').pop();
      events.push(`resolve:${project}`);
      plugins[0].path = '/changed.jar';
      return {
        resolution: {
          status: 'ok',
          target: analysisTarget(`/workspace/${project}/classes`, projectUri),
        },
        issues: [],
      };
    }) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async (request) => {
      events.push(`execute:${request.targetPath}`);
      receivedEfforts.push(request.payload.effort);
      assert.strictEqual(request.payload.plugins?.[0].path, pluginPath);
      assert.strictEqual(request.payload.includeBaselineXml, true);
      configuredEffort = 'max';
      return JSON.stringify({ results: [], baselineXml });
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      {
        getAnalysisSettings: (resource?: { toString(): string }) => {
          const resourceString = resource?.toString() ?? '';
          settingsResources.push(resourceString);
          events.push(`settings:${resourceString.split('/').pop()}`);
          return { effort: configuredEffort, plugins };
        },
      } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b'],
      {
        onStart: (projectUri) => events.push(`start:${projectUri.split('/').pop()}`),
        onDone: (projectUri) => events.push(`done:${projectUri.split('/').pop()}`),
      },
    ).finally(() => rm(directory, { recursive: true, force: true }));

    assert.deepStrictEqual(settingsResources, [
      'file:///workspace/project-a',
      'file:///workspace/project-b',
    ]);
    assert.deepStrictEqual(receivedEfforts, ['min', 'min']);
    assert.ok(result.results.every((project) => project.baselineXml === baselineXml));
    assert.deepStrictEqual(events, [
      'settings:project-a',
      'settings:project-b',
      'resolve:project-a',
      'resolve:project-b',
      'start:project-a',
      'execute:/workspace/project-a/classes',
      'done:project-a',
      'start:project-b',
      'execute:/workspace/project-b/classes',
      'done:project-b',
    ]);
  });

  it('preserves file resolution issues when analysis execution throws after target resolution', async () => {
    resolverModule.resolveFileAnalysisTargetDetailed = (async () => ({
      resolution: {
        status: 'ok',
        target: analysisTarget(
          '/workspace/build/classes',
          vscode.Uri.file('/workspace/src/Foo.java') as any,
          {
            resolutionRoots: ['/workspace/build/classes'],
            runtimeClasspaths: ['/workspace/build/classes'],
            sourcepaths: ['/workspace/src/main/java'],
          },
        ),
      },
      issues: [
        {
          code: 'JAVA_LS_REQUEST_FAILED',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-classpaths',
          message: 'Java LS classpath lookup failed.',
        },
      ],
    })) as typeof resolverModule.resolveFileAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () => {
      throw new Error('analysis boom');
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeFileDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace/src/Foo.java') as any,
    );

    assert.deepStrictEqual(
      result.context.resolutionIssues.map((issue) => issue.code),
      ['JAVA_LS_REQUEST_FAILED'],
    );
    assert.deepStrictEqual(result.outcome.findings, []);
    assert.strictEqual(result.outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(result.outcome.failure?.level, 'error');
    assert.strictEqual(result.outcome.failure?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(result.outcome.failure?.message, 'SpotBugs analysis failed: analysis boom');
    assert.strictEqual(result.outcome.targetPath, '/workspace/build/classes');
  });

  it('preserves workspace/project resolution issues when analysis execution throws after target resolution', async () => {
    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: analysisTarget(
          `/workspace/out/${projectUri.toString().split('/').pop()}`,
          projectUri,
          {
            resolutionRoots: ['/workspace/out'],
            runtimeClasspaths: ['/workspace/out'],
            sourcepaths: ['/workspace/src'],
          },
        ),
      },
      issues: [
        {
          code: projectUri.toString().includes('project-a')
            ? 'JAVA_LS_REQUEST_FAILED'
            : 'OUTPUT_FALLBACK_USED',
          level: projectUri.toString().includes('project-a') ? 'warn' : 'info',
          source: projectUri.toString().includes('project-a') ? 'java-ls' : 'target-resolution',
          phase: projectUri.toString().includes('project-a') ? 'get-classpaths' : 'output-fallback',
          message: 'Resolution issue',
        },
      ],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () => {
      throw new Error('analysis boom');
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b'],
    );

    assert.deepStrictEqual(
      result.context.resolutionIssues.map((issue) => issue.code),
      ['JAVA_LS_REQUEST_FAILED', 'OUTPUT_FALLBACK_USED'],
    );
    assert.deepStrictEqual(
      result.results.map((project) => project.error),
      ['analysis boom', 'analysis boom'],
    );
  });

  it('stops workspace analysis when backend returns ANALYSIS_CANCELLED envelopes', async () => {
    const analyzedTargets: string[] = [];

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: analysisTarget(
          `/workspace/${projectUri.toString().split('/').pop()}/target/classes`,
          projectUri,
          {
            resolutionRoots: ['/workspace/project/target/classes'],
            runtimeClasspaths: ['/workspace/project/target/classes'],
            sourcepaths: ['/workspace/project/src/main/java'],
          },
        ),
      },
      issues: [],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async (request) => {
      analyzedTargets.push(request.targetPath);
      return JSON.stringify({
        results: [],
        errors: [
          {
            code: 'ANALYSIS_CANCELLED',
            message: 'Command cancelled',
          },
        ],
        stats: {
          target: '/workspace/project-a/target/classes',
          durationMs: 4,
          spotbugsVersion: '4.8.3',
        },
      });
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b'],
    );

    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].projectUri, 'file:///workspace/project-a');
    assert.strictEqual(result.results[0].errorCode, 'ANALYSIS_CANCELLED');
    assert.deepStrictEqual(analyzedTargets, ['/workspace/project-a/target/classes']);
  });

  it('treats a rejected backend request as cancellation when the token is cancelled', async () => {
    const token = { isCancellationRequested: false } as any;
    const analyzedTargets: string[] = [];
    const failedProjects: string[] = [];

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: analysisTarget(
          `/workspace/${projectUri.toString().split('/').pop()}/target/classes`,
          projectUri,
        ),
      },
      issues: [],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async (request, receivedToken) => {
      analyzedTargets.push(request.targetPath);
      assert.strictEqual(receivedToken, token);
      token.isCancellationRequested = true;
      throw new Error('request cancelled');
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b'],
      { onFail: (projectUri) => failedProjects.push(projectUri) },
      token,
    );

    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.results.length, 1);
    assert.deepStrictEqual(failedProjects, []);
    assert.deepStrictEqual(analyzedTargets, ['/workspace/project-a/target/classes']);
  });

  it('stops after project resolution when the token becomes cancelled', async () => {
    const token = { isCancellationRequested: false } as any;
    const events: string[] = [];

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => {
      events.push(`resolve:${projectUri.toString().split('/').pop()}`);
      token.isCancellationRequested = true;
      return {
        resolution: {
          status: 'ok',
          target: analysisTarget('/workspace/project-a/classes', projectUri),
        },
        issues: [],
      };
    }) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () => {
      events.push('execute');
      return undefined;
    }) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      {
        getAnalysisSettings: (resource?: { toString(): string }) => {
          events.push(`settings:${resource?.toString().split('/').pop()}`);
          return { effort: 'default' };
        },
      } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b'],
      {
        onStart: (projectUri) => events.push(`start:${projectUri.split('/').pop()}`),
        onDone: () => events.push('done'),
        onFail: () => events.push('fail'),
      },
      token,
    );

    assert.strictEqual(result.cancelled, true);
    assert.deepStrictEqual(
      result.results.map((project) => project.errorCode),
      ['ANALYSIS_CANCELLED'],
    );
    assert.deepStrictEqual(events, [
      'settings:project-a',
      'settings:project-b',
      'resolve:project-a',
    ]);
  });
});
