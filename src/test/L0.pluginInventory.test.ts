import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { AnalysisSettings } from '../core/config';
import type { PluginInventoryResult } from '../services/pluginInventoryService';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const { getPluginInventory, parsePluginInventoryResponse } = require(
  '../services/pluginInventoryService'
) as typeof import('../services/pluginInventoryService');

function makeConfig(settings: AnalysisSettings) {
  return {
    getAnalysisSettings: (_resource?: Uri) => settings,
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
        showLoading: () => undefined,
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

    assert.deepStrictEqual(published, []);
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
        getAnalysisSettings: (resource?: Uri) => {
          observedResource = resource;
          return { effort: 'default', plugins: ['/workspace/plugin-a.jar'] };
        },
      },
      { showLoading: () => undefined, showInventory: () => undefined },
      undefined,
      { runPluginInventory: async () => inventoryResponse([]) }
    );

    assert.strictEqual(observedResource, undefined);
  });
});

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
          status: 'loadable',
          pluginId: 'com.example.a',
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
        ['plugin-a.jar', 'Validated: com.example.a', 'spotbugs.plugin.loadable'],
        [
          'plugin-b.jar',
          'Duplicate plugin id: com.example.a',
          'spotbugs.plugin.duplicate-plugin-id',
        ],
      ]
    );
  });
});

describe('pluginInventoryParser', () => {
  it('maps minimal backend statuses into UI statuses', () => {
    const result = parsePluginInventoryResponse(
      JSON.stringify({
        results: [
          { index: 0, path: 'a.jar', status: 'LOADABLE', pluginId: 'a' },
          {
            index: 1,
            path: 'b.jar',
            status: 'DUPLICATE_PLUGIN_ID',
            pluginId: 'a',
            errorMessage: 'Duplicate plugin id',
          },
          { index: 2, path: 'bad.jar', status: 'LOAD_FAILED', errorMessage: 'bad' },
        ],
      })
    );

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.value.items.map((item) => item.status), [
      'loadable',
      'duplicate-plugin-id',
      'load-failed',
    ]);
    assert.strictEqual(result.value.items[0].pluginId, 'a');
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
    for (const raw of ['{', JSON.stringify({ errors: [{}] })]) {
      const result = parsePluginInventoryResponse(raw);

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.message, 'Invalid plugin inventory response payload.');
    }
  });
});

describe('pluginInventoryService', () => {
  it('does not call the backend when no plugin paths are configured', async () => {
    let backendCalled = false;

    const result = await getPluginInventory(makeConfig({ effort: 'default' }), undefined, {
      runPluginInventory: async () => {
        backendCalled = true;
        return '{}';
      },
    });

    assert.strictEqual(backendCalled, false);
    assert.deepStrictEqual(result.items, []);
  });

  it('sends configured plugin paths to the backend and returns parsed rows', async () => {
    const requests: unknown[] = [];

    const result = await getPluginInventory(
      makeConfig({
        effort: 'default',
        plugins: ['/workspace/plugin-a.jar', '/workspace/plugin-b.jar'],
      }),
      undefined,
      {
        runPluginInventory: async (request) => {
          requests.push(request);
          return inventoryResponse([
            {
              index: 0,
              path: '/workspace/plugin-a.jar',
              status: 'LOADABLE',
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
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].status, 'loadable');
    assert.strictEqual(result.items[0].path, '/workspace/plugin-a.jar');
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
});
