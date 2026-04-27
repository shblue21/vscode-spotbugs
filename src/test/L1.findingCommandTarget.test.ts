import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingCommandTarget', () => {
  it('uses explicit finding payload without user messaging', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const explicit = makeFinding('NP_ALWAYS_NULL');
    const state = new findingInspectorState.FindingInspectorState();

    const target = await resolveFindingCommandTarget(explicit, state, 'open details');

    assert.strictEqual(target, explicit);
    assert.deepStrictEqual(messages, []);
  });

  it('uses a FindingItem-style payload as the explicit target', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new findingInspectorState.FindingInspectorState();

    const target = await resolveFindingCommandTarget({ finding }, state, 'open details');

    assert.strictEqual(target, finding);
    assert.deepStrictEqual(messages, []);
  });

  it('uses retained inspected finding and explains the target', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new findingInspectorState.FindingInspectorState();
    state.select(finding);
    state.retainCurrent();

    const target = await resolveFindingCommandTarget(undefined, state, 'open details');

    assert.strictEqual(target, finding);
    assert.ok(messages.some((message) => message.includes('Last inspected finding')));
  });

  it('shows a message and returns undefined when no finding is available', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const state = new findingInspectorState.FindingInspectorState();

    const target = await resolveFindingCommandTarget(undefined, state, 'go to code');

    assert.strictEqual(target, undefined);
    assert.ok(messages.some((message) => message.includes('No SpotBugs finding')));
  });

  it('rejects malformed payloads without a string patternId and object location', async () => {
    const { isFindingPayload } = await import('../commands/findingCommandTarget');

    assert.strictEqual(isFindingPayload({ patternId: 12, location: {} }), false);
    assert.strictEqual(isFindingPayload({ patternId: 'NP_ALWAYS_NULL', location: null }), false);
    assert.strictEqual(isFindingPayload({ patternId: 'NP_ALWAYS_NULL' }), false);
    assert.strictEqual(isFindingPayload({ patternId: 'NP_ALWAYS_NULL', location: {} }), true);
  });
});

function makeFinding(patternId: string): Finding {
  return {
    patternId,
    type: patternId,
    message: patternId,
    location: {
      fullPath: `/tmp/${patternId}.java`,
      startLine: 1,
    },
  };
}
