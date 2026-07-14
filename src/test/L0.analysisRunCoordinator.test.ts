import * as assert from 'assert';
import { AnalysisRunCoordinator } from '../orchestration/analysisRunCoordinator';

describe('AnalysisRunCoordinator', () => {
  it('makes the previous lease stale when a newer run begins', () => {
    const coordinator = new AnalysisRunCoordinator();
    const older = coordinator.begin();

    const newer = coordinator.begin();

    assert.strictEqual(older.isCurrent(), false);
    assert.strictEqual(newer.isCurrent(), true);
  });

  it('invalidates the current lease explicitly and when disposed', () => {
    const coordinator = new AnalysisRunCoordinator();
    const invalidated = coordinator.begin();

    coordinator.invalidate();
    const disposed = coordinator.begin();
    coordinator.dispose();
    const afterDispose = coordinator.begin();

    assert.strictEqual(invalidated.isCurrent(), false);
    assert.strictEqual(disposed.isCurrent(), false);
    assert.strictEqual(afterDispose.isCurrent(), false);
  });
});
