import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
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
    assert.deepStrictEqual(result.outcome, { findings: [] });
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
});
