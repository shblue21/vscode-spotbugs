import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { PluginConfigurationState, PluginRegistration } from '../services/pluginConfiguration';
import type {
  PluginConfigurationDeps,
} from '../commands/pluginInventory';
import type { PluginInventoryResult } from '../services/pluginInventoryService';
import type { PathSettingState } from '../services/pathSetting';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const { getPluginInventory, parsePluginInventoryResponse } = require(
  '../services/pluginInventoryService'
) as typeof import('../services/pluginInventoryService');

function makeConfig(settings: { effort: string; plugins?: string[] }, disabled: string[] = []) {
  return {
    getConfiguredPlugins: (_resource?: Uri) => (settings.plugins ?? []).map((pluginPath) => ({
      id: pluginPath, path: pluginPath, resolvedPath: pluginPath, enabled: !disabled.includes(pluginPath), target: 'workspace' as const,
    })),
  };
}

function inventoryResponse(results: object[]): string {
  return JSON.stringify({ results: [{ index: -1, path: '', status: 'VALIDATED', detectors: [] }, ...results], errors: [] });
}

describe('pluginInventoryCommands', () => {
  beforeEach(() => {
    resetVscodeMock();
    delete require.cache[require.resolve('../commands/pluginInventory')];
  });

  it('does not publish an in-flight refresh after invalidation', async () => {
    const { refreshPluginInventory, invalidatePluginInventoryRefresh } = require(
      '../commands/pluginInventory'
    ) as typeof import('../commands/pluginInventory');
    let resolveBackend:
      | ((value: string | PromiseLike<string | undefined> | undefined) => void)
      | undefined;
    const backend = new Promise<string | undefined>((resolve) => {
      resolveBackend = resolve;
    });
    const published: PluginInventoryResult[] = [];

    const refresh = refreshPluginInventory(
      makeConfig({ effort: 'default', plugins: ['/workspace/plugin-a.jar'] }),
      {
        showInventory: (result: PluginInventoryResult) => {
          published.push(result);
        },
      },
      undefined,
      { runPluginInventory: async () => backend }
    );

    invalidatePluginInventoryRefresh();
    resolveBackend?.(inventoryResponse([{ index: 0, path: 'plugin-a.jar' }]));
    await refresh;

    assert.strictEqual(published.length, 1); // Only the immediate configuration snapshot.
    assert.strictEqual(published[0].items[0].status, undefined);
  });

  it('does not use active editor as a fallback refresh resource', async () => {
    const vscode = resetVscodeMock();
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/workspace-b/src/Foo.java') },
    };
    const { refreshPluginInventory } = require(
      '../commands/pluginInventory'
    ) as typeof import('../commands/pluginInventory');
    let observedResource: Uri | undefined;

    await refreshPluginInventory(
      {
        getConfiguredPlugins: (resource?: Uri) => {
          observedResource = resource;
          return makeConfig({ effort: 'default', plugins: ['/workspace/plugin-a.jar'] }).getConfiguredPlugins();
        },
      },
      { showInventory: () => undefined },
      undefined,
      { runPluginInventory: async () => inventoryResponse([]) }
    );

    assert.strictEqual(observedResource, undefined);
  });

  it('registers a JAR in the new setting while leaving old values untouched', async () => {
    const { addPluginJars } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const { readPluginConfiguration } = require('../services/pluginConfiguration') as typeof import('../services/pluginConfiguration');
    const vscode = resetVscodeMock();
    const values: Record<string, unknown> = {
      ['plugins.paths']: ['a.jar'],
      ['plugins.disabledPaths']: ['a.jar'],
    };
    const writes: Array<{ key: string; global: boolean }> = [];
    const configuration = {
      get: () => undefined,
      inspect: (key: string) => ({ workspaceValue: values[key] }),
      update: async (key: string, value: unknown, global: boolean) => {
        writes.push({ key, global });
        values[key] = value;
      },
    };
    resetVscodeMock({ workspace: {
      workspaceFolders: [{ name: 'workspace', uri: vscode.Uri.file('/workspace') }],
      getConfiguration: () => configuration,
    } } as never);
    try {
      assert.deepStrictEqual(readPluginConfiguration().registrations, []);
      assert.strictEqual(await addPluginJars({
        selectPluginJars: async () => [vscode.Uri.file('/workspace/a.jar') as unknown as Uri],
        readConfiguration: readPluginConfiguration,
        writeConfiguration: (registrations, target) =>
          configuration.update('plugins.registrations', registrations, target === 'global'),
        validatePluginJars: async (paths) => {
          assert.deepStrictEqual(paths, ['/workspace/a.jar']);
          return undefined;
        },
      }), true);
      const state = readPluginConfiguration();
      assert.strictEqual(state.error, undefined);
      assert.deepStrictEqual(writes, [{ key: 'plugins.registrations', global: false }]);
      assert.match(state.registrations[0].id, /^[0-9a-f-]{36}$/);
      assert.deepStrictEqual(state.registrations.map(({ id: _id, ...entry }) => entry), [
        { path: 'a.jar', enabled: true },
      ]);
      assert.deepStrictEqual(values['plugins.paths'], ['a.jar']);
      assert.deepStrictEqual(values['plugins.disabledPaths'], ['a.jar']);
    } finally {
      resetVscodeMock();
    }
  });

  it('serializes registration toggles and removal', async () => {
    const { setPluginEnabled, removePluginJar, addPluginJars } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const vscode = installVscodeMock();
    for (const target of ['global', 'workspace'] as const) {
      const state: PluginConfigurationState = { target, registrations: ['/a.jar', '/b.jar'].map((path) => ({
        id: path, path, enabled: true,
      })), workspaceRoots: [] };
      const deps: PluginConfigurationDeps = {
        readConfiguration: () => state,
        selectPluginJars: async () => [vscode.Uri.file('/b.jar') as unknown as Uri],
        validatePluginJars: async () => undefined,
        writeConfiguration: async (registrations, scope) => { assert.strictEqual(scope, target); await Promise.resolve(); state.registrations = registrations; },
      };
      await Promise.all(['/a.jar', '/b.jar'].map((pluginPath) => setPluginEnabled({ registrationId: pluginPath, pluginPath, configurationTarget: target }, false, deps)));
      assert.deepStrictEqual(state.registrations.map((entry) => entry.enabled), [false, false]);
      await setPluginEnabled({ registrationId: '/a.jar', pluginPath: '/a.jar', configurationTarget: target }, true, deps);
      await removePluginJar({ registrationId: '/b.jar', pluginPath: '/b.jar', configurationTarget: target }, deps);
      await addPluginJars(deps);
      assert.match(state.registrations[1].id, /^[0-9a-f-]{36}$/);
      assert.notStrictEqual(state.registrations[1].id, '/b.jar');
      assert.deepStrictEqual(state.registrations[1], { id: state.registrations[1].id, path: '/b.jar', enabled: true });
      await setPluginEnabled({ registrationId: '/a.jar', pluginPath: '/a.jar', configurationTarget: target === 'global' ? 'workspace' : 'global' }, false, deps);
      assert.strictEqual(state.registrations[0].enabled, true);
      const write = deps.writeConfiguration;
      deps.writeConfiguration = async () => { throw new Error('write failed'); };
      await assert.rejects(setPluginEnabled({ registrationId: '/a.jar', pluginPath: '/a.jar', configurationTarget: target }, false, deps), /write failed/);
      deps.writeConfiguration = write;
      await setPluginEnabled({ registrationId: '/a.jar', pluginPath: '/a.jar', configurationTarget: target }, false, deps);
      assert.strictEqual(state.registrations[0].enabled, false);
    }
  });

  it('updates only the selected row when manually configured paths are identical', async () => {
    const { setPluginEnabled } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const state: PluginConfigurationState = { target: 'workspace', workspaceRoots: [], registrations: [
      { id: 'first', path: '/same.jar', enabled: true },
      { id: 'second', path: '/same.jar', enabled: false },
    ] };
    const deps: PluginConfigurationDeps = {
      readConfiguration: () => state, selectPluginJars: async () => [], validatePluginJars: async () => undefined,
      writeConfiguration: async (registrations) => { state.registrations = registrations; },
    };
    await setPluginEnabled({ registrationId: 'second', pluginPath: '/same.jar', configurationTarget: 'workspace' }, true, deps);
    assert.strictEqual(state.registrations[0].enabled, true);
    assert.deepStrictEqual(state.registrations[1], { id: 'second', path: '/same.jar', enabled: true });
    await setPluginEnabled({ registrationId: 'first', pluginPath: '/same.jar', configurationTarget: 'workspace' }, false, deps);
    assert.strictEqual(state.registrations[1].enabled, true);
  });

  it('preserves consecutive removals when earlier writes shift row indexes', async () => {
    const { removePluginJar } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const state: PluginConfigurationState = { target: 'workspace', workspaceRoots: [], registrations:
      ['/a.jar', '/b.jar'].map((path) => ({ id: path, path, enabled: true })) };
    const deps: PluginConfigurationDeps = {
      readConfiguration: () => state, selectPluginJars: async () => [], validatePluginJars: async () => undefined,
      writeConfiguration: async (registrations) => { state.registrations = registrations; },
    };
    await Promise.all(['/a.jar', '/b.jar'].map((pluginPath) =>
      removePluginJar({ registrationId: pluginPath, pluginPath, configurationTarget: 'workspace' }, deps)));
    assert.deepStrictEqual(state.registrations, []);
  });

  it('keeps duplicate-path registration ownership after queued deletion shifts the rows', async () => {
    const { removePluginJar, setPluginEnabled } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    for (const operation of ['delete', 'enable'] as const) {
      const active = { id: 'active', path: '/same.jar', enabled: true };
      const state: PluginConfigurationState = { target: 'workspace', workspaceRoots: [], registrations: [
        { id: 'other', path: '/other.jar', enabled: true },
        { id: 'disabled', path: '/same.jar', enabled: false }, active,
      ] };
      const deps: PluginConfigurationDeps = {
        readConfiguration: () => state, selectPluginJars: async () => [], validatePluginJars: async () => undefined,
        writeConfiguration: async (registrations) => { await Promise.resolve(); state.registrations = registrations; },
      };
      const target = { registrationId: 'disabled', configurationTarget: 'workspace' as const };
      await Promise.all([
        removePluginJar({ registrationId: 'other', configurationTarget: 'workspace' }, deps),
        operation === 'delete' ? removePluginJar(target, deps) : setPluginEnabled(target, true, deps),
      ]);
      assert.deepStrictEqual(state.registrations.find((entry) => entry.id === 'active'), active);
      assert.deepStrictEqual(state.registrations.map((entry) => entry.id), operation === 'delete' ? ['active'] : ['disabled', 'active']);
      if (operation === 'enable') assert.strictEqual(state.registrations[0].enabled, true);
    }
  });

  it('uses the same ID across reorder and path edits, and rejects removed IDs and wrong scopes', async () => {
    const { removePluginJar, setPluginEnabled } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const state: PluginConfigurationState = { target: 'workspace', workspaceRoots: [], registrations: [
      { id: 'original', path: '/old.jar', enabled: true },
      { id: 'other', path: '/other.jar', enabled: true },
    ] };
    const deps: PluginConfigurationDeps = {
      readConfiguration: () => state, selectPluginJars: async () => [], validatePluginJars: async () => undefined,
      writeConfiguration: async (registrations) => { state.registrations = registrations; },
    };
    const selected = { registrationId: 'original', pluginPath: '/old.jar', configurationTarget: 'workspace' as const };
    state.registrations[0].path = '/renamed.jar';
    state.registrations.reverse();
    await setPluginEnabled(selected, false, deps);
    assert.deepStrictEqual(state.registrations[1], { id: 'original', path: '/renamed.jar', enabled: false });
    assert.strictEqual(await setPluginEnabled({ ...selected, configurationTarget: 'global' }, true, deps), false);
    await removePluginJar(selected, deps);
    state.registrations.push({ id: 'replacement', path: '/old.jar', enabled: true });
    assert.strictEqual(await setPluginEnabled(selected, false, deps), false);
    assert.strictEqual(await removePluginJar(selected, deps), false);
    assert.strictEqual(state.registrations[1].enabled, true);
  });

  it('validates and adds selected plugin jars', async () => {
    const vscode = resetVscodeMock();
    const { addPluginJars } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const writes: Array<{ paths: string[]; target: string }> = [];
    const selected = (filePath: string) =>
      vscode.Uri.file(filePath) as unknown as Uri;

    await addPluginJars(
      pluginConfigurationDeps(
        {
          target: 'workspace',
          paths: [],
          workspaceRoots: ['/workspace'],
        },
        [selected('/workspace/plugins/new.jar')],
        writes
      )
    );

    assert.deepStrictEqual(writes, [
      {
        paths: ['plugins/new.jar'],
        target: 'workspace',
      },
    ]);
  });

  it('toggles and removes only the selected registration across path aliases', async () => {
    const { removePluginJar, setPluginEnabled } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const writes: Array<{ paths: string[]; target: string }> = [];
    const state: PathSettingState = {
      target: 'workspace',
      paths: ['plugins/a.jar', '/workspace/plugins/a.jar'],
      workspaceRoots: ['/workspace', '/workspace-b'],
    };
    const deps = pluginConfigurationDeps(state, [], writes);

    let registrations: PluginRegistration[] = state.paths.map((path) => ({ id: path, path, enabled: true }));
    deps.readConfiguration = () => ({ ...state, registrations });
    deps.writeConfiguration = async (next, target) => { registrations = next; writes.push({ paths: next.map((entry) => entry.path), target }); };
    await setPluginEnabled({ registrationId: 'plugins/a.jar', pluginPath: 'plugins/a.jar', configurationTarget: 'workspace' }, false, deps);
    assert.deepStrictEqual(registrations.map((entry) => entry.enabled), [false, true]);
    assert.strictEqual(await setPluginEnabled({ registrationId: 'plugins/a.jar', pluginPath: 'plugins/a.jar', configurationTarget: 'workspace' }, false, deps), false);
    await removePluginJar({ registrationId: 'plugins/a.jar', pluginPath: 'plugins/a.jar', configurationTarget: 'workspace' }, deps);
    assert.deepStrictEqual(registrations.map((entry) => entry.path), ['/workspace/plugins/a.jar']);
    assert.strictEqual(await removePluginJar({ registrationId: '/workspace/plugins/missing.jar', pluginPath: '/workspace/plugins/missing.jar', configurationTarget: 'workspace' }, deps), false);
  });
});

function pluginConfigurationDeps(
  state: PathSettingState,
  selected: readonly Uri[],
  writes: Array<{ paths: string[]; target: string }>
): PluginConfigurationDeps {
  return {
    selectPluginJars: async () => selected,
    readConfiguration: () => ({ ...state, registrations: state.paths.map((path) => ({ id: path, path, enabled: true })) }),
    writeConfiguration: async (paths, target) => {
      writes.push({ paths: paths.map((entry) => entry.path), target });
    },
    validatePluginJars: async () => undefined,
  };
}

describe('pluginInventoryTreeDataProvider', () => {
  beforeEach(() => {
    resetVscodeMock();
    delete require.cache[require.resolve('../ui/pluginInventoryTreeDataProvider')];
  });

  it('renders initial and configured plugin rows', async () => {
    const providerModule = require(
      '../ui/pluginInventoryTreeDataProvider'
    ) as typeof import('../ui/pluginInventoryTreeDataProvider');
    const provider = new providerModule.PluginInventoryTreeDataProvider();

    assert.strictEqual(
      (await provider.getChildren())[0].label,
      'Refresh to inspect configured SpotBugs plugin jars.'
    );

    provider.showInventory({ items: [], errors: [] });
    const empty = (await provider.getChildren())[0];
    assert.strictEqual(empty.label, 'No SpotBugs plugin jars configured.');
    assert.strictEqual(empty.iconPath, undefined);

    provider.showInventory({
      items: [
        {
          index: 0,
          path: '/workspace/plugin-a.jar',
          registrationId: 'plugin-a',
          canonicalPath: '/workspace/plugin-a.jar',
          status: 'validated',
          pluginId: 'com.example.a',
          shortDescription: 'Example security checks',
          provider: 'Example Inc.',
          website: 'https://example.com/plugin-a',
          version: '1.2.3',
          detectorCount: 2,
          bugPatternCount: 3,
          bugPatternTypes: ['EXAMPLE_ONE', 'EXAMPLE_TWO', 'EXAMPLE_THREE'],
        },
        {
          index: 1,
          path: '/workspace/plugin-b.jar',
          status: 'duplicate-plugin-id',
          pluginId: 'com.example.a',
          errorMessage: 'Duplicate plugin id',
        },
      ],
    });

    const children = await provider.getChildren();

    assert.deepStrictEqual(
      children.map((child) => [child.label, child.description, child.contextValue]),
      [
        [
          'plugin-a.jar',
          'Validated: com.example.a · 2 detectors · 3 rules',
          'spotbugs.plugin.validated',
        ],
        [
          'plugin-b.jar',
          'Duplicate plugin id: com.example.a',
          'spotbugs.plugin.duplicate-plugin-id',
        ],
      ]
    );
    assert.strictEqual(
      children[0].tooltip,
      [
        'Example security checks',
        'Provider: Example Inc.',
        'Version: 1.2.3',
        'https://example.com/plugin-a',
        'Declared: 2 detectors · 3 rules',
        '/workspace/plugin-a.jar',
      ].join('\n')
    );
    const pluginItem = children[0] as { pluginPath?: string; registrationId?: string };
    assert.strictEqual(pluginItem.registrationId, 'plugin-a');
    assert.strictEqual(pluginItem.pluginPath, '/workspace/plugin-a.jar');
    assert.strictEqual(children[0].collapsibleState, 1);
    assert.deepStrictEqual(
      (await provider.getChildren(children[0])).map((child) => child.label),
      ['EXAMPLE_ONE', 'EXAMPLE_TWO', 'EXAMPLE_THREE']
    );
    assert.strictEqual(children[1].collapsibleState, 0);
  });
});

describe('pluginInventoryParser', () => {
  it('maps backend statuses and optional metadata into UI items', () => {
    const result = parsePluginInventoryResponse(
      JSON.stringify({
        results: [
          {
            index: 0,
            path: 'a.jar',
            status: 'VALIDATED',
            pluginId: 'a',
            shortDescription: 'Example plugin',
            provider: 'Example provider',
            website: 'https://example.com',
            version: '1.2.3',
            detectorCount: 2,
            bugPatternCount: 3,
            bugPatternTypes: [' EXAMPLE_ONE ', 'EXAMPLE_TWO'],
          },
          {
            index: 1,
            path: 'b.jar',
            status: 'DUPLICATE_PLUGIN_ID',
            pluginId: 'a',
            errorMessage: 'Duplicate plugin id',
            provider: 42,
            detectorCount: -1,
            bugPatternTypes: ['VALID', 42],
          },
          {
            index: 2,
            path: 'bad.jar',
            status: 'VALIDATION_FAILED',
            errorMessage: 'bad',
            shortDescription: '   ',
            bugPatternCount: 0,
            bugPatternTypes: [],
          },
        ],
      })
    );

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.value.items.map((item) => item.status), [
      'validated',
      'duplicate-plugin-id',
      'validation-failed',
    ]);
    assert.strictEqual(result.value.items[0].pluginId, 'a');
    assert.deepStrictEqual(result.value.items[0], {
      index: 0,
      path: 'a.jar',
      canonicalPath: undefined,
      status: 'validated',
      pluginId: 'a',
      shortDescription: 'Example plugin',
      provider: 'Example provider',
      website: 'https://example.com',
      version: '1.2.3',
      detectorCount: 2,
      detectors: undefined,
      bugPatternCount: 3,
      bugPatternTypes: ['EXAMPLE_ONE', 'EXAMPLE_TWO'],
      errorMessage: undefined,
    });
    assert.strictEqual(result.value.items[1].provider, undefined);
    assert.strictEqual(result.value.items[1].detectorCount, undefined);
    assert.strictEqual(result.value.items[1].bugPatternTypes, undefined);
    assert.strictEqual(result.value.items[2].shortDescription, undefined);
    assert.strictEqual(result.value.items[2].bugPatternCount, 0);
    assert.deepStrictEqual(result.value.items[2].bugPatternTypes, []);
    assert.strictEqual(result.value.items[2].errorMessage, 'bad');
  });

  it('keeps command errors for the service to present against configured paths', () => {
    const result = parsePluginInventoryResponse(
      JSON.stringify({ errors: [{ code: 'COMMAND_FAILED', message: 'boom' }] })
    );

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.value.errors, [
      { code: 'COMMAND_FAILED', message: 'boom' },
    ]);
  });

  it('rejects malformed responses', () => {
    for (const raw of [
      '{',
      JSON.stringify({ errors: [{}] }),
      JSON.stringify({ results: [null], errors: [] }),
      JSON.stringify({ results: [{ path: 'plugin.jar', status: 'VALIDATED' }] }),
    ]) {
      const result = parsePluginInventoryResponse(raw);

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.message, 'Invalid plugin inventory response payload.');
    }
  });
});

describe('pluginInventoryService', () => {
  it('shows configuration errors without fabricating Core or backend failure rows', async () => {
    const configModule = require('../core/config') as typeof import('../core/config');
    const providerModule = require('../ui/pluginInventoryTreeDataProvider') as typeof import('../ui/pluginInventoryTreeDataProvider');
    const message = 'Each SpotBugs plugin registration requires a nonempty id, path, and enabled boolean.';
    resetVscodeMock({ workspace: {
      getConfiguration: () => ({
        get: () => undefined,
        inspect: (key: string) => key === 'plugins.registrations'
          ? { workspaceValue: [{ id: '', path: '/workspace/a.jar', enabled: true }] }
          : undefined,
      }),
    } } as never);
    try {
      let backendCalls = 0;
      const result = await getPluginInventory(new configModule.Config({} as never), undefined, {
        runPluginInventory: async () => { backendCalls++; return undefined; },
      });
      assert.strictEqual(backendCalls, 0);
      assert.deepStrictEqual(result, {
        items: [],
        errors: [{ code: 'CFG_PLUGINS_INVALID', message }],
      });

      const view = new providerModule.PluginInventoryTreeDataProvider();
      view.showInventory(result);
      const rows = await view.getChildren();
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].label, `[CFG_PLUGINS_INVALID] ${message}`);
      assert.strictEqual(rows[0].tooltip, rows[0].label);
      assert.strictEqual(rows[0].contextValue, 'spotbugs.plugin.message');
      assert.strictEqual((rows[0].iconPath as { id: string }).id, 'error');
    } finally {
      resetVscodeMock();
    }
  });

  it('keeps disabled plugins visible while inspecting core without loading their paths', async () => {
    let backendCalled = false;

    const result = await getPluginInventory(makeConfig({ effort: 'default', plugins: ['/missing.jar'] }, ['/missing.jar']), undefined, {
      runPluginInventory: async () => {
        backendCalled = true;
        return inventoryResponse([]);
      },
    });

    assert.strictEqual(backendCalled, true);
    assert.strictEqual(result.items[1].enabled, false);
    const providerModule = require('../ui/pluginInventoryTreeDataProvider') as typeof import('../ui/pluginInventoryTreeDataProvider');
    const view = new providerModule.PluginInventoryTreeDataProvider();
    view.showInventory(result);
    assert.strictEqual((await view.getChildren())[1].contextValue, 'spotbugs.plugin.disabled');
  });

  it('inspects only active paths and maps rows back across disabled entries', async () => {
    const requests: unknown[] = [];

    const result = await getPluginInventory(
      makeConfig({
        effort: 'default',
        plugins: ['/missing.jar', '/workspace/plugin-a.jar', '/workspace/plugin-b.jar'],
      }, ['/missing.jar']),
      undefined,
      {
        runPluginInventory: async (request) => {
          requests.push(request);
          return inventoryResponse([
            {
              index: 0,
              path: '/workspace/plugin-a.jar',
              status: 'VALIDATED',
              pluginId: 'com.example.a',
            },
          ]);
        },
      }
    );

    assert.deepStrictEqual(requests, [
      {
        plugins: ['/workspace/plugin-a.jar', '/workspace/plugin-b.jar'],
      },
    ]);
    assert.strictEqual(result.items.length, 4);
    assert.deepStrictEqual(result.items.slice(1).map((item) => item.registrationId),
      ['/missing.jar', '/workspace/plugin-a.jar', '/workspace/plugin-b.jar']);
    assert.strictEqual(result.items[2].status, 'validated');
    assert.strictEqual(result.items[2].path, '/workspace/plugin-a.jar');
    assert.strictEqual(result.items[3].status, 'backend-error');
    assert.strictEqual(result.items[3].path, '/workspace/plugin-b.jar');
  });

  it('returns backend-error rows for each configured path when the command fails', async () => {
    const result = await getPluginInventory(
      makeConfig({
        effort: 'default',
        plugins: ['/workspace/plugin-a.jar', '/workspace/plugin-b.jar'],
      }),
      undefined,
      {
        runPluginInventory: async () => {
          throw new Error('Java LS unavailable');
        },
      }
    );

    assert.deepStrictEqual(
      result.items.map((item) => [item.path, item.status, item.errorMessage]),
      [
        ['', 'backend-error', 'Java LS unavailable'],
        ['/workspace/plugin-a.jar', 'backend-error', 'Java LS unavailable'],
        ['/workspace/plugin-b.jar', 'backend-error', 'Java LS unavailable'],
      ]
    );
  });

  it('rejects invalid or duplicate backend indexes without reassigning plugins', async () => {
    for (const results of [
      [{ index: -2, path: '/workspace/plugin-a.jar', status: 'VALIDATED' }],
      [
        { index: 0, path: '/workspace/plugin-a.jar', status: 'VALIDATED' },
        { index: 0, path: '/workspace/plugin-b.jar', status: 'VALIDATED' },
      ],
    ]) {
      const result = await getPluginInventory(
        makeConfig({
          effort: 'default',
          plugins: ['/workspace/plugin-a.jar', '/workspace/plugin-b.jar'],
        }),
        undefined,
        { runPluginInventory: async () => inventoryResponse(results) }
      );

      assert.deepStrictEqual(
        result.items.map((item) => [item.path, item.status]),
        [
          ['', 'backend-error'],
          ['/workspace/plugin-a.jar', 'backend-error'],
          ['/workspace/plugin-b.jar', 'backend-error'],
        ]
      );
    }
  });
});
