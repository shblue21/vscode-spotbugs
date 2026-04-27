import * as assert from 'assert';
import { deriveTargetResolutionRoots } from '../workspace/classpathLayout';

describe('classpathService', () => {
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
});
