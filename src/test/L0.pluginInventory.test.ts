import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { AnalysisSettings } from '../core/config';
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

function makeConfig(settings: AnalysisSettings, disabled: string[] = []) {
  return {
    getConfiguredPlugins: (_resource?: Uri) => (settings.plugins ?? []).map((pluginPath) => ({
      path: pluginPath, resolvedPath: pluginPath, enabled: !disabled.includes(pluginPath), target: 'workspace' as const,
    })),
  };
}

function inventoryResponse(results: object[]): string {
  return JSON.stringify({ results, errors: [] });
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

  it('serializes toggles at the registration scope and clears state on removal and re-add', async () => {
    const { setPluginEnabled, removePluginJar, addPluginJars } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const vscode = installVscodeMock();
    for (const target of ['global', 'workspace'] as const) {
      const state = { target, paths: ['/a.jar', '/b.jar'], disabledPaths: [] as string[], workspaceRoots: [] };
      const deps: PluginConfigurationDeps = {
        readConfiguration: () => ({ ...state, disabledPaths: [...state.disabledPaths] }),
        selectPluginJars: async () => [vscode.Uri.file('/b.jar') as unknown as Uri],
        validatePluginJars: async () => undefined,
        writeConfiguration: async (paths, scope) => { assert.strictEqual(scope, target); state.paths = paths; },
        writeDisabledPaths: async (paths, scope) => { assert.strictEqual(scope, target); await Promise.resolve(); state.disabledPaths = paths; },
      };
      await Promise.all(['/a.jar', '/b.jar'].map((pluginPath) => setPluginEnabled({ pluginPath }, false, deps)));
      assert.deepStrictEqual(state.disabledPaths, ['/a.jar', '/b.jar']);
      await setPluginEnabled({ pluginPath: '/a.jar' }, true, deps);
      await removePluginJar({ pluginPath: '/b.jar' }, deps);
      assert.deepStrictEqual(state.disabledPaths, []);
      state.disabledPaths = ['/b.jar']; // A stale entry left by a manual settings edit.
      await addPluginJars(deps);
      assert.deepStrictEqual(state.paths, ['/a.jar', '/b.jar']);
      assert.deepStrictEqual(state.disabledPaths, []);
      await setPluginEnabled({ pluginPath: '/a.jar', configurationTarget: target === 'global' ? 'workspace' : 'global' }, false, deps);
      assert.deepStrictEqual(state.disabledPaths, []);
      const write = deps.writeDisabledPaths;
      deps.writeDisabledPaths = async () => { throw new Error('write failed'); };
      await assert.rejects(setPluginEnabled({ pluginPath: '/a.jar' }, false, deps), /write failed/);
      deps.writeDisabledPaths = write;
      await setPluginEnabled({ pluginPath: '/a.jar' }, false, deps);
      assert.deepStrictEqual(state.disabledPaths, ['/a.jar']);
    }
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

    let disabledPaths: string[] = [];
    deps.readConfiguration = () => ({ ...state, disabledPaths });
    let disabledWrites = 0;
    deps.writeDisabledPaths = async (paths) => { disabledPaths = paths; disabledWrites++; };
    await setPluginEnabled({ pluginPath: 'plugins/a.jar' }, false, deps);
    assert.deepStrictEqual(disabledPaths, ['plugins/a.jar']);
    assert.strictEqual(await setPluginEnabled({ pluginPath: 'plugins/a.jar' }, false, deps), false);
    assert.strictEqual(disabledWrites, 1);
    await removePluginJar({ pluginPath: 'plugins/a.jar' }, deps);
    assert.deepStrictEqual(disabledPaths, []);
    await removePluginJar({ pluginPath: '/workspace/plugins/missing.jar' }, deps);

    assert.deepStrictEqual(writes, [
      { paths: ['/workspace/plugins/a.jar'], target: 'workspace' },
    ]);
  });
});

function pluginConfigurationDeps(
  state: PathSettingState,
  selected: readonly Uri[],
  writes: Array<{ paths: string[]; target: string }>
): PluginConfigurationDeps {
  return {
    selectPluginJars: async () => selected,
    readConfiguration: () => ({ ...state, disabledPaths: [] }),
    writeDisabledPaths: async () => undefined,
    writeConfiguration: async (paths, target) => {
      writes.push({ paths, target });
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

    provider.showInventory({
      items: [
        {
          index: 0,
          path: '/workspace/plugin-a.jar',
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
        'Runtime loading was not checked.',
      ].join('\n')
    );
    const pluginItem = children[0] as { pluginPath?: string };
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
  it('keeps disabled plugins visible without calling the backend', async () => {
    let backendCalled = false;

    const result = await getPluginInventory(makeConfig({ effort: 'default', plugins: ['/missing.jar'] }, ['/missing.jar']), undefined, {
      runPluginInventory: async () => {
        backendCalled = true;
        return '{}';
      },
    });

    assert.strictEqual(backendCalled, false);
    assert.strictEqual(result.items[0].enabled, false);
    const providerModule = require('../ui/pluginInventoryTreeDataProvider') as typeof import('../ui/pluginInventoryTreeDataProvider');
    const view = new providerModule.PluginInventoryTreeDataProvider();
    view.showInventory(result);
    assert.strictEqual((await view.getChildren())[0].contextValue, 'spotbugs.plugin.disabled');
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
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[1].status, 'validated');
    assert.strictEqual(result.items[1].path, '/workspace/plugin-a.jar');
    assert.strictEqual(result.items[2].status, 'backend-error');
    assert.strictEqual(result.items[2].path, '/workspace/plugin-b.jar');
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
        ['/workspace/plugin-a.jar', 'backend-error', 'Java LS unavailable'],
        ['/workspace/plugin-b.jar', 'backend-error', 'Java LS unavailable'],
      ]
    );
  });

  it('rejects invalid or duplicate backend indexes without reassigning plugins', async () => {
    for (const results of [
      [{ index: -1, path: '/workspace/plugin-a.jar', status: 'VALIDATED' }],
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
          ['/workspace/plugin-a.jar', 'backend-error'],
          ['/workspace/plugin-b.jar', 'backend-error'],
        ]
      );
    }
  });
});
