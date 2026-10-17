import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findOutputFolderFromProject,
  hasClassTargets,
  hasLooseClassTargets,
  isBytecodeTarget,
} from '../workspace/outputResolver';

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-test-'));
  try {
    await run(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function writeFile(filePath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, '');
}

describe('outputResolver', () => {
  it('detects bytecode target extensions', () => {
    assert.strictEqual(isBytecodeTarget('Foo.class'), true);
    assert.strictEqual(isBytecodeTarget('Foo.jar'), true);
    assert.strictEqual(isBytecodeTarget('Foo.zip'), true);
    assert.strictEqual(isBytecodeTarget('Foo.java'), false);
  });

  it('detects class files under a directory', async () => {
    await withTempDir(async (dir) => {
      const classFile = path.join(dir, 'classes', 'Foo.class');
      await writeFile(classFile);
      const has = await hasClassTargets(dir);
      assert.strictEqual(has, true);
    });
  });

  it('detects archive bytecode targets under a directory', async () => {
    for (const archiveName of ['app.jar', 'app.zip', 'APP.JAR', 'LIB.ZIP']) {
      await withTempDir(async (dir) => {
        await writeFile(path.join(dir, 'libs', archiveName));
        const has = await hasClassTargets(dir);
        assert.strictEqual(has, true, archiveName);
      });
    }
  });

  it('detects loose class targets without counting archives', async () => {
    await withTempDir(async (dir) => {
      const classDir = path.join(dir, 'class-files');
      const archiveDir = path.join(dir, 'archives');
      const directDir = path.join(dir, 'direct-files');
      await writeFile(path.join(classDir, 'classes', 'Foo.class'));
      await writeFile(path.join(archiveDir, 'libs', 'app.jar'));
      const jarPath = path.join(directDir, 'app.jar');
      const classPath = path.join(directDir, 'Foo.CLASS');
      await writeFile(jarPath);
      await writeFile(classPath);

      assert.strictEqual(await hasLooseClassTargets(classDir), true);
      assert.strictEqual(await hasLooseClassTargets(archiveDir), false);
      assert.strictEqual(await hasClassTargets(archiveDir), true);
      assert.strictEqual(await hasLooseClassTargets(jarPath), false);
      assert.strictEqual(await hasLooseClassTargets(classPath), true);
    });
  });

  it('finds default output folders with class files', async () => {
    await withTempDir(async (dir) => {
      const outputDir = path.join(dir, 'build', 'classes', 'java', 'main');
      await writeFile(path.join(outputDir, 'Foo.class'));
      const found = await findOutputFolderFromProject(dir);
      assert.strictEqual(found, outputDir);
    });
  });

  it('skips target checks for missing output folders', async () => {
    await withTempDir(async (dir) => {
      let checks = 0;
      const found = await findOutputFolderFromProject(dir, async () => {
        checks += 1;
        return false;
      });

      assert.strictEqual(found, undefined);
      assert.strictEqual(checks, 0);
    });
  });

  it('finds default output folders with archive bytecode targets', async () => {
    await withTempDir(async (dir) => {
      const outputDir = path.join(dir, 'build', 'classes', 'java', 'main');
      await writeFile(path.join(outputDir, 'libs', 'app.ZIP'));
      const found = await findOutputFolderFromProject(dir);
      assert.strictEqual(found, outputDir);
    });
  });

  it('can find default output folders with a loose-class predicate', async () => {
    await withTempDir(async (dir) => {
      const archiveOnlyOutputDir = path.join(dir, 'build', 'classes', 'java', 'main');
      const classOutputDir = path.join(dir, 'target', 'classes');
      await writeFile(path.join(archiveOnlyOutputDir, 'libs', 'app.jar'));
      await writeFile(path.join(classOutputDir, 'demo', 'Foo.class'));

      const found = await findOutputFolderFromProject(dir, hasLooseClassTargets);
      assert.strictEqual(found, classOutputDir);
    });
  });

  it('finds standard test output folders with a loose-class predicate', async () => {
    for (const relativeOutputDir of [
      path.join('target', 'test-classes'),
      path.join('build', 'classes', 'java', 'test'),
      path.join('build', 'classes', 'kotlin', 'test'),
      path.join('bin', 'test'),
    ]) {
      await withTempDir(async (dir) => {
        const outputDir = path.join(dir, relativeOutputDir);
        await writeFile(path.join(outputDir, 'demo', 'FooTest.class'));

        const found = await findOutputFolderFromProject(dir, hasLooseClassTargets);

        assert.strictEqual(found, outputDir, relativeOutputDir);
      });
    }
  });

  it('can rank default output folder candidates without changing the default order', async () => {
    await withTempDir(async (dir) => {
      const mainOutputDir = path.join(dir, 'target', 'classes');
      const testOutputDir = path.join(dir, 'target', 'test-classes');
      await writeFile(path.join(mainOutputDir, 'demo', 'Foo.class'));
      await writeFile(path.join(testOutputDir, 'demo', 'Foo.class'));

      assert.strictEqual(
        await findOutputFolderFromProject(dir, hasLooseClassTargets),
        mainOutputDir
      );

      const found = await findOutputFolderFromProject(dir, hasLooseClassTargets, {
        rankCandidate: ({ targetPath }) => (targetPath === testOutputDir ? 0 : 1),
      });
      assert.strictEqual(found, testOutputDir);
    });
  });
});
