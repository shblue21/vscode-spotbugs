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
          projectRoot: 'file:///workspace/project',
          runtimeClasspaths: ['/deps/classes'],
          targetResolutionRoots: [],
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
      findOutputFolderFromProject: async () => '/workspace/project/target/classes',
      hasClassTargets: async () => true,
      isBytecodeTarget: () => false,
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
      vscode.Uri.file('/workspace') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok' ? result.resolution.target.unit.inputs[0].path : '',
      '/workspace/project/target/classes',
    );
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      ['/workspace/project/target/classes'],
    );
    assert.deepStrictEqual(
      result.issues.map((issue) => issue.code),
      ['JAVA_LS_NO_RESULT', 'OUTPUT_FALLBACK_USED'],
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
          projectRoot: 'file:///workspace/project',
          runtimeClasspaths: ['/deps/classes'],
          targetResolutionRoots: ['/workspace/project/build/classes'],
          sourcepaths: [],
        },
        issues: [],
      }),
      findOutputFolderFromProject: async () => {
        throw new Error('findOutputFolderFromProject should not be called');
      },
      hasClassTargets: async () => true,
      isBytecodeTarget: () => false,
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
      vscode.Uri.file('/workspace') as any,
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
          projectRoot: 'file:///workspace/project',
          runtimeClasspaths: ['/deps/classes'],
          targetResolutionRoots: ['/workspace/project/target/classes'],
          sourcepaths: [],
        },
        issues: [],
      }),
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async () => false,
      isBytecodeTarget: () => false,
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
      vscode.Uri.file('/workspace') as any,
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
      'returned-files',
    );
  });

  it('classifies derived output subfolders as returned-files when classpath output is absent', async () => {
    const vscode = installVscodeMock();
    const derivedOutputPath = '/workspace/project/build/classes/java/main';
    const resolver = createResolver(vscode, {
      runtimeClasspaths: ['/workspace/project/deps/library.jar'],
      targetResolutionRoots: [],
      findOutputFolderFromProject: async () => derivedOutputPath,
    });

    await assertResolvedDiagnosticScope(
      vscode,
      resolver,
      '/workspace/project/build/classes/java/main/demo',
      'returned-files',
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
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async () => false,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('keeps archive-only output valid for project analysis', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/target/classes',
      sourcepaths: ['/workspace/project/src/main/java'],
      sourceOutputs: Object.fromEntries([
        ['/workspace/project/src/main/java', '/workspace/project/target/classes'],
      ]),
      hasClassTargets: async () => true,
      hasLooseClassTargets: async () => false,
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project') as any,
      vscode.Uri.file('/workspace') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok' ? result.resolution.target.unit.inputs[0].path : '',
      '/workspace/project/target/classes',
    );
  });

  it('uses a Java LS-declared external output when the default is empty', async () => {
    const vscode = installVscodeMock();
    const workspaceOutput = '/external/custom-main-output';
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/empty-default-output',
      targetResolutionRoots: [workspaceOutput],
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async (targetPath: string) => targetPath === workspaceOutput,
    });

    const result = await resolver.resolveProjectAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project') as any,
      vscode.Uri.file('/workspace') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok' ? result.resolution.target.unit.inputs[0].path : undefined,
      workspaceOutput,
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
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      ['/workspace/project/build/classes/java/main'],
    );
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
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      ['/workspace/build/classes/java/main'],
    );
  });

  it('falls back to target-resolution roots when Java source outputPath lacks the mapped class', async () => {
    const vscode = installVscodeMock();
    const archiveOutput = '/workspace/project/build/classes/java/main';
    const looseOutput = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: archiveOutput,
      targetResolutionRoots: [archiveOutput, looseOutput],
      findOutputFolderFromProject: async () => {
        throw new Error('project fallback should not be used');
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${looseOutput}/demo/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      [looseOutput],
    );
    assert.deepStrictEqual(
      result.issues.map((issue) => issue.code),
      ['OUTPUT_FALLBACK_USED'],
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
        findOutputFolderFromProject: async () => {
          throw new Error('project fallback should not be used');
        },
        hasClassTargets: async (targetPath: string) =>
          targetPath === `${mainOutput}/demo/Foo.class` ||
          targetPath === `${testOutput}/demo/Foo.class`,
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(testCase.sourcePath) as any,
      );

      assert.strictEqual(result.resolution.status, 'ok', testCase.sourcePath);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.unit.inputs[0].resolutionRoots
          : undefined,
        testCase.expectedRoots,
        testCase.sourcePath,
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
      findOutputFolderFromProject: async () => {
        throw new Error('project fallback should not be used');
      },
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${mainOutput}/demo/Foo.class` ||
        targetPath === `${testOutput}/demo/Foo.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/src/test/java/demo/Foo.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      [testOutput, mainOutput],
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
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any,
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
      hasClassTargets: async (targetPath: string) => targetPath === `${outputRoot}/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any,
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
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any,
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
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('rejects Java source output roots with only same-basename unmapped class', async () => {
    const vscode = installVscodeMock();
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      targetResolutionRoots: [outputRoot],
      sourcepaths: ['/workspace/project/generated-sources'],
      findOutputFolderFromProject: async () => undefined,
      hasClassTargets: async (targetPath: string) =>
        targetPath === `${outputRoot}/other/Repro.class`,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/generated-sources/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('skips archive-only fallback output candidates for Java source analysis', async () => {
    const vscode = installVscodeMock();
    const resolver = createResolver(vscode, {
      targetResolutionRoots: [],
      findOutputFolderFromProject: async (
        _projectRoot: string,
        hasTargets?: (targetPath: string) => Promise<boolean>,
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
      vscode.Uri.file('/workspace/project/src/main/java/demo/Repro.java') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      ['/workspace/project/target/classes'],
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
          hasTargets?: (targetPath: string) => Promise<boolean>,
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
        vscode.Uri.file(selectedFolder) as any,
      );

      assert.strictEqual(result.resolution.status, 'ok', selectedFolder);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.unit.inputs[0].resolutionRoots
          : undefined,
        [looseOutput],
        selectedFolder,
      );
      assert.deepStrictEqual(
        result.issues.map((issue) => issue.code),
        ['OUTPUT_FALLBACK_USED'],
        selectedFolder,
      );
    }
  });

  it('does not treat marker-like archive folders without Java sources as source folders', async () => {
    const vscode = installVscodeMock();
    const selectedFolder = '/workspace/project/src/lib';
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      hasClassTargets: async (targetPath: string) => targetPath === selectedFolder,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file(selectedFolder) as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok' ? result.resolution.target.unit.inputs[0].path : undefined,
      selectedFolder,
    );
  });

  it('does not treat bytecode-only folders under sourcepaths as source folders', async () => {
    const vscode = installVscodeMock();
    const selectedFolder = '/workspace/project/src/main/java/lib';
    const outputRoot = '/workspace/project/target/classes';
    const resolver = createResolver(vscode, {
      outputPath: outputRoot,
      sourcepaths: ['/workspace/project/src/main/java'],
      hasClassTargets: async (targetPath: string) => targetPath === selectedFolder,
      containsJavaSources: async () => false,
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file(selectedFolder) as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.strictEqual(
      result.resolution.status === 'ok' ? result.resolution.target.unit.inputs[0].path : undefined,
      selectedFolder,
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
      vscode.Uri.file(selectedFolder) as any,
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
  });

  it('falls back from unusable output for non-source folders with mapped Java sources', async () => {
    const vscode = installVscodeMock();
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'spotbugs-folder-source-fallback-'),
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
        '',
      );

      const resolver = createResolver(vscode, {
        outputPath: archiveOutput,
        targetResolutionRoots: [archiveOutput, looseOutput],
        isDirectoryTarget: true,
        projectRootPaths: [projectRoot],
        metadataProjectRoot: vscode.Uri.file(projectRoot).toString(),
        findOutputFolderFromProject: async () => undefined,
        hasClassTargets: async (targetPath: string) =>
          targetPath === path.join(looseOutput, 'demo', 'Repro.class'),
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(projectRoot) as any,
      );

      assert.strictEqual(result.resolution.status, 'ok');
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.unit.inputs[0].resolutionRoots
          : undefined,
        [looseOutput],
      );
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('requires mapped classes for exact Java source root preflight', async () => {
    const vscode = installVscodeMock();
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-source-root-'));
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
          targetPath === outputRoot || targetPath === path.join(outputRoot, 'other', 'Other.class'),
        containsJavaSources: async () => true,
      });

      for (const selectedPath of [sourceRoot, `${sourceRoot}${path.sep}.`]) {
        const result = await resolver.resolveFileAnalysisTargetDetailed(
          vscode.Uri.file(selectedPath) as any,
        );

        assert.strictEqual(result.resolution.status, 'no-class-targets', selectedPath);
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
        targetPath: '/workspace/project/target/generated-sources/annotations/demo/Repro.java',
      },
    ]) {
      const resolver = createResolver(vscode, {
        targetResolutionRoots: [outputRoot],
        sourcepaths: [testCase.sourcepath],
        findOutputFolderFromProject: async () => {
          throw new Error('project fallback should not be used');
        },
        hasClassTargets: async (targetPath: string) =>
          targetPath === `${outputRoot}/demo/Repro.class`,
      });

      const result = await resolver.resolveFileAnalysisTargetDetailed(
        vscode.Uri.file(testCase.targetPath) as any,
      );

      assert.strictEqual(result.resolution.status, 'ok', testCase.sourcepath);
      assert.deepStrictEqual(
        result.resolution.status === 'ok'
          ? result.resolution.target.unit.inputs[0].resolutionRoots
          : undefined,
        [outputRoot],
        testCase.sourcepath,
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
        options?: OutputFolderSelectionOptions,
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
      vscode.Uri.file('/workspace/project/src/test/java/demo/Foo.java') as any,
    );

    assert.deepStrictEqual(
      result.resolution.status === 'ok'
        ? result.resolution.target.unit.inputs[0].resolutionRoots
        : undefined,
      [testOutput],
    );
  });
  it('queries the deepest owning project and delegates folder scope inference', async () => {
    const vscode = installVscodeMock();
    const requested: string[] = [];
    const requestedScopes: Array<string | undefined> = [];
    const analysisResources: string[] = [];
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project-a/module/target/test-classes',
      hasClassTargets: async () => true,
      isDirectoryTarget: true,
      projectRootPaths: ['/workspace/project-a', '/workspace/project-a/module'],
      metadataProjectRoot: 'file:///workspace/project-a/module',
      onClasspathProject: (project, options) => {
        requested.push(typeof project === 'string' ? project : (project?.toString() ?? ''));
        requestedScopes.push(options?.scope);
        analysisResources.push(options?.analysisResource?.toString() ?? '');
      },
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project-a/module/src/test/java') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(requested, ['file:///workspace/project-a/module']);
    assert.deepStrictEqual(requestedScopes, [undefined]);
    assert.deepStrictEqual(analysisResources, ['file:///workspace/project-a/module/src/test/java']);
  });

  it('queries the owning project for an archive inside its output', async () => {
    const vscode = installVscodeMock();
    const requested: string[] = [];
    const resolver = createResolver(vscode, {
      outputPath: '/workspace/project/target/classes',
      hasClassTargets: async () => true,
      isDirectoryTarget: false,
      projectRootPaths: ['/workspace/project'],
      metadataProjectRoot: 'file:///workspace/project',
      onClasspathProject: (project) =>
        requested.push(typeof project === 'string' ? project : (project?.toString() ?? '')),
    });

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace/project/target/app.jar') as any,
    );

    assert.strictEqual(result.resolution.status, 'ok');
    assert.deepStrictEqual(requested, ['file:///workspace/project']);
  });

  it('rejects a folder spanning multiple projects before metadata lookup', async () => {
    const vscode = installVscodeMock();
    const resolverModule =
      require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
    const deps = createResolverDeps(vscode, {
      isDirectoryTarget: true,
      projectRootPaths: ['/workspace/project-a', '/workspace/project-b'],
    });
    let lookupCount = 0;
    deps.getClasspathsOutcome = async () => {
      lookupCount += 1;
      throw new Error('metadata lookup must not run');
    };
    const resolver = resolverModule.createTargetResolver(deps);

    const result = await resolver.resolveFileAnalysisTargetDetailed(
      vscode.Uri.file('/workspace') as any,
    );

    assert.strictEqual(result.resolution.status, 'no-class-targets');
    assert.strictEqual(lookupCount, 0);
    assert.strictEqual(
      result.resolution.status === 'no-class-targets' ? result.resolution.errorCode : undefined,
      'PROJECT_AGGREGATE_FOLDER_UNSUPPORTED',
    );
  });
});

function createResolver(
  vscode: ReturnType<typeof installVscodeMock>,
  options: Parameters<typeof createResolverDeps>[1],
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
  expectedKind: 'file' | 'folder' | 'returned-files',
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
    { kind: expectedKind, uri: uri.fsPath },
  );
}

function createResolverDeps(
  vscode: ReturnType<typeof installVscodeMock>,
  options: {
    outputPath?: string;
    runtimeClasspaths?: string[];
    targetResolutionRoots?: string[];
    findOutputFolderFromProject?: (
      projectRoot: string,
      hasTargets?: (targetPath: string) => Promise<boolean>,
      options?: OutputFolderSelectionOptions,
    ) => Promise<string | undefined>;
    hasClassTargets?: (targetPath: string) => Promise<boolean>;
    hasLooseClassTargets?: (targetPath: string) => Promise<boolean>;
    containsJavaSources?: (targetPath: string) => Promise<boolean>;
    sourcepaths?: string[];
    sourceOutputs?: Record<string, string>;
    workspacePath?: string;
    isDirectoryTarget?: boolean;
    projectRootPaths?: string[];
    metadataProjectRoot?: string;
    onClasspathProject?: (
      project: string | { toString(): string } | undefined,
      lookupOptions?: {
        scope?: 'runtime' | 'test';
        analysisResource?: { toString(): string };
      },
    ) => void;
  },
) {
  const targetResolutionRoots = Array.from(
    new Set(
      [options.outputPath, ...(options.targetResolutionRoots ?? [])].filter(
        (value): value is string => !!value,
      ),
    ),
  );
  const runtimeClasspaths = options.runtimeClasspaths ?? targetResolutionRoots;
  const hasClassTargets = options.hasClassTargets ?? (async () => true);
  return {
    getClasspathsOutcome: async (
      project?: string | { toString(): string },
      lookupOptions?: { scope?: 'runtime' | 'test' },
    ) => {
      options.onClasspathProject?.(project, lookupOptions);
      return {
        status: 'resolved' as const,
        classpath: {
          projectRoot: options.metadataProjectRoot ?? 'file:///workspace/project',
          runtimeClasspaths,
          targetResolutionRoots,
          sourcepaths: options.sourcepaths ?? [],
          sourceOutputs: options.sourceOutputs,
        },
        issues: [],
      };
    },
    findOutputFolderFromProject: options.findOutputFolderFromProject ?? (async () => undefined),
    hasClassTargets,
    hasLooseClassTargets: options.hasLooseClassTargets ?? hasClassTargets,
    containsJavaSources: options.containsJavaSources ?? (async () => false),
    getProjectRootPaths: async () => options.projectRootPaths ?? [],
    isDirectory: async () => options.isDirectoryTarget === true,
    isBytecodeTarget: (targetPath: string) =>
      ['.class', '.jar', '.zip'].includes(path.extname(targetPath).toLowerCase()),
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
  options: OutputFolderSelectionOptions | undefined,
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
