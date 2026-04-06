import * as assert from 'assert';
import * as path from 'path';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

describe('analysisTargetResolver', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    delete require.cache[require.resolve('../workspace/analysisTargetResolver')];
  });

  it('propagates classpath issues and emits OUTPUT_FALLBACK_USED when output fallback succeeds', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const resolver = resolverModule.createTargetResolver({
      getClasspathsOutcome: async () => ({
        status: 'resolved',
        classpath: {
          output: undefined,
          runtimeClasspaths: ['/deps/classes'],
          targetResolutionRoots: ['/workspace/project/target/classes'],
          sourcepaths: [],
        },
        issues: [
          {
            code: 'JAVA_LS_NO_RESULT',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup returned no usable result.',
          },
        ],
      }),
      deriveOutputFolder: async () => '/workspace/project/target/classes',
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async () => true,
      isBytecodeTarget: () => false,
      primeSourcepathsCache: () => undefined,
      getWorkspaceFolder: () =>
        ({
          name: 'workspace',
          index: 0,
          uri: vscode.Uri.file('/workspace') as any,
        }) as any,
      dirname: path.dirname,
      logger: { log: () => undefined } as any,
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project') as any,
      vscode.Uri.file('/workspace') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok' ? result.resolution.target.targetPath : '',
      '/workspace/project/target/classes'
    );
    assert.deepStrictEqual(
      result.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT', 'OUTPUT_FALLBACK_USED']
    );
  });

  it('does not emit OUTPUT_FALLBACK_USED when Java LS output metadata is already present', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const resolver = resolverModule.createTargetResolver({
      getClasspathsOutcome: async () => ({
        status: 'resolved',
        classpath: {
          output: '/workspace/project/build/classes',
          runtimeClasspaths: ['/deps/classes'],
          targetResolutionRoots: ['/workspace/project/build/classes'],
          sourcepaths: [],
        },
        issues: [],
      }),
      deriveOutputFolder: async () => {
        throw new Error('deriveOutputFolder should not be called');
      },
      findOutputFolderFromProject: async () => {
        throw new Error('findOutputFolderFromProject should not be called');
      },
      hasClassTargets: async () => true,
      isBytecodeTarget: () => false,
      primeSourcepathsCache: () => undefined,
      getWorkspaceFolder: () =>
        ({
          name: 'workspace',
          index: 0,
          uri: vscode.Uri.file('/workspace') as any,
        }) as any,
      dirname: path.dirname,
      logger: { log: () => undefined } as any,
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project') as any,
      vscode.Uri.file('/workspace') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(result.issues, []);
  });

  it('does not emit OUTPUT_FALLBACK_USED when fallback cannot resolve a usable output folder', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const resolver = resolverModule.createTargetResolver({
      getClasspathsOutcome: async () => ({
        status: 'resolved',
        classpath: {
          output: undefined,
          runtimeClasspaths: ['/deps/classes'],
          targetResolutionRoots: ['/workspace/project/target/classes'],
          sourcepaths: [],
        },
        issues: [],
      }),
      deriveOutputFolder: async () => '/workspace/project/target/classes',
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async () => false,
      isBytecodeTarget: () => false,
      primeSourcepathsCache: () => undefined,
      getWorkspaceFolder: () =>
        ({
          name: 'workspace',
          index: 0,
          uri: vscode.Uri.file('/workspace') as any,
        }) as any,
      dirname: path.dirname,
      logger: { log: () => undefined } as any,
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project') as any,
      vscode.Uri.file('/workspace') as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
    assert.deepStrictEqual(result.issues, []);
  });
});
