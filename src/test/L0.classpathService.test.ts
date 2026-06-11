import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { deriveTargetResolutionRoots } from '../workspace/classpathLayout';

describe('classpathService', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    delete require.cache[require.resolve('../workspace/classpathService')];
  });

  it('prepends the output folder, filters archives, and dedupes roots', () => {
    const roots = deriveTargetResolutionRoots('/workspace/build/classes', [
      '/workspace/build/classes',
      '/workspace/bin',
      '/deps/lib.jar',
      '/deps/classes',
      '/deps/lib.zip',
      '/workspace/bin',
    ]);

    assert.deepStrictEqual(roots, [
      '/workspace/build/classes',
      '/workspace/bin',
      '/deps/classes',
    ]);
  });

  it('preserves windows-style directory entries while excluding archive paths', () => {
    const roots = deriveTargetResolutionRoots('C:\\workspace\\build\\classes', [
      'C:\\deps\\tooling.JAR',
      'C:\\workspace\\build\\classes',
      'C:\\workspace\\bin',
    ]);

    assert.deepStrictEqual(roots, [
      'C:\\workspace\\build\\classes',
      'C:\\workspace\\bin',
    ]);
  });

  it('detects windows workspace prefix siblings case-insensitively', () => {
    const { isWorkspacePrefixSibling } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');

    assert.strictEqual(
      isWorkspacePrefixSibling(
        'C:\\Workspace\\Project',
        'c:\\workspace\\project-other\\target\\classes'
      ),
      true
    );
  });

  it('does not treat drive-root workspace children as prefix siblings', () => {
    const { isWorkspacePrefixSibling } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');

    assert.strictEqual(
      isWorkspacePrefixSibling('C:\\', 'C:\\workspace\\project\\target\\classes'),
      false
    );
  });

  it('skips outside preferred output candidates before returning inside candidates', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-cp-'));
    const workspacePath = path.join(tempRoot, 'project');
    const siblingOutput = path.join(tempRoot, 'project-other', 'target', 'classes');
    const workspaceOutput = path.join(workspacePath, 'target', 'classes');
    await fs.promises.mkdir(siblingOutput, { recursive: true });
    await fs.promises.mkdir(workspaceOutput, { recursive: true });

    try {
      const actual = await deriveOutputFolder(
        [siblingOutput, workspaceOutput],
        workspacePath,
        async () => true
      );

      assert.strictEqual(actual, workspaceOutput);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('can scope preferred output candidates to the selected project boundary', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-cp-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const projectA = path.join(workspacePath, 'project-a');
    const projectBOutput = path.join(workspacePath, 'project-b', 'target', 'classes');
    const projectAOutput = path.join(projectA, 'target', 'classes');
    await fs.promises.mkdir(projectBOutput, { recursive: true });
    await fs.promises.mkdir(projectAOutput, { recursive: true });

    try {
      const actual = await deriveOutputFolder(
        [projectBOutput, projectAOutput],
        projectA,
        async () => true,
        { allowRecognizedOutputOutsideBoundary: false }
      );

      assert.strictEqual(actual, projectAOutput);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips external generic classpath roots before returning workspace candidates', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-cp-'));
    const workspacePath = path.join(tempRoot, 'workspace', 'project');
    const externalClasspathRoot = path.join(tempRoot, 'external-deps', 'generated');
    const workspaceOutput = path.join(workspacePath, 'custom-output');
    await fs.promises.mkdir(externalClasspathRoot, { recursive: true });
    await fs.promises.mkdir(workspaceOutput, { recursive: true });

    try {
      const actual = await deriveOutputFolder(
        [externalClasspathRoot, workspaceOutput],
        workspacePath,
        async () => true
      );

      assert.strictEqual(actual, workspaceOutput);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips external descendants under recognized output roots', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-cp-'));
    const workspacePath = path.join(tempRoot, 'workspace', 'project');
    const externalOutputChild = path.join(
      tempRoot,
      'external-deps',
      'target',
      'classes',
      'com',
      'acme'
    );
    const externalOutput = path.join(tempRoot, 'external-build', 'target', 'classes');
    await fs.promises.mkdir(externalOutputChild, { recursive: true });
    await fs.promises.mkdir(externalOutput, { recursive: true });

    try {
      const actual = await deriveOutputFolder(
        [externalOutputChild, externalOutput],
        workspacePath,
        async () => true
      );

      assert.strictEqual(actual, externalOutput);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('recognizes mixed-case Windows output suffixes outside the workspace', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const windowsOutput = 'C:\\external-build\\TARGET\\CLASSES';
    const originalStat = fs.promises.stat;
    fs.promises.stat = (async (targetPath: fs.PathLike) => {
      if (targetPath === windowsOutput) {
        return { isDirectory: () => true } as fs.Stats;
      }
      throw new Error(`Unexpected stat path: ${String(targetPath)}`);
    }) as typeof fs.promises.stat;

    try {
      const actual = await deriveOutputFolder(
        [windowsOutput],
        'D:\\workspace\\project',
        async () => true
      );

      assert.strictEqual(actual, windowsOutput);
    } finally {
      fs.promises.stat = originalStat;
    }
  });

  it('orders derived output folders by specificity and source set', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const cases = [
      {
        roots: ['build/classes', 'build/classes/java/main'],
        expected: 'build/classes/java/main',
      },
      {
        roots: ['bin', 'bin/main'],
        expected: 'bin/main',
      },
      {
        roots: ['target/test-classes', 'build/classes/java/main'],
        expected: 'build/classes/java/main',
      },
    ];

    for (const testCase of cases) {
      const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-cp-'));
      const workspacePath = path.join(tempRoot, 'project');
      const roots = testCase.roots.map((root) => path.join(workspacePath, root));
      await Promise.all(roots.map((root) => fs.promises.mkdir(root, { recursive: true })));

      try {
        const actual = await deriveOutputFolder(roots, workspacePath, async () => true);

        assert.strictEqual(
          actual,
          path.join(workspacePath, testCase.expected),
          testCase.expected
        );
      } finally {
        await fs.promises.rm(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it('skips derived output candidates rejected by the supplied predicate', async () => {
    const { deriveOutputFolder } =
      require('../workspace/classpathService') as typeof import('../workspace/classpathService');
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-cp-'));
    const workspacePath = path.join(tempRoot, 'project');
    const archiveOnlyOutput = path.join(workspacePath, 'build', 'classes', 'java', 'main');
    const classOutput = path.join(workspacePath, 'target', 'classes');
    await fs.promises.mkdir(archiveOnlyOutput, { recursive: true });
    await fs.promises.mkdir(classOutput, { recursive: true });

    try {
      const actual = await deriveOutputFolder(
        [archiveOnlyOutput, classOutput],
        workspacePath,
        async (candidate) => candidate === classOutput
      );

      assert.strictEqual(actual, classOutput);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
