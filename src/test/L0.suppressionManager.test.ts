import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Finding } from '../model/finding';
import {
  MANAGED_SUPPRESSION_MARKER,
  SuppressionFileChangedError,
  createSuppressionPlan,
  inspectManagedSuppressionFile,
  writeManagedSuppressionFile,
} from '../services/suppressionManager';

describe('suppression manager', () => {
  it('uses full pattern types, deduplicates rules, and previews overloads precisely', () => {
    const selected = finding({
      patternId: 'NP',
      type: 'NP_NULL_ON_SOME_PATH',
      methodSignature: '(Ljava/lang/String;)V',
      location: { startLine: 10 },
    });
    const sameMethod = finding({
      type: 'NP_NULL_ON_SOME_PATH',
      methodSignature: '(Ljava/lang/String;)V',
      location: { startLine: 20 },
    });
    const overload = finding({
      type: 'NP_NULL_ON_SOME_PATH',
      methodSignature: '(I)V',
      location: { startLine: 30 },
    });

    const result = createSuppressionPlan(
      [selected, sameMethod],
      [selected, sameMethod, overload]
    );
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value, {
      blocks: [
        '  <Match>\n' +
          '    <Class name="example.Service" />\n' +
          '    <Method name="load" params="java.lang.String" returns="void" />\n' +
          '    <Bug pattern="NP_NULL_ON_SOME_PATH" />\n' +
          '  </Match>\n',
      ],
      selectedCount: 2,
      matchedCount: 2,
      additionalCount: 0,
    });
    assert.deepStrictEqual(
      createSuppressionPlan([finding({ type: undefined })], []),
      { ok: false, unsupportedCount: 1 }
    );
  });

  it('protects user files, rejects modified managed XML, and guards updates', async () => {
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'spotbugs-suppression-test-')
    );
    const filePath = path.join(tempRoot, 'spotbugs-suppressions.xml');
    const escaped = createSuppressionPlan(
      [
        finding({
          type: 'TEST_"<&>',
          className: "example.Outer$Inner'Name",
          methodName: '<init>',
          methodSignature: '(Ljava/lang/String;)V',
        }),
      ],
      []
    );
    assert.ok(escaped.ok);
    const block = escaped.value.blocks[0];

    try {
      assert.deepStrictEqual(await inspectManagedSuppressionFile(filePath), {
        kind: 'missing',
        filePath,
      });

      await fs.promises.writeFile(filePath, '<FindBugsFilter/>\n');
      assert.deepStrictEqual(await inspectManagedSuppressionFile(filePath), {
        kind: 'conflict',
        filePath,
      });

      await fs.promises.writeFile(
        filePath,
        `${MANAGED_SUPPRESSION_MARKER}\n<FindBugsFilter/>\n`
      );
      assert.deepStrictEqual(await inspectManagedSuppressionFile(filePath), {
        kind: 'invalid',
        filePath,
      });

      await fs.promises.unlink(filePath);
      await writeManagedSuppressionFile(filePath, undefined, [block]);
      const managed = await inspectManagedSuppressionFile(filePath);
      assert.ok(managed.kind === 'managed');
      assert.deepStrictEqual(managed.blocks, [block]);
      assert.ok(block.includes('pattern="TEST_&quot;&lt;&amp;&gt;"'));

      await assert.rejects(
        () => writeManagedSuppressionFile(filePath, undefined, [block]),
        SuppressionFileChangedError
      );
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP',
    type: 'NP_ALWAYS_NULL',
    message: 'finding',
    className: 'example.Service',
    methodName: 'load',
    location: { fullPath: '/workspace/src/Service.java', startLine: 1 },
    ...overrides,
  };
}
