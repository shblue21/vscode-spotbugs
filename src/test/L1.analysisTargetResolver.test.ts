import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
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
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      ['/workspace/project/target/classes']
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

  it('rejects Java source analysis when archive-only output has no mapped class fallback', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/target/classes',
      targetResolutionRoots: [],
      deriveOutputFolder: async () => undefined,
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async () => false,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('keeps archive-only output valid for project analysis', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/target/classes',
      hasClassTargets: async () => true,
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
  });

  it('does not fall back from an empty declared project output to a sibling project output', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project-a/target/classes',
      targetResolutionRoots: ['/workspace/project-b/target/classes'],
      deriveOutputFolder: async (
        roots: string[],
        _classpathsRoot: string,
        hasTargets?: (targetPath: string) => Promise<boolean>
      ) => {
        for (const candidate of roots) {
          if (!hasTargets || (await hasTargets(candidate))) {
            return candidate;
          }
        }
        return undefined;
      },
      findOutputFolderFromProject: async () => {
        throw new Error('project fallback should not be used');
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === '/workspace/project-b/target/classes',
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project-a') as any,
      vscode.Uri.file('/workspace') as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
    assert.deepStrictEqual(
      result.issues.map((issue) => issue.code),
      []
    );
  });

  it('keeps fallback roots scoped to the selected project', async () => {
    const vscode = installVscodeMock();
    const projectAOutput = '/workspace/project-a/target/classes';
    const projectBOutput = '/workspace/project-b/target/classes';
    const firstMatchingProjectRoot = async (
      roots: string[],
      classpathsRoot: string,
      hasTargets?: (targetPath: string) => Promise<boolean>
    ) => {
      assert.strictEqual(classpathsRoot, '/workspace/project-a');
      assert.deepStrictEqual(roots, [projectAOutput]);
      for (const candidate of roots) {
        if (!hasTargets || (await hasTargets(candidate))) {
          return candidate;
        }
      }
      return undefined;
    };

    for (const testCase of [
      {
        name: 'Java source',
        options: {
          outputPath: '/workspace/project-a/build/classes/java/main',
          hasClassTargets: async (targetPath: string) =>
            targetPath === `${projectAOutput}/demo/Repro.class`,
        },
        resolve: (resolver: any) =>
          resolver.resolveFileAnalysisTargetDetailed(
            vscode.Uri.file('/workspace/project-a/src/main/java/demo/Repro.java') as any
          ),
      },
      {
        name: 'project',
        options: {
          hasClassTargets: async (targetPath: string) => targetPath === projectAOutput,
        },
        resolve: (resolver: any) =>
          resolver.resolveProjectAnalysisTargetDetailed(
            vscode.Uri.file('/workspace/project-a') as any,
            vscode.Uri.file('/workspace') as any
          ),
      },
    ]) {
      const resolver = createResolver(vscode, {
        ...testCase.options,
        targetResolutionRoots: [projectBOutput, projectAOutput],
        deriveOutputFolder: firstMatchingProjectRoot,
        findOutputFolderFromProject: async () => {
          throw new Error('project fallback should not be used');
        },
      });
      const result = await testCase.resolve(resolver);

      assert.strictEqual(result.resolution.status, 'ok', testCase.name);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.targetResolutionRoots
          : undefined,
        [projectAOutput],
        testCase.name
      );
    }
  });

  it('accepts workspace-level Java LS output paths for project analysis', async () => {
    const vscode = installVscodeMock();
    const workspaceOutput = '/workspace/build/classes/java/main';
    const resolver = createResolver(vscode, {
      outputPath: workspaceOutput,
      targetResolutionRoots: [],
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async (targetPath: string) => targetPath === workspaceOutput,
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project') as any,
      vscode.Uri.file('/workspace') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetPath
        : undefined,
      workspaceOutput
    );
  });

  it('returns accepted output path as the Java source target-resolution root', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/build/classes/java/main',
      targetResolutionRoots: ['/workspace/project/target/classes'],
      hasClassTargets: async (targetPath: string) =>
        targetPath === '/workspace/project/build/classes/java/main/demo/Repro.class',
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      ['/workspace/project/build/classes/java/main']
    );
  });

  it('keeps Java source final roots scoped to verified selected-project outputs', async () => {
    const vscode = installVscodeMock();
    const projectAOutput = '/workspace/project-a/target/classes';
    const projectBOutput = '/workspace/project-b/target/classes';
    const firstMatchingRoot = async (
      roots: string[],
      _classpathsRoot: string,
      hasTargets?: (targetPath: string) => Promise<boolean>
    ) => {
      for (const candidate of roots) {
        if (!hasTargets || (await hasTargets(candidate))) {
          return candidate;
        }
      }
      return undefined;
    };

    for (const testCase of [
      {
        name: 'unusable workspace-level outputPath',
        targetPath: '/workspace/project-a/src/main/java/demo/Repro.java',
        options: {
          outputPath: '/workspace/build/classes/java/main',
          targetResolutionRoots: [projectBOutput, projectAOutput],
          deriveOutputFolder: firstMatchingRoot,
          findOutputFolderFromProject: async () => undefined,
          hasClassTargets: async (targetPath: string) =>
            targetPath === `${projectBOutput}/demo/Repro.class`,
        },
        expectedStatus: 'no-class-targets' as const,
      },
      {
        name: 'generated java marker without sourcepaths',
        targetPath: '/workspace/project-a/generated/java/demo/Repro.java',
        options: {
          targetResolutionRoots: [projectBOutput, projectAOutput],
          deriveOutputFolder: firstMatchingRoot,
          findOutputFolderFromProject: async () => undefined,
          hasClassTargets: async (targetPath: string) =>
            targetPath === `${projectBOutput}/demo/Repro.class`,
        },
        expectedStatus: 'no-class-targets' as const,
      },
    ]) {
      const resolver = createResolver(vscode, testCase.options);
      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(testCase.targetPath) as any
      );

      assert.strictEqual(result.resolution.status, testCase.expectedStatus, testCase.name);
    }
  });

  it('accepts workspace-level Java LS output paths for selected project sources', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/build/classes/java/main',
      targetResolutionRoots: [],
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async (targetPath: string) =>
        targetPath === '/workspace/build/classes/java/main/demo/Repro.class',
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      ['/workspace/build/classes/java/main']
    );
  });

  it('falls back to target-resolution roots when Java source outputPath lacks the mapped class', async () => {
    const vscode = installVscodeMock();
    const archiveOutput = '/workspace/project/build/classes/java/main';
    const looseOutput = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: archiveOutput,
      targetResolutionRoots: [archiveOutput, looseOutput],
      deriveOutputFolder: async (
        roots: string[],
        _classpathsRoot: string,
        hasTargets?: (targetPath: string) => Promise<boolean>
      ) => {
        for (const candidate of roots) {
          if (!hasTargets || (await hasTargets(candidate))) {
            return candidate;
          }
        }
        return undefined;
      },
      findOutputFolderFromProject: async () => {
        throw new Error('project fallback should not be used');
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${looseOutput}/demo/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      [looseOutput]
    );
    assert.deepStrictEqual(
      result.issues.map((issue) => issue.code),
      ['OUTPUT_FALLBACK_USED']
    );
  });

  it('ranks fallback output roots by Java source set', async () => {
    const vscode = installVscodeMock();
    const mainOutput = '/workspace/project/target/classes';
    const testOutput = '/workspace/project/target/test-classes';

    for (const testCase of [
      {
        sourcePath: '/workspace/project/src/test/java/demo/Foo.java',
        roots: [mainOutput, testOutput],
        expectedRoots: [testOutput, mainOutput],
      },
      {
        sourcePath: '/workspace/project/src/main/java/demo/Foo.java',
        roots: [testOutput, mainOutput],
        expectedRoots: [mainOutput, testOutput],
      },
    ]) {
      const resolver = createResolver(vscode, {
        targetResolutionRoots: testCase.roots,
        deriveOutputFolder: async (
          roots: string[],
          _classpathsRoot: string,
          hasTargets?: (targetPath: string) => Promise<boolean>,
          options?: OutputFolderSelectionOptions
        ) => {
          const rankedRoots = rankRoots(roots, options);
          for (const candidate of rankedRoots) {
            if (!hasTargets || (await hasTargets(candidate))) {
              return candidate;
            }
          }
          return undefined;
        },
        findOutputFolderFromProject: async () => {
          throw new Error('project fallback should not be used');
        },
        hasClassTargets: async (targetPath: string) =>
          targetPath === `${mainOutput}/demo/Foo.class` ||
          targetPath === `${testOutput}/demo/Foo.class`,
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(testCase.sourcePath) as any
      );

      assert.strictEqual(result.resolution.status, 'ok', testCase.sourcePath);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.targetResolutionRoots
          : undefined,
        testCase.expectedRoots,
        testCase.sourcePath
      );
    }
  });

  it('orders test output roots before classpath output metadata for test Java source analysis', async () => {
    const vscode = installVscodeMock();
    const mainOutput = '/workspace/project/target/classes';
    const testOutput = '/workspace/project/target/test-classes';
    const resolver = createResolver(vscode, {
      outputPath: mainOutput,
      targetResolutionRoots: [mainOutput, testOutput],
      deriveOutputFolder: async () => {
        throw new Error('deriveOutputFolder should not be called');
      },
      findOutputFolderFromProject: async () => {
        throw new Error('project fallback should not be used');
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${mainOutput}/demo/Foo.class` ||
        targetPath === `${testOutput}/demo/Foo.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/test/java/demo/Foo.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      [testOutput, mainOutput]
    );
  });

  it('resolves Java source analysis through Java LS sourcepaths before source markers', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      sourcepaths: ['/workspace/project/generated-sources'],
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${outputRoot}/demo/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
  });

  it('prefers the longest matching Java LS sourcepath for Java source analysis', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      sourcepaths: [
        '/workspace/project/generated-sources',
        '/workspace/project/generated-sources/demo',
      ],
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${outputRoot}/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
  });

  it('does not fall back to a broader Java LS sourcepath when the longest candidate has no class', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      sourcepaths: [
        '/workspace/project/generated-sources',
        '/workspace/project/generated-sources/demo',
      ],
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${outputRoot}/demo/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('does not match Java LS sourcepaths by string prefix alone', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      sourcepaths: ['/workspace/project/generated'],
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${outputRoot}/-sources/demo/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('rejects Java source output roots with only same-basename unmapped class', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      targetResolutionRoots: [outputRoot],
      sourcepaths: ['/workspace/project/generated-sources'],
      deriveOutputFolder: async (
        roots: string[],
        _classpathsRoot: string,
        hasTargets?: (targetPath: string) => Promise<boolean>
      ) => {
        for (const candidate of roots) {
          if (!hasTargets || (await hasTargets(candidate))) {
            return candidate;
          }
        }
        return undefined;
      },
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${outputRoot}/other/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('skips archive-only fallback output candidates for Java source analysis', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      targetResolutionRoots: [],
      derivedOutputPath: undefined,
      findOutputFolderFromProject: async (
        _projectRoot: string,
        hasTargets?: (targetPath: string) => Promise<boolean>
      ) => {
        for (const candidate of [
          '/workspace/project/build/classes/java/main',
          '/workspace/project/target/classes',
        ]) {
          if (!hasTargets || (await hasTargets(candidate))) {
            return candidate;
          }
        }
        return undefined;
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === '/workspace/project/target/classes/demo/Repro.class',
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      ['/workspace/project/target/classes']
    );
  });

  it('falls back from archive-only output for Java source folder analysis', async () => {
    const vscode = installVscodeMock();
    const archiveOutput = '/workspace/project/build/classes/java/main';
    const looseOutput = '/workspace/project/target/classes';

    for (const selectedFolder of [
      '/workspace/project/src/main/java/demo',
      '/workspace/project/generated/java/demo',
    ]) {
      const resolver = createResolver(vscode, {
        outputPath: archiveOutput,
        targetResolutionRoots: [],
        findOutputFolderFromProject: async (
          _projectRoot: string,
          hasTargets?: (targetPath: string) => Promise<boolean>
        ) => {
          for (const candidate of [archiveOutput, looseOutput]) {
            if (!hasTargets || (await hasTargets(candidate))) {
              return candidate;
            }
          }
          return undefined;
        },
        hasClassTargets: async (targetPath: string) =>
          targetPath === archiveOutput || targetPath === `${looseOutput}/demo`,
        containsJavaSources: async () => true,
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(selectedFolder) as any
      );

      assert.strictEqual(result.resolution.status, 'ok', selectedFolder);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.targetResolutionRoots
          : undefined,
        [looseOutput],
        selectedFolder
      );
      assert.deepStrictEqual(
        result.issues.map((issue) => issue.code),
        ['OUTPUT_FALLBACK_USED'],
        selectedFolder
      );
    }
  });

  it('does not treat marker-like archive folders without Java sources as source folders', async () => {
    const vscode = installVscodeMock();
    const selectedFolder = '/workspace/project/src/lib';
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      hasClassTargets: async (targetPath: string) =>
        targetPath === selectedFolder,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file(selectedFolder) as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetPath
        : undefined,
      selectedFolder
    );
  });

  it('does not treat bytecode-only folders under sourcepaths as source folders', async () => {
    const vscode = installVscodeMock();
    const selectedFolder = '/workspace/project/src/main/java/lib';
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      sourcepaths: ['/workspace/project/src/main/java'],
      hasClassTargets: async (targetPath: string) =>
        targetPath === selectedFolder,
      containsJavaSources: async () => false,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file(selectedFolder) as any
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetPath
        : undefined,
      selectedFolder
    );
  });

  it('rejects non-source folders without direct or mapped analysis targets', async () => {
    const vscode = installVscodeMock();
    const selectedFolder = '/workspace/project/src/lib';
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      hasClassTargets: async (targetPath: string) => targetPath === outputRoot,
      containsJavaSources: async () => false,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file(selectedFolder) as any
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('falls back from unusable output for non-source folders with mapped Java sources', async () => {
    const vscode = installVscodeMock();
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'spotbugs-folder-source-fallback-')
    );
    try {
      const projectRoot = path.join(tempRoot, 'project');
      const archiveOutput = path.join(projectRoot, 'build', 'classes', 'java', 'main');
      const looseOutput = path.join(projectRoot, 'target', 'classes');
      await fs.promises.mkdir(path.join(projectRoot, 'src', 'main', 'java', 'demo'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(projectRoot, 'src', 'main', 'java', 'demo', 'Repro.java'),
        ''
      );

      const resolver = createResolver(vscode, {
        outputPath: archiveOutput,
        targetResolutionRoots: [archiveOutput, looseOutput],
        deriveOutputFolder: async (
          roots: string[],
          _classpathsRoot: string,
          hasTargets?: (targetPath: string) => Promise<boolean>
        ) => {
          for (const candidate of roots) {
            if (!hasTargets || (await hasTargets(candidate))) {
              return candidate;
            }
          }
          return undefined;
        },
        findOutputFolderFromProject: async () => undefined,
        hasClassTargets: async (targetPath: string) =>
          targetPath === path.join(looseOutput, 'demo', 'Repro.class'),
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(projectRoot) as any
      );

      assert.strictEqual(result.resolution.status, 'ok');
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.targetResolutionRoots
          : undefined,
        [looseOutput]
      );
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps non-source folder fallback scoped when sourcepaths are nested under the target', async () => {
    const vscode = installVscodeMock();
    const workspaceRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'spotbugs-nested-sourcepath-scope-')
    );
    try {
      const projectA = path.join(workspaceRoot, 'project-a');
      const projectB = path.join(workspaceRoot, 'project-b');
      const sourceRoot = path.join(projectA, 'src', 'main', 'java');
      const projectAOutput = path.join(projectA, 'target', 'classes');
      const projectBOutput = path.join(projectB, 'target', 'classes');
      await fs.promises.mkdir(path.join(sourceRoot, 'demo'), { recursive: true });
      await fs.promises.writeFile(path.join(sourceRoot, 'demo', 'Repro.java'), '');

      const resolver = createResolver(vscode, {
        workspacePath: workspaceRoot,
        outputPath: projectBOutput,
        targetResolutionRoots: [projectBOutput, projectAOutput],
        sourcepaths: [sourceRoot],
        deriveOutputFolder: async (
          roots: string[],
          _classpathsRoot: string,
          hasTargets?: (targetPath: string) => Promise<boolean>
        ) => {
          for (const candidate of roots) {
            if (!hasTargets || (await hasTargets(candidate))) {
              return candidate;
            }
          }
          return undefined;
        },
        findOutputFolderFromProject: async () => undefined,
        hasClassTargets: async (targetPath: string) =>
          targetPath === path.join(projectBOutput, 'demo', 'Repro.class'),
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(projectA) as any
      );

      assert.strictEqual(result.resolution.status, 'no-class-targets');
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('requires mapped classes for exact Java source root preflight', async () => {
    const vscode = installVscodeMock();
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'spotbugs-source-root-')
    );
    try {
      const projectRoot = path.join(tempRoot, 'project');
      const sourceRoot = path.join(projectRoot, 'src', 'main', 'java');
      const outputRoot = path.join(projectRoot, 'target', 'classes');
      await fs.promises.mkdir(path.join(sourceRoot, 'demo'), { recursive: true });
      await fs.promises.mkdir(path.join(outputRoot, 'other'), { recursive: true });
      await fs.promises.writeFile(path.join(sourceRoot, 'demo', 'Missing.java'), '');
      await fs.promises.writeFile(path.join(outputRoot, 'other', 'Other.class'), '');

      const resolver = createResolver(vscode, {
        outputPath: outputRoot,
        hasClassTargets: async (targetPath: string) =>
          targetPath === outputRoot ||
          targetPath === path.join(outputRoot, 'other', 'Other.class'),
        containsJavaSources: async () => true,
      });

      for (const selectedPath of [sourceRoot, `${sourceRoot}${path.sep}.`]) {
        const result = await resolver.resolveFileAnalysisTargetDetailed(
          vscode.Uri.file(selectedPath) as any
        );

        assert.strictEqual(
          result.resolution.status,
          'no-class-targets',
          selectedPath
        );
      }
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps generated java sourcepath fallback scoped to the project root', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';

    for (const testCase of [
      {
        sourcepath: '/workspace/project/generated/java',
        targetPath: '/workspace/project/generated/java/demo/Repro.java',
      },
      {
        sourcepath: '/workspace/project/target/generated-sources/annotations',
        targetPath:
          '/workspace/project/target/generated-sources/annotations/demo/Repro.java',
      },
    ]) {
      const resolver = createResolver(vscode, {
        targetResolutionRoots: [outputRoot],
        sourcepaths: [testCase.sourcepath],
        deriveOutputFolder: async (
          roots: string[],
          classpathsRoot: string,
          hasTargets?: (targetPath: string) => Promise<boolean>
        ) => {
          assert.strictEqual(classpathsRoot, '/workspace/project', testCase.sourcepath);
          assert.deepStrictEqual(roots, [outputRoot], testCase.sourcepath);
          for (const candidate of roots) {
            if (!hasTargets || (await hasTargets(candidate))) {
              return candidate;
            }
          }
          return undefined;
        },
        findOutputFolderFromProject: async () => {
          throw new Error('project fallback should not be used');
        },
        hasClassTargets: async (targetPath: string) =>
          targetPath === `${outputRoot}/demo/Repro.class`,
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(testCase.targetPath) as any
      );

      assert.strictEqual(result.resolution.status, 'ok', testCase.sourcepath);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.targetResolutionRoots
          : undefined,
        [outputRoot],
        testCase.sourcepath
      );
    }
  });

  it('applies Java source-set ranking to project output folder fallback', async () => {
    const vscode = installVscodeMock();
    const mainOutput = '/workspace/project/target/classes';
    const testOutput = '/workspace/project/target/test-classes';
    const resolver = createResolver(vscode, {
      targetResolutionRoots: [],
      findOutputFolderFromProject: async (
        _projectRoot: string,
        hasTargets?: (targetPath: string) => Promise<boolean>,
        options?: OutputFolderSelectionOptions
      ) => {
        for (const candidate of rankRoots([mainOutput, testOutput], options)) {
          if (!hasTargets || (await hasTargets(candidate))) {
            return candidate;
          }
        }
        return undefined;
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${mainOutput}/demo/Foo.class` ||
        targetPath === `${testOutput}/demo/Foo.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/test/java/demo/Foo.java') as any
    );

    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.targetResolutionRoots
        : undefined,
      [testOutput]
    );
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
    deriveOutputFolder?: (
      roots: string[],
      classpathsRoot: string,
      hasTargets?: (targetPath: string) => Promise<boolean>,
      options?: OutputFolderSelectionOptions
    ) => Promise<string | undefined>;
    findOutputFolderFromProject?: (
      projectRoot: string,
      hasTargets?: (targetPath: string) => Promise<boolean>,
      options?: OutputFolderSelectionOptions
    ) => Promise<string | undefined>;
    hasClassTargets?: (targetPath: string) => Promise<boolean>;
    hasLooseClassTargets?: (targetPath: string) => Promise<boolean>;
    containsJavaSources?: (targetPath: string) => Promise<boolean>;
    sourcepaths?: string[];
    workspacePath?: string;
  }
) {
  const targetResolutionRoots =
    options.targetResolutionRoots ?? (options.outputPath ? [options.outputPath] : []);
  const runtimeClasspaths = options.runtimeClasspaths ?? targetResolutionRoots;
  const hasClassTargets = options.hasClassTargets ?? (async () => true);
  return {
    getClasspathsOutcome: async () => ({
      status: 'resolved' as const,
      classpath: {
        output: options.outputPath,
        runtimeClasspaths,
        targetResolutionRoots,
        sourcepaths: options.sourcepaths ?? [],
      },
      issues: [],
    }),
    deriveOutputFolder:
      options.deriveOutputFolder ??
      (async (roots: string[]) => {
        if (options.expectedDeriveRoots) {
          assert.deepStrictEqual(roots, options.expectedDeriveRoots);
        }
        return options.derivedOutputPath ?? options.outputPath;
      }),
    findOutputFolderFromProject:
      options.findOutputFolderFromProject ?? (async () => undefined),
    hasClassTargets,
    hasLooseClassTargets: options.hasLooseClassTargets ?? hasClassTargets,
    containsJavaSources: options.containsJavaSources ?? (async () => false),
    isBytecodeTarget: (targetPath: string) =>
      ['.class', '.jar', '.zip'].includes(path.extname(targetPath).toLowerCase()),
    primeSourcepathsCache: () => undefined,
    getWorkspaceFolder: () =>
      ({
        name: 'workspace',
        index: 0,
        uri: vscode.Uri.file(options.workspacePath ?? '/workspace') as any,
      }) as any,
    dirname: path.dirname,
    logger: { log: () => undefined } as any,
  };
}

type OutputFolderSelectionOptions = {
  rankCandidate?: (candidate: { targetPath: string; index: number }) => number;
};

function rankRoots(
  roots: readonly string[],
  options: OutputFolderSelectionOptions | undefined
): string[] {
  return roots
    .map((targetPath, index) => ({
      targetPath,
      index,
      rank: options?.rankCandidate?.({ targetPath, index }) ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((candidate) => candidate.targetPath);
}
