import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('Config', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('enables source reveal on result selection by default', async () => {
    const configModule = await import('../core/config');
    const config = new configModule.Config({} as never);

    assert.strictEqual(config.revealSourceOnSelection, true);
  });

  it('reads disabled source reveal on result selection from configuration', async () => {
    resetVscodeMock({
      workspace: {
        getConfiguration: () => ({
          get: (key: string) =>
            key === 'results.revealSourceOnSelection' ? false : undefined,
        }),
      },
    } as never);
    const configModule = await import('../core/config');
    const config = new configModule.Config({} as never);

    assert.strictEqual(config.revealSourceOnSelection, false);
  });
});
