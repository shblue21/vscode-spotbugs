import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const {
  readPluginConfiguration,
  readScopedSetting,
  parseDetectorOverrides,
  updateCoreDetectors,
  updatePluginConfiguration,
} = require('../services/pluginConfiguration') as typeof import('../services/pluginConfiguration');

type Scope = { globalValue?: unknown; workspaceValue?: unknown };
function configuration(settings: Record<string, Scope>) {
  const writes: Array<{ key: string; value: unknown; global: boolean }> = [];
  resetVscodeMock({
    workspace: {
      getConfiguration: () => ({
        get: () => undefined,
        inspect: (key: string) => settings[key],
        update: async (key: string, value: unknown, global: boolean) => {
          writes.push({ key, value, global });
          const entry = settings[key] ?? (settings[key] = {});
          entry[global ? 'globalValue' : 'workspaceValue'] = value;
        },
      }),
    },
  } as never);
  return writes;
}
const plugin = {
  id: 'check',
  path: 'check.jar',
  enabled: true,
  detectors: { ['example.Check']: false },
};

describe('plugin configuration ownership', () => {
  afterEach(() => resetVscodeMock());

  it('does not write unchanged core overrides, including an absent default', async () => {
    for (const scope of [
      undefined,
      { workspaceValue: {} },
      { globalValue: { ['example.Check']: false } },
    ]) {
      const writes = configuration(scope ? { ['analysis.detectors']: scope } : {});
      const { target } = readScopedSetting('analysis.detectors');
      assert.strictEqual(await updateCoreDetectors(target, (previous) => ({ ...previous })), false);
      assert.strictEqual(writes.length, 0);
    }
  });

  it('serializes core changes after plugin writes and reads the latest overrides', async () => {
    const settings = { ['analysis.detectors']: { workspaceValue: {} as Record<string, boolean> } };
    const writes = configuration(settings);
    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const pluginUpdate = updatePluginConfiguration(
      {
        readConfiguration: () => ({ target: 'workspace', registrations: [], workspaceRoots: [] }),
        writeConfiguration: () => pendingWrite,
      },
      () => [plugin],
    );
    const coreUpdate = updateCoreDetectors('workspace', (previous) => ({
      ...previous,
      ['example.Second']: true,
    }));
    await Promise.resolve();
    assert.strictEqual(writes.length, 0);
    settings['analysis.detectors'].workspaceValue = { ['example.First']: false };
    finishWrite();
    await Promise.all([pluginUpdate, coreUpdate]);
    assert.deepStrictEqual(writes[0].value, { ['example.First']: false, ['example.Second']: true });
  });

  it('rejects a changed core scope and allows the next queued write', async () => {
    const writes = configuration({ ['analysis.detectors']: { globalValue: {} } });
    await assert.rejects(
      updateCoreDetectors('workspace', () => ({ ['example.Check']: true })),
      /scope changed/,
    );
    assert.strictEqual(writes.length, 0);
    assert.strictEqual(
      await updateCoreDetectors('global', () => ({ ['example.Check']: true })),
      true,
    );
    assert.strictEqual(writes.length, 1);
  });

  it('uses one explicit scope, with empty workspace values masking user settings', () => {
    configuration({
      ['plugins.registrations']: { globalValue: [plugin], workspaceValue: [] },
      ['analysis.detectors']: { globalValue: { ['example.Check']: true }, workspaceValue: {} },
    });
    assert.deepStrictEqual(readPluginConfiguration().registrations, []);
    assert.strictEqual(readPluginConfiguration().target, 'workspace');
    assert.deepStrictEqual(
      parseDetectorOverrides(readScopedSetting('analysis.detectors').value),
      {},
    );
  });

  it('inherits the entire user registration and copies its child settings', () => {
    configuration({ ['plugins.registrations']: { globalValue: [plugin] } });
    const state = readPluginConfiguration();
    assert.strictEqual(state.target, 'global');
    state.registrations[0].detectors['example.Check'] = true;
    assert.strictEqual(plugin.detectors['example.Check'], false);
  });

  it('ignores old keys without changing new-setting scope or writing configuration', () => {
    const oldSettings = {
      ['plugins.paths']: { globalValue: ['old.jar'], workspaceValue: [] },
      ['plugins.disabledPaths']: { globalValue: ['check.jar'], workspaceValue: ['check.jar'] },
    };
    for (const [registrationSetting, target, expected] of [
      [undefined, 'global', []],
      [{ globalValue: [plugin] }, 'global', [plugin]],
      [{ globalValue: [plugin], workspaceValue: [] }, 'workspace', []],
      [{ workspaceValue: [plugin] }, 'workspace', [plugin]],
    ] as const) {
      const settings = {
        ...oldSettings,
        ...(registrationSetting ? { ['plugins.registrations']: registrationSetting } : {}),
      };
      const before = structuredClone(settings);
      const writes = configuration(settings);
      const state = readPluginConfiguration();
      assert.strictEqual(state.error, undefined);
      assert.strictEqual(state.target, target);
      assert.deepStrictEqual(state.registrations, expected);
      assert.deepStrictEqual(writes, []);
      assert.deepStrictEqual(settings, before);
    }
  });

  it('rejects malformed settings instead of silently dropping entries', () => {
    configuration({
      ['plugins.registrations']: { globalValue: [{ path: 'check.jar', enabled: 'false' }] },
    });
    assert.ok(readPluginConfiguration().error);
    assert.throws(() => parseDetectorOverrides({ ['example.Check']: 'false' }), /booleans/);
    assert.throws(() => parseDetectorOverrides(null), /booleans/);
  });

  it('requires a persistent unique ID in the selected scope, including disabled registrations', () => {
    const { id: _id, ...withoutId } = plugin;
    for (const registrations of [
      [withoutId],
      [{ ...plugin, id: '' }],
      [plugin, { ...plugin, enabled: false }],
    ]) {
      const writes = configuration({
        ['plugins.registrations']: { workspaceValue: registrations },
      });
      assert.ok(readPluginConfiguration().error);
      assert.deepStrictEqual(writes, []);
    }
    configuration({
      ['plugins.registrations']: { workspaceValue: [plugin], globalValue: [plugin] },
    });
    assert.strictEqual(readPluginConfiguration().error, undefined);
  });
});
