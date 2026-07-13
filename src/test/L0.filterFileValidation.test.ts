import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AnalysisSettings } from '../core/config';
import {
  validateExtraAuxClasspathPreflight,
  validateFilterFilesPreflight,
  validatePluginJarsPreflight,
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

  it('returns CFG_PLUGIN_NOT_FOUND when a plugin jar is missing', async () => {
    const missingPath = path.join(
      os.tmpdir(),
      `spotbugs-missing-${process.pid}-${Date.now()}-plugin.jar`
    );
    const error = await validatePluginJarsPreflight(
      makeSettings({ plugins: [missingPath] })
    );

    assert.ok(error);
    assert.strictEqual(error?.code, 'CFG_PLUGIN_NOT_FOUND');
    assert.ok((error?.message ?? '').includes('SpotBugs plugin jar not found'));
  });

  it('returns CFG_PLUGIN_NOT_FILE when a plugin path points to a directory', async () => {
    const dir = await makeTempDir();
    try {
      const error = await validatePluginJarsPreflight(
        makeSettings({ plugins: [dir] })
      );

      assert.ok(error);
      assert.strictEqual(error?.code, 'CFG_PLUGIN_NOT_FILE');
      assert.ok(
        (error?.message ?? '').includes(
          'SpotBugs plugin path is not a regular file'
        )
      );
    } finally {
      await cleanup(dir);
    }
  });

  it('returns CFG_PLUGIN_NOT_JAR when a plugin path is not a lowercase jar file', async () => {
    const dir = await makeTempDir();
    try {
      const pluginPath = path.join(dir, 'findsecbugs.JAR');
      await writeFile(pluginPath, '');

      const error = await validatePluginJarsPreflight(
        makeSettings({ plugins: [pluginPath] })
      );

      assert.ok(error);
      assert.strictEqual(error?.code, 'CFG_PLUGIN_NOT_JAR');
      assert.ok(
        (error?.message ?? '').includes(
          'SpotBugs plugin path must be a .jar file'
        )
      );
    } finally {
      await cleanup(dir);
    }
  });

  it('returns CFG_PLUGIN_UNREADABLE when a plugin jar cannot be opened for reading', async () => {
    const dir = await makeTempDir();
    const originalOpen = fs.promises.open;
    try {
      const pluginPath = path.join(dir, 'unreadable.jar');
      await writeFile(pluginPath, '');
      fs.promises.open = (async (filePath, flags, mode) => {
        if (filePath === pluginPath) {
          throw new Error('permission denied');
        }
        return originalOpen.call(fs.promises, filePath, flags, mode);
      }) as typeof fs.promises.open;

      const error = await validatePluginJarsPreflight(
        makeSettings({ plugins: [pluginPath] })
      );

      assert.ok(error);
      assert.strictEqual(error?.code, 'CFG_PLUGIN_UNREADABLE');
      assert.ok(
        (error?.message ?? '').includes('SpotBugs plugin jar is not readable')
      );
    } finally {
      fs.promises.open = originalOpen;
      await cleanup(dir);
    }
  });

  it('passes when configured plugin jars are readable files', async () => {
    const dir = await makeTempDir();
    try {
      const pluginPath = path.join(dir, 'findsecbugs.jar');
      await writeFile(pluginPath, '');

      const error = await validatePluginJarsPreflight(
        makeSettings({ plugins: [pluginPath] })
      );

      assert.strictEqual(error, undefined);
    } finally {
      await cleanup(dir);
    }
  });
});
