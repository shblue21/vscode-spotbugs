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

async function makeTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-test-'));
}

async function writeFile(filePath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, '');
}

async function cleanup(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

describe('outputResolver', () => {
  it('detects bytecode target extensions', () => {
    assert.strictEqual(isBytecodeTarget('Foo.class'), true);
    assert.strictEqual(isBytecodeTarget('Foo.jar'), true);
    assert.strictEqual(isBytecodeTarget('Foo.zip'), true);
    assert.strictEqual(isBytecodeTarget('Foo.java'), false);
  });

  it('detects class files under a directory', async () => {
    const dir = await makeTempDir();
    try {
      const classFile = path.join(dir, 'classes', 'Foo.class');
      await writeFile(classFile);
      const has = await hasClassTargets(dir);
      assert.strictEqual(has, true);
    } finally {
      await cleanup(dir);
    }
  });

  it('detects archive bytecode targets under a directory', async () => {
    for (const archiveName of ['app.jar', 'app.zip', 'APP.JAR', 'LIB.ZIP']) {
      const dir = await makeTempDir();
      try {
        await writeFile(path.join(dir, 'libs', archiveName));
        const has = await hasClassTargets(dir);
        assert.strictEqual(has, true, archiveName);
      } finally {
        await cleanup(dir);
      }
    }
  });

  it('detects loose class targets without counting archives', async () => {
    const classDir = await makeTempDir();
    const archiveDir = await makeTempDir();
    const directDir = await makeTempDir();
    try {
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
    } finally {
      await cleanup(classDir);
      await cleanup(archiveDir);
      await cleanup(directDir);
    }
  });

  it('finds default output folders with class files', async () => {
    const dir = await makeTempDir();
    try {
      const outputDir = path.join(dir, 'build', 'classes', 'java', 'main');
      await writeFile(path.join(outputDir, 'Foo.class'));
      const found = await findOutputFolderFromProject(dir);
      assert.strictEqual(found, outputDir);
    } finally {
      await cleanup(dir);
    }
  });

  it('skips target checks for missing output folders', async () => {
    const dir = await makeTempDir();
    try {
      let checks = 0;
      const found = await findOutputFolderFromProject(dir, async () => {
        checks += 1;
        return false;
      });

      assert.strictEqual(found, undefined);
      assert.strictEqual(checks, 0);
    } finally {
      await cleanup(dir);
    }
  });

  it('finds default output folders with archive bytecode targets', async () => {
    const dir = await makeTempDir();
    try {
      const outputDir = path.join(dir, 'build', 'classes', 'java', 'main');
      await writeFile(path.join(outputDir, 'libs', 'app.ZIP'));
      const found = await findOutputFolderFromProject(dir);
      assert.strictEqual(found, outputDir);
    } finally {
      await cleanup(dir);
    }
  });

  it('can find default output folders with a loose-class predicate', async () => {
    const dir = await makeTempDir();
    try {
      const archiveOnlyOutputDir = path.join(dir, 'build', 'classes', 'java', 'main');
      const classOutputDir = path.join(dir, 'target', 'classes');
      await writeFile(path.join(archiveOnlyOutputDir, 'libs', 'app.jar'));
      await writeFile(path.join(classOutputDir, 'demo', 'Foo.class'));

      const found = await findOutputFolderFromProject(dir, hasLooseClassTargets);
      assert.strictEqual(found, classOutputDir);
    } finally {
      await cleanup(dir);
    }
  });

  it('finds standard test output folders with a loose-class predicate', async () => {
    for (const relativeOutputDir of [
      path.join('target', 'test-classes'),
      path.join('build', 'classes', 'java', 'test'),
      path.join('build', 'classes', 'kotlin', 'test'),
      path.join('bin', 'test'),
    ]) {
      const dir = await makeTempDir();
      try {
        const outputDir = path.join(dir, relativeOutputDir);
        await writeFile(path.join(outputDir, 'demo', 'FooTest.class'));

        const found = await findOutputFolderFromProject(dir, hasLooseClassTargets);

        assert.strictEqual(found, outputDir, relativeOutputDir);
      } finally {
        await cleanup(dir);
      }
    }
  });

  it('can rank default output folder candidates without changing the default order', async () => {
    const dir = await makeTempDir();
    try {
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
    } finally {
      await cleanup(dir);
    }
  });
});
