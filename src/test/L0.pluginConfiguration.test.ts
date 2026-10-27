import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const { readPluginConfiguration } =
  require('../services/pluginConfiguration') as typeof import('../services/pluginConfiguration');

type Scope = { globalValue?: unknown; workspaceValue?: unknown };
function configuration(settings: Record<string, Scope>) {
  const writes: Array<{ key: string; value: unknown; global: boolean }> = [];
  resetVscodeMock({ workspace: {
    getConfiguration: () => ({
      get: () => undefined,
      inspect: (key: string) => settings[key],
      update: async (key: string, value: unknown, global: boolean) => {
        writes.push({ key, value, global });
        const entry = settings[key] ?? (settings[key] = {});
        entry[global ? 'globalValue' : 'workspaceValue'] = value;
      },
    }),
  } } as never);
  return writes;
}
const plugin = { id: 'check', path: 'check.jar', enabled: true };

describe('plugin configuration ownership', () => {
  afterEach(() => resetVscodeMock());

  it('uses one explicit scope, with empty workspace values masking user settings', () => {
    configuration({
      ['plugins.registrations']: { globalValue: [plugin], workspaceValue: [] },
    });
    assert.deepStrictEqual(readPluginConfiguration().registrations, []);
    assert.strictEqual(readPluginConfiguration().target, 'workspace');
  });

  it('inherits and copies the user registration', () => {
    configuration({ ['plugins.registrations']: { globalValue: [plugin] } });
    const state = readPluginConfiguration();
    assert.strictEqual(state.target, 'global');
    state.registrations[0].path = 'changed.jar';
    assert.strictEqual(plugin.path, 'check.jar');
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
    configuration({ ['plugins.registrations']: { globalValue: [{ path: 'check.jar', enabled: 'false' }] } });
    assert.ok(readPluginConfiguration().error);
  });

  it('requires a persistent unique ID in the selected scope, including disabled registrations', () => {
    const { id: _id, ...withoutId } = plugin;
    for (const registrations of [[withoutId], [{ ...plugin, id: '' }], [plugin, { ...plugin, enabled: false }]]) {
      const writes = configuration({ ['plugins.registrations']: { workspaceValue: registrations } });
      assert.ok(readPluginConfiguration().error);
      assert.deepStrictEqual(writes, []);
    }
    configuration({ ['plugins.registrations']: { workspaceValue: [plugin], globalValue: [plugin] } });
    assert.strictEqual(readPluginConfiguration().error, undefined);
  });
});
