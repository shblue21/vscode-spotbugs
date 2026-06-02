import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findOutputFolderFromProject,
  hasClassTargets,
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
});
