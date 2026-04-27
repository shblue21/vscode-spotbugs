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
});
