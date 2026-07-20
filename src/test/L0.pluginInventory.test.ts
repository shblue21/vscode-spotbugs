import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { AnalysisSettings } from '../core/config';
import type {
  PluginConfigurationDeps,
  PluginPathConfiguration,
} from '../commands/pluginInventory';
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

  it('adds picker selections with single-root relative and multi-root absolute paths', async () => {
    const vscode = resetVscodeMock();
    const { addPluginJars } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const writes: Array<{ paths: string[]; target: string }> = [];
    const selected = (filePath: string) =>
      vscode.Uri.file(filePath) as unknown as Uri;

    await addPluginJars(
      pluginConfigurationDeps(
        {
          target: 'workspace',
          paths: ['plugins/existing.jar'],
          workspaceRoots: ['/workspace'],
        },
        [
          selected('/workspace/plugins/existing.jar'),
          selected('/workspace/plugins/new.jar'),
        ],
        writes
      )
    );
    await addPluginJars(
      pluginConfigurationDeps(
        {
          target: 'workspace',
          paths: [],
          workspaceRoots: ['/workspace-a', '/workspace-b'],
        },
        [selected('/workspace-a/plugins/multi-root.jar')],
        writes
      )
    );

    assert.deepStrictEqual(writes, [
      {
        paths: ['plugins/existing.jar', 'plugins/new.jar'],
        target: 'workspace',
      },
      {
        paths: ['/workspace-a/plugins/multi-root.jar'],
        target: 'workspace',
      },
    ]);
  });

  it('removes only the matching configured path and ignores stale rows', async () => {
    const { removePluginJar } = require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    const writes: Array<{ paths: string[]; target: string }> = [];
    const state: PluginPathConfiguration = {
      target: 'workspace',
      paths: ['plugins/a.jar', '/outside/b.jar'],
      workspaceRoots: ['/workspace'],
    };
    const deps = pluginConfigurationDeps(state, [], writes);

    await removePluginJar({ pluginPath: '/workspace/plugins/a.jar' }, deps);
    await removePluginJar({ pluginPath: '/workspace/plugins/missing.jar' }, deps);

    assert.deepStrictEqual(writes, [
      { paths: ['/outside/b.jar'], target: 'workspace' },
    ]);
  });
});

function pluginConfigurationDeps(
  state: PluginPathConfiguration,
  selected: readonly Uri[],
  writes: Array<{ paths: string[]; target: string }>
): PluginConfigurationDeps {
  return {
    selectPluginJars: async () => selected,
    readConfiguration: () => state,
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
          },
          {
            index: 1,
            path: 'b.jar',
            status: 'DUPLICATE_PLUGIN_ID',
            pluginId: 'a',
            errorMessage: 'Duplicate plugin id',
            provider: 42,
            detectorCount: -1,
          },
          {
            index: 2,
            path: 'bad.jar',
            status: 'VALIDATION_FAILED',
            errorMessage: 'bad',
            shortDescription: '   ',
            bugPatternCount: 0,
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
      errorMessage: undefined,
    });
    assert.strictEqual(result.value.items[1].provider, undefined);
    assert.strictEqual(result.value.items[1].detectorCount, undefined);
    assert.strictEqual(result.value.items[2].shortDescription, undefined);
    assert.strictEqual(result.value.items[2].bugPatternCount, 0);
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
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.items[0].status, 'validated');
    assert.strictEqual(result.items[0].path, '/workspace/plugin-a.jar');
    assert.strictEqual(result.items[1].status, 'backend-error');
    assert.strictEqual(result.items[1].path, '/workspace/plugin-b.jar');
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
