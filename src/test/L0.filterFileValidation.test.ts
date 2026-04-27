import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AnalysisSettings } from '../core/config';
import {
  validateExtraAuxClasspathPreflight,
  validateFilterFilesPreflight,
} from '../services/filterFileValidation';

function makeSettings(overrides: Partial<AnalysisSettings> = {}): AnalysisSettings {
  return {
    effort: 'default',
    ...overrides,
  };
}

async function makeTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'spotbugs-filter-test-'));
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function cleanup(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

describe('filterFileValidation', () => {
  it('returns CFG_FILTER_NOT_FOUND when filter file does not exist', async () => {
    const missingPath = path.join(
      os.tmpdir(),
      `spotbugs-missing-${process.pid}-${Date.now()}-include.xml`
    );
    const error = await validateFilterFilesPreflight(
      makeSettings({ includeFilterPaths: [missingPath] })
    );

    assert.ok(error);
    assert.strictEqual(error?.code, 'CFG_FILTER_NOT_FOUND');
    assert.ok((error?.message ?? '').includes('include filter file not found'));
  });

  it('returns CFG_FILTER_NOT_FILE when filter path points to a directory', async () => {
    const dir = await makeTempDir();
    try {
      const error = await validateFilterFilesPreflight(
        makeSettings({ excludeFilterPaths: [dir] })
      );

      assert.ok(error);
      assert.strictEqual(error?.code, 'CFG_FILTER_NOT_FILE');
      assert.ok((error?.message ?? '').includes('exclude filter file is not a regular file'));
    } finally {
      await cleanup(dir);
    }
  });

  it('passes when configured filter files are readable regular files', async () => {
    const dir = await makeTempDir();
    try {
      const includePath = path.join(dir, 'include.xml');
      const excludePath = path.join(dir, 'exclude.xml');
      const baselinePath = path.join(dir, 'baseline.xml');
      await writeFile(includePath, '<FindBugsFilter/>');
      await writeFile(excludePath, '<FindBugsFilter/>');
      await writeFile(baselinePath, '<BugCollection/>');

      const error = await validateFilterFilesPreflight(
        makeSettings({
          includeFilterPaths: [includePath],
          excludeFilterPaths: [excludePath],
          excludeBaselineBugsPaths: [baselinePath],
        })
      );

      assert.strictEqual(error, undefined);
    } finally {
      await cleanup(dir);
    }
  });

  it('returns CFG_AUX_CLASSPATH_NOT_FOUND when an extra aux classpath entry is missing', async () => {
    const missingPath = path.join(
      os.tmpdir(),
      `spotbugs-missing-${process.pid}-${Date.now()}-aux.jar`
    );
    const error = await validateExtraAuxClasspathPreflight(
      makeSettings({ extraAuxClasspaths: [missingPath] })
    );

    assert.ok(error);
    assert.strictEqual(error?.code, 'CFG_AUX_CLASSPATH_NOT_FOUND');
    assert.ok((error?.message ?? '').includes('extra aux classpath entry not found'));
  });

  it('returns CFG_AUX_CLASSPATH_INVALID_ENTRY when an extra aux classpath entry is not a jar/zip or directory', async () => {
    const dir = await makeTempDir();
    try {
      const invalidPath = path.join(dir, 'not-a-classpath.txt');
      await writeFile(invalidPath, 'plain text');

      const error = await validateExtraAuxClasspathPreflight(
        makeSettings({ extraAuxClasspaths: [invalidPath] })
      );

      assert.ok(error);
      assert.strictEqual(error?.code, 'CFG_AUX_CLASSPATH_INVALID_ENTRY');
      assert.ok(
        (error?.message ?? '').includes(
          'extra aux classpath entry must be a directory or .jar/.zip file'
        )
      );
    } finally {
      await cleanup(dir);
    }
  });

  it('passes when extra aux classpath entries are readable jars or directories', async () => {
    const dir = await makeTempDir();
    try {
      const jarPath = path.join(dir, 'lib', 'helper.jar');
      const classesDir = path.join(dir, 'classes');
      await writeFile(jarPath, '');
      await fs.promises.mkdir(classesDir, { recursive: true });

      const error = await validateExtraAuxClasspathPreflight(
        makeSettings({ extraAuxClasspaths: [jarPath, classesDir] })
      );

      assert.strictEqual(error, undefined);
    } finally {
      await cleanup(dir);
    }
  });
});
