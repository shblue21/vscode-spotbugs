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

  for (const { name, targetPath, expectedKind } of [
    {
      name: 'Java source file analysis',
      targetPath: '/workspace/project/src/main/java/demo/Repro.java',
      expectedKind: 'file' as const,
    },
    {
      name: 'source folder analysis',
      targetPath: '/workspace/project/src/main/java',
      expectedKind: 'folder' as const,
    },
    {
      name: 'selected output root analysis',
      targetPath: '/workspace/project/target/classes',
      expectedKind: 'returned-files' as const,
    },
    {
      name: 'selected output subfolder analysis',
      targetPath: '/workspace/project/target/classes/demo',
      expectedKind: 'returned-files' as const,
    },
    {
      name: 'output child folders starting with dot-dot characters',
      targetPath: '/workspace/project/target/classes/..generated',
      expectedKind: 'returned-files' as const,
    },
    {
      name: 'output-prefix sibling folder',
      targetPath: '/workspace/project/target/classes-sibling/demo',
      expectedKind: 'folder' as const,
    },
  ]) {
    it(`classifies ${name} as ${expectedKind} diagnostic scope`, async () => {
      const vscode = installVscodeMock();
      const resolver = createResolver(vscode, {
        outputPath: '/workspace/project/target/classes',
      });

      await assertResolvedDiagnosticScope(vscode, resolver, targetPath, expectedKind);
    });
  }

  it('classifies alternate output root subfolders as returned-files diagnostic scope', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/target/classes',
      runtimeClasspaths: ['/workspace/project/deps/library.jar'],
      targetResolutionRoots: [
        '/workspace/project/target/classes',
        '/workspace/project/target/test-classes',
      ],
    });

    await assertResolvedDiagnosticScope(
      vscode,
      resolver,
      '/workspace/project/target/test-classes/demo',
      'returned-files'
    );
  });

  it('classifies derived output subfolders as returned-files when classpath output is absent', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      derivedOutputPath: '/workspace/project/build/classes/java/main',
      expectedDeriveRoots: ['/workspace/project/unmatched-runtime-entry'],
      runtimeClasspaths: ['/workspace/project/deps/library.jar'],
      targetResolutionRoots: ['/workspace/project/unmatched-runtime-entry'],
    });

    await assertResolvedDiagnosticScope(
      vscode,
      resolver,
      '/workspace/project/build/classes/java/main/demo',
      'returned-files'
    );
  });

  it('classifies bytecode and archive analysis as returned-files diagnostic scope', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {});

    for (const targetPath of [
      '/workspace/project/target/classes/demo/Repro.class',
      '/workspace/project/build/libs/app.jar',
      '/workspace/project/build/libs/app.zip',
    ]) {
      await assertResolvedDiagnosticScope(vscode, resolver, targetPath, 'returned-files');
    }
  });
});

function createResolver(
  vscode: ReturnType<typeof installVscodeMock>,
  options: Parameters<typeof createResolverDeps>[1]
) {
  const resolverModule =
    require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
  return resolverModule.createTargetResolver(createResolverDeps(vscode, options));
}

async function assertResolvedDiagnosticScope(
  vscode: ReturnType<typeof installVscodeMock>,
  resolver: {
    resolveFileAnalysisTargetDetailed(uri: unknown): Promise<any>;
  },
  targetPath: string,
  expectedKind: 'file' | 'folder' | 'returned-files'
): Promise<void> {
  const uri = vscode.Uri.file(targetPath) as any;
  const result = await resolver.resolveFileAnalysisTargetDetailed(uri);

  assert.strictEqual(result.resolution.status, 'ok');
  assert.deepStrictEqual(
    result.resolution.status === 'ok'
      ? {
          kind: result.resolution.target.diagnosticScope?.kind,
          uri: result.resolution.target.diagnosticScope?.uri.fsPath,
        }
      : undefined,
    { kind: expectedKind, uri: uri.fsPath }
  );
}

function createResolverDeps(
  vscode: ReturnType<typeof installVscodeMock>,
  options: {
    outputPath?: string;
    derivedOutputPath?: string;
    expectedDeriveRoots?: string[];
    runtimeClasspaths?: string[];
    targetResolutionRoots?: string[];
  }
) {
  const targetResolutionRoots =
    options.targetResolutionRoots ?? (options.outputPath ? [options.outputPath] : []);
  const runtimeClasspaths = options.runtimeClasspaths ?? targetResolutionRoots;
  return {
    getClasspathsOutcome: async () => ({
      status: 'resolved' as const,
      classpath: {
        output: options.outputPath,
        runtimeClasspaths,
        targetResolutionRoots,
        sourcepaths: [],
      },
      issues: [],
    }),
    deriveOutputFolder: async (roots: string[]) => {
      if (options.expectedDeriveRoots) {
        assert.deepStrictEqual(roots, options.expectedDeriveRoots);
      }
      return options.derivedOutputPath ?? options.outputPath;
    },
    findOutputFolderFromProject: async () => undefined,
    hasClassTargets: async () => true,
    isBytecodeTarget: (targetPath: string) =>
      ['.class', '.jar', '.zip'].includes(path.extname(targetPath).toLowerCase()),
    primeSourcepathsCache: () => undefined,
    getWorkspaceFolder: () =>
      ({
        name: 'workspace',
        index: 0,
        uri: vscode.Uri.file('/workspace') as any,
      }) as any,
    dirname: path.dirname,
    logger: { log: () => undefined } as any,
  };
}
