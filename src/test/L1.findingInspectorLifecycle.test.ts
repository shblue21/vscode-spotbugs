import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorLifecycle', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('clears inspector state before running lifecycle operations', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { clearInspectorBeforeOperation } = await import('../commands/findingInspectorLifecycle');
    const state = new findingInspectorState.FindingInspectorState();
    const finding = makeFinding();
    const observedStatuses: string[] = [];

    state.select(finding);
    await clearInspectorBeforeOperation(state, () => {
      observedStatuses.push(state.current.status);
    });

    assert.deepStrictEqual(observedStatuses, ['empty']);
    assert.strictEqual(state.current.status, 'empty');
  });

  it('reconciles inspector state after filter operations', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { reconcileInspectorAfterOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
    const state = new findingInspectorState.FindingInspectorState();
    const finding = makeFinding();
    const operationStatuses: string[] = [];

    state.select(finding);
    await reconcileInspectorAfterOperation(
      state,
      () => {
        operationStatuses.push(state.current.status);
      },
      () => [],
    );

    assert.deepStrictEqual(operationStatuses, ['selected']);
    assert.strictEqual(state.current.status, 'empty');
  });

  it('keeps inspector state when current finding remains visible after filtering', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { reconcileInspectorAfterOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
    const state = new findingInspectorState.FindingInspectorState();
    const finding = makeFinding();

    state.select(finding);
    await reconcileInspectorAfterOperation(
      state,
      () => undefined,
      () => [finding],
    );

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
  });
});

function makeFinding(): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
    },
  };
}
