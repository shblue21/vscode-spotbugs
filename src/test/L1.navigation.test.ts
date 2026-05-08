import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('navigation', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('opens explicit go-to-code navigation in a focused permanent editor', async () => {
    const shown: Array<{ uri: { fsPath: string }; options: Record<string, unknown> }> = [];
    resetVscodeMock({
      window: {
        showTextDocument: async (
          uri: { fsPath: string },
          options: Record<string, unknown>
        ) => {
          shown.push({ uri, options });
          return undefined;
        },
      },
    } as never);
    const { revealFindingSource } = await import('../commands/navigation');
    const finding = makeFinding();

    await revealFindingSource(finding);

    assert.strictEqual(shown.length, 1);
    assert.strictEqual(shown[0].uri.fsPath, '/tmp/Example.java');
    assert.strictEqual(shown[0].options.preserveFocus, false);
    assert.strictEqual(shown[0].options.preview, false);
  });

  it('can preview a selected finding source without stealing focus', async () => {
    const shown: Array<{ uri: { fsPath: string }; options: Record<string, unknown> }> = [];
    resetVscodeMock({
      window: {
        showTextDocument: async (
          uri: { fsPath: string },
          options: Record<string, unknown>
        ) => {
          shown.push({ uri, options });
          return undefined;
        },
      },
    } as never);
    const { revealFindingSource } = await import('../commands/navigation');
    const finding = makeFinding();

    await revealFindingSource(finding, { preserveFocus: true, preview: true });

    assert.strictEqual(shown.length, 1);
    assert.strictEqual(shown[0].uri.fsPath, '/tmp/Example.java');
    assert.strictEqual(shown[0].options.preserveFocus, true);
    assert.strictEqual(shown[0].options.preview, true);
  });

  it('does not open source when a preview request becomes stale', async () => {
    const shown: Array<{ uri: { fsPath: string }; options: Record<string, unknown> }> = [];
    resetVscodeMock({
      window: {
        showTextDocument: async (
          uri: { fsPath: string },
          options: Record<string, unknown>
        ) => {
          shown.push({ uri, options });
          return undefined;
        },
      },
    } as never);
    const { revealFindingSource } = await import('../commands/navigation');
    const finding = makeFinding();

    await revealFindingSource(finding, {
      preserveFocus: true,
      preview: true,
      isCurrentRequest: () => false,
    });

    assert.deepStrictEqual(shown, []);
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 10,
    },
    ...overrides,
  };
}
