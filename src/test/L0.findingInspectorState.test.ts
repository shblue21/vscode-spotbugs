import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorState', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('selects, retains, clears, and emits snapshots', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new findingInspectorState.FindingInspectorState();
    const statuses: string[] = [];

    state.onDidChange((snapshot) => statuses.push(snapshot.status));
    state.select(finding);
    state.retainCurrent();
    state.clear();

    assert.deepStrictEqual(statuses, ['selected', 'retained', 'empty']);
    assert.strictEqual(state.current.status, 'empty');
  });

  it('keeps visible selected findings after filter reconciliation by instance hash', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new findingInspectorState.FindingInspectorState();

    state.select(finding);
    state.reconcileVisibleFindings([{ ...finding, message: 'Updated copy' }]);

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
  });

  it('keeps visible selected findings after filter reconciliation by stable identity', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const finding = makeFinding('NP_ALWAYS_NULL', undefined);
    const state = new findingInspectorState.FindingInspectorState();

    state.select(finding);
    state.reconcileVisibleFindings([{ ...finding, message: 'Updated copy' }]);

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
  });

  it('clears inspected finding when filter reconciliation removes it', async () => {
    const findingInspectorState = await import('../ui/findingInspectorState');
    const state = new findingInspectorState.FindingInspectorState();

    state.select(makeFinding('NP_ALWAYS_NULL'));
    state.reconcileVisibleFindings([makeFinding('URF_UNREAD_FIELD')]);

    assert.strictEqual(state.current.status, 'empty');
  });
});

function makeFinding(patternId: string, instanceHash = `${patternId}-hash`): Finding {
  return {
    patternId,
    type: patternId,
    abbrev: patternId.split('_')[0],
    message: patternId,
    instanceHash,
    className: 'Example',
    methodName: 'method',
    fieldName: 'field',
    location: {
      fullPath: `/tmp/${patternId}.java`,
      sourceFile: `${patternId}.java`,
      startLine: 12,
      endLine: 12,
    },
  };
}
