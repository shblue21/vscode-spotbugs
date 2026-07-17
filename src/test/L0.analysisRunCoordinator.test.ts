import * as assert from 'assert';
import { AnalysisRunCoordinator } from '../orchestration/analysisRunCoordinator';

function createCancellationFactory() {
  const sources: Array<{
    token: { isCancellationRequested: boolean };
    cancelCalls: number;
    disposeCalls: number;
    cancel(): void;
    dispose(): void;
  }> = [];

  return {
    sources,
    create: () => {
      const source = {
        token: { isCancellationRequested: false },
        cancelCalls: 0,
        disposeCalls: 0,
        cancel() {
          this.cancelCalls += 1;
          this.token.isCancellationRequested = true;
        },
        dispose() {
          this.disposeCalls += 1;
        },
      };
      sources.push(source);
      return source as any;
    },
  };
}

describe('AnalysisRunCoordinator', () => {
  it('makes the previous lease stale when a newer run begins', () => {
    const cancellation = createCancellationFactory();
    const coordinator = new AnalysisRunCoordinator(cancellation.create);
    const older = coordinator.begin();

    const newer = coordinator.begin();

    assert.strictEqual(older.isCurrent(), false);
    assert.strictEqual(newer.isCurrent(), true);
    assert.strictEqual(older.token?.isCancellationRequested, true);
    assert.strictEqual(newer.token?.isCancellationRequested, false);
    assert.strictEqual(cancellation.sources[0].cancelCalls, 1);
    assert.strictEqual(cancellation.sources[0].disposeCalls, 1);

    older.cancel();
    assert.strictEqual(cancellation.sources[0].cancelCalls, 1);
    assert.strictEqual(cancellation.sources[1].cancelCalls, 0);
  });

  it('invalidates the current lease explicitly and when disposed', () => {
    const cancellation = createCancellationFactory();
    const coordinator = new AnalysisRunCoordinator(cancellation.create);
    const invalidated = coordinator.begin();

    coordinator.invalidate();
    const disposed = coordinator.begin();
    coordinator.dispose();
    const afterDispose = coordinator.begin();

    assert.strictEqual(invalidated.isCurrent(), false);
    assert.strictEqual(disposed.isCurrent(), false);
    assert.strictEqual(afterDispose.isCurrent(), false);
    assert.strictEqual(invalidated.token?.isCancellationRequested, true);
    assert.strictEqual(disposed.token?.isCancellationRequested, true);
    assert.strictEqual(afterDispose.token, undefined);
    assert.deepStrictEqual(
      cancellation.sources.map((source) => [source.cancelCalls, source.disposeCalls]),
      [
        [1, 1],
        [1, 1],
      ]
    );
  });
});
