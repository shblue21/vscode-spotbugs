import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
}

function backendErrorEnvelope(
  code: string,
  message: string,
  targetPath: string,
  durationMs = 9
): string {
  return JSON.stringify({
    schemaVersion: 2,
    results: [],
    errors: [
      {
        code,
        message,
      },
    ],
    stats: {
      target: targetPath,
      durationMs,
      spotbugsVersion: '4.8.3',
    },
  });
}

describe('analysisService', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    clearModule('../services/analysisService');
    clearModule('../workspace/analysisTargetResolver');
    clearModule('../workspace/pathResolver');
    clearModule('../lsp/spotbugsClient');
  });

  it('returns resolution issues through analyzeFileDetailed while preserving the public analyzeFile contract', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

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
          message: 'Output folder fallback was used because Java build output metadata was unavailable.',
        },
      ],
    })) as typeof resolverModule.resolveFileAnalysisTargetDetailed;

    const detailed = await service.analyzeFileDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace/src/Foo.java') as any
    );
    const publicOutcome = await service.analyzeFile(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace/src/Foo.java') as any
    );

    assert.deepStrictEqual(detailed.context.resolutionIssues.map((issue) => issue.code), [
      'OUTPUT_FALLBACK_USED',
    ]);
    assert.strictEqual(detailed.outcome.failure?.code, 'NO_CLASS_TARGETS');
    assert.strictEqual(publicOutcome.failure?.code, 'NO_CLASS_TARGETS');
  });

  it('aggregates per-project resolution issues in analyzeWorkspaceFromProjectsDetailed', async () => {
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

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
      installVscodeMock().Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b']
    );
    const legacy = await service.analyzeWorkspaceFromProjects(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      installVscodeMock().Uri.file('/workspace') as any,
      ['file:///workspace/project-a', 'file:///workspace/project-b']
    );

    assert.deepStrictEqual(
      detailed.context.resolutionIssues.map((issue) => issue.code),
      ['JAVA_LS_REQUEST_FAILED', 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH']
    );
    assert.strictEqual(detailed.results.length, 2);
    assert.strictEqual('context' in (legacy as any), false);
    assert.strictEqual(legacy.results.length, 2);
  });

  it('preserves file resolution issues when analysis execution throws after target resolution', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const spotbugsClient =
      require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

    resolverModule.resolveFileAnalysisTargetDetailed = (async () => ({
      resolution: {
        status: 'ok',
        target: {
          targetPath: '/workspace/build/classes',
          preferredProject: vscode.Uri.file('/workspace/src/Foo.java') as any,
          targetResolutionRoots: ['/workspace/build/classes'],
          runtimeClasspaths: ['/workspace/build/classes'],
          sourcepaths: ['/workspace/src/main/java'],
        },
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
      vscode.Uri.file('/workspace/src/Foo.java') as any
    );

    assert.deepStrictEqual(result.context.resolutionIssues.map((issue) => issue.code), [
      'JAVA_LS_REQUEST_FAILED',
    ]);
    assert.deepStrictEqual(result.outcome.findings, []);
    assert.strictEqual(result.outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(result.outcome.failure?.level, 'error');
    assert.strictEqual(result.outcome.failure?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(
      result.outcome.failure?.message,
      'SpotBugs analysis failed: analysis boom'
    );
    assert.strictEqual(result.outcome.targetPath, '/workspace/build/classes');
  });

  it('turns missing backend responses into file analysis failure outcomes', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const spotbugsClient =
      require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

    resolverModule.resolveFileAnalysisTargetDetailed = (async () => ({
      resolution: {
        status: 'ok',
        target: {
          targetPath: '/workspace/build/classes',
          preferredProject: vscode.Uri.file('/workspace/src/Foo.java') as any,
          targetResolutionRoots: ['/workspace/build/classes'],
          runtimeClasspaths: ['/workspace/build/classes'],
          sourcepaths: ['/workspace/src/main/java'],
        },
      },
      issues: [],
    })) as typeof resolverModule.resolveFileAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () =>
      undefined) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeFileDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace/src/Foo.java') as any
    );

    assert.deepStrictEqual(result.outcome.findings, []);
    assert.strictEqual(result.outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(result.outcome.failure?.level, 'error');
    assert.strictEqual(result.outcome.failure?.code, 'ANALYSIS_NO_RESPONSE');
    assert.strictEqual(
      result.outcome.failure?.message,
      'SpotBugs analysis failed: No response from SpotBugs backend.'
    );
    assert.strictEqual(result.outcome.targetPath, '/workspace/build/classes');
  });

  it('turns backend ANALYSIS_FAILED envelopes into file analysis failure outcomes', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const spotbugsClient =
      require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

    resolverModule.resolveFileAnalysisTargetDetailed = (async () => ({
      resolution: {
        status: 'ok',
        target: {
          targetPath: '/workspace/build/classes',
          preferredProject: vscode.Uri.file('/workspace/src/Foo.java') as any,
          targetResolutionRoots: ['/workspace/build/classes'],
          runtimeClasspaths: ['/workspace/build/classes'],
          sourcepaths: ['/workspace/src/main/java'],
        },
      },
      issues: [],
    })) as typeof resolverModule.resolveFileAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () =>
      backendErrorEnvelope(
        'ANALYSIS_FAILED',
        'boom',
        '/workspace/build/classes'
      )) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeFileDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace/src/Foo.java') as any
    );

    assert.deepStrictEqual(result.outcome.findings, []);
    assert.strictEqual(result.outcome.failure?.kind, 'analysis-error');
    assert.strictEqual(result.outcome.failure?.level, 'error');
    assert.strictEqual(result.outcome.failure?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(
      result.outcome.failure?.message,
      'SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(result.outcome.errors?.[0]?.code, 'ANALYSIS_FAILED');
    assert.strictEqual(result.outcome.stats?.target, '/workspace/build/classes');
    assert.strictEqual(result.outcome.schemaVersion, 2);
  });

  it('preserves workspace/project resolution issues when analysis execution throws after target resolution', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const spotbugsClient =
      require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: {
          targetPath: `/workspace/out/${projectUri.toString().split('/').pop()}`,
          preferredProject: projectUri,
          targetResolutionRoots: ['/workspace/out'],
          runtimeClasspaths: ['/workspace/out'],
          sourcepaths: ['/workspace/src'],
        },
      },
      issues: [
        {
          code: projectUri.toString().includes('project-a')
            ? 'JAVA_LS_REQUEST_FAILED'
            : 'OUTPUT_FALLBACK_USED',
          level: projectUri.toString().includes('project-a') ? 'warn' : 'info',
          source: projectUri.toString().includes('project-a')
            ? 'java-ls'
            : 'target-resolution',
          phase: projectUri.toString().includes('project-a')
            ? 'get-classpaths'
            : 'output-fallback',
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
      ['file:///workspace/project-a', 'file:///workspace/project-b']
    );

    assert.deepStrictEqual(
      result.context.resolutionIssues.map((issue) => issue.code),
      ['JAVA_LS_REQUEST_FAILED', 'OUTPUT_FALLBACK_USED']
    );
    assert.deepStrictEqual(
      result.results.map((project) => project.error),
      ['analysis boom', 'analysis boom']
    );
  });

  it('marks workspace projects failed when backend returns ANALYSIS_FAILED envelopes', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const spotbugsClient =
      require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: {
          targetPath: '/workspace/project/target/classes',
          preferredProject: projectUri,
          targetResolutionRoots: ['/workspace/project/target/classes'],
          runtimeClasspaths: ['/workspace/project/target/classes'],
          sourcepaths: ['/workspace/project/src/main/java'],
        },
      },
      issues: [],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async () =>
      backendErrorEnvelope(
        'ANALYSIS_FAILED',
        'workspace boom',
        '/workspace/project/target/classes',
        12
      )) as typeof spotbugsClient.runSpotBugsAnalysis;

    const result = await service.analyzeWorkspaceFromProjectsDetailed(
      { getAnalysisSettings: () => ({ effort: 'default' }) } as any,
      vscode.Uri.file('/workspace') as any,
      ['file:///workspace/project']
    );

    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].errorCode, 'ANALYSIS_FAILED');
    assert.strictEqual(
      result.results[0].error,
      'SpotBugs analysis failed: [ANALYSIS_FAILED] workspace boom'
    );
    assert.deepStrictEqual(result.results[0].findings, []);
  });

  it('stops workspace analysis when backend returns ANALYSIS_CANCELLED envelopes', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const spotbugsClient =
      require('../lsp/spotbugsClient') as typeof import('../lsp/spotbugsClient');
    const service = require('../services/analysisService') as typeof import('../services/analysisService');
    const analyzedTargets: string[] = [];

    resolverModule.resolveProjectAnalysisTargetDetailed = (async (projectUri) => ({
      resolution: {
        status: 'ok',
        target: {
          targetPath: `/workspace/${projectUri.toString().split('/').pop()}/target/classes`,
          preferredProject: projectUri,
          targetResolutionRoots: ['/workspace/project/target/classes'],
          runtimeClasspaths: ['/workspace/project/target/classes'],
          sourcepaths: ['/workspace/project/src/main/java'],
        },
      },
      issues: [],
    })) as typeof resolverModule.resolveProjectAnalysisTargetDetailed;
    spotbugsClient.runSpotBugsAnalysis = (async (request) => {
      analyzedTargets.push(request.targetPath);
      return JSON.stringify({
        schemaVersion: 2,
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
      ['file:///workspace/project-a', 'file:///workspace/project-b']
    );

    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].projectUri, 'file:///workspace/project-a');
    assert.strictEqual(result.results[0].errorCode, 'ANALYSIS_CANCELLED');
    assert.deepStrictEqual(analyzedTargets, ['/workspace/project-a/target/classes']);
  });
});
