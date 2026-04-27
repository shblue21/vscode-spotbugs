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
    const { clearInspectorBeforeOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
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
      () => []
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
      () => [finding]
    );

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
  });

  it('clears inspector for reset/rerun lifecycle without disposing or blanking opened details', async () => {
    let disposeCount = 0;
    let operationCalled = false;
    const webview = { html: '' };
    resetVscodeMock({
      window: {
        createWebviewPanel: () => ({
          title: '',
          webview,
          reveal: () => undefined,
          dispose: () => {
            disposeCount += 1;
          },
          onDidDispose: () => ({ dispose: () => undefined }),
        }),
      } as never,
    });
    const detailsPanelModule = await import('../ui/findingDescriptionPanel');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { clearInspectorBeforeOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
    const finding = makeFinding({ patternId: 'NP_ALWAYS_NULL', type: 'NP_ALWAYS_NULL' });
    const state = new findingInspectorState.FindingInspectorState();
    const panel = new detailsPanelModule.FindingDescriptionPanel();

    state.select(finding);
    panel.show(finding);
    const htmlBeforeLifecycle = webview.html;
    await clearInspectorBeforeOperation(state, async () => {
      operationCalled = true;
    });

    assert.strictEqual(operationCalled, true);
    assert.strictEqual(state.current.status, 'empty');
    assert.strictEqual(disposeCount, 0);
    assert.strictEqual(webview.html, htmlBeforeLifecycle);
    assert.ok(webview.html.includes('NP_ALWAYS_NULL'));
  });

  it('reconciles inspector after filter invalidation without touching opened details', async () => {
    let disposeCount = 0;
    const webview = { html: '' };
    resetVscodeMock({
      window: {
        createWebviewPanel: () => ({
          title: '',
          webview,
          reveal: () => undefined,
          dispose: () => {
            disposeCount += 1;
          },
          onDidDispose: () => ({ dispose: () => undefined }),
        }),
      } as never,
    });
    const detailsPanelModule = await import('../ui/findingDescriptionPanel');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const { reconcileInspectorAfterOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
    const finding = makeFinding({ patternId: 'NP_ALWAYS_NULL', type: 'NP_ALWAYS_NULL' });
    const state = new findingInspectorState.FindingInspectorState();
    const panel = new detailsPanelModule.FindingDescriptionPanel();

    state.select(finding);
    panel.show(finding);
    const htmlBeforeLifecycle = webview.html;
    await reconcileInspectorAfterOperation(state, async () => undefined, () => []);

    assert.strictEqual(state.current.status, 'empty');
    assert.strictEqual(disposeCount, 0);
    assert.strictEqual(webview.html, htmlBeforeLifecycle);
    assert.ok(webview.html.includes('NP_ALWAYS_NULL'));
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
      startLine: 1,
    },
    ...overrides,
  };
}
