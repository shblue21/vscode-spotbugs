import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import type { PluginRegistration } from '../services/pluginConfiguration';

installVscodeMock();
const inventoryService =
  require('../services/pluginInventoryService') as typeof import('../services/pluginInventoryService');
const originalInventory = inventoryService.getPluginInventory;

describe('detector configuration picker', () => {
  afterEach(() => {
    inventoryService.getPluginInventory = originalInventory;
    resetVscodeMock();
  });

  it('removes a core override from the selected workspace object without inheriting the user override', async () => {
    const { configureDetectors } =
      require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    let workspaceValue: unknown = { ['example.Check']: false };
    const writes: unknown[] = [];
    let step = 0;
    resetVscodeMock({
      workspace: {
        getConfiguration: () => ({
          inspect: (key: string) =>
            key === 'analysis.detectors'
              ? { workspaceValue, globalValue: { ['example.Check']: true } }
              : undefined,
          update: async (key: string, value: unknown, global: boolean) => {
            writes.push([key, value, global]);
            workspaceValue = value;
          },
        }),
      },
      window: {
        showQuickPick: async (items: Array<{ label: string }>) => {
          if (step++ === 0) {
            assert.strictEqual(items[0].label, 'example.Check');
            return items[0];
          }
          return items.find((item) => item.label === 'Default');
        },
      },
    } as never);
    inventoryService.getPluginInventory = async () => ({
      items: [
        {
          index: -1,
          path: '',
          detectors: [
            { className: 'example.Check', defaultEnabled: true, reports: ['EXAMPLE_RULE'] },
          ],
        },
      ],
    });
    assert.strictEqual(await configureDetectors({ getConfiguredPlugins: () => [] }), true);
    assert.deepStrictEqual(writes, [['analysis.detectors', {}, false]]);
  });

  it('keeps unresolved overrides editable on a disabled plugin and preserves other child settings', async () => {
    const { configureDetectors } =
      require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    let registrations: PluginRegistration[] = [
      {
        id: 'missing',
        path: '/missing.jar',
        enabled: false,
        detectors: { ['missing.Detector']: false, ['another.Detector']: true },
      },
    ];
    let step = 0;
    resetVscodeMock({
      workspace: {
        getConfiguration: () => ({
          inspect: (key: string) =>
            key === 'plugins.registrations' ? { workspaceValue: registrations } : undefined,
          update: async (key: string, value: PluginRegistration[], global: boolean) => {
            assert.strictEqual(key, 'plugins.registrations');
            assert.strictEqual(global, false);
            registrations = value;
          },
        }),
      },
      window: {
        showQuickPick: async (items: Array<{ label: string; detail?: string }>) => {
          if (step++ === 0) {
            const item = items.find((entry) => entry.label === 'missing.Detector');
            assert.strictEqual(item?.detail, 'Unresolved configured detector');
            return item;
          }
          return items.find((item) => item.label === 'Default');
        },
      },
    } as never);
    inventoryService.getPluginInventory = async () => ({
      items: [{ index: 0, registrationId: 'missing', path: '/missing.jar', enabled: false }],
    });
    await configureDetectors(
      { getConfiguredPlugins: () => [] },
      {
        pluginPath: '/missing.jar',
        registrationId: 'missing',
        configurationTarget: 'workspace',
      },
    );
    assert.deepStrictEqual(registrations, [
      {
        id: 'missing',
        path: '/missing.jar',
        enabled: false,
        detectors: { ['another.Detector']: true },
      },
    ]);
  });
  it('opens core and healthy plugin pickers despite a failed sibling inventory entry', async () => {
    const { configureDetectors } =
      require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    for (const core of [true, false]) {
      let registrations: PluginRegistration[] = [
        { id: 'missing', path: '/missing.jar', enabled: true, detectors: {} },
        { id: 'healthy', path: '/healthy.jar', enabled: true, detectors: {} },
      ];
      let coreOverrides = {};
      let step = 0;
      resetVscodeMock({
        workspace: {
          getConfiguration: () => ({
            inspect: (key: string) =>
              key === 'plugins.registrations'
                ? { workspaceValue: registrations }
                : key === 'analysis.detectors'
                  ? { workspaceValue: coreOverrides }
                  : undefined,
            update: async (key: string, value: unknown) => {
              if (key === 'plugins.registrations') registrations = value as PluginRegistration[];
              else if (key === 'analysis.detectors')
                coreOverrides = value as Record<string, boolean>;
            },
          }),
        },
        window: {
          showQuickPick: async (items: Array<{ label: string }>) => {
            if (step++ === 0) {
              assert.strictEqual(items[0].label, core ? 'core.Check' : 'healthy.Check');
              return items[0];
            }
            return items.find((item) => item.label === 'Disabled');
          },
        },
      } as never);
      inventoryService.getPluginInventory = (config) =>
        originalInventory(config, undefined, {
          runPluginInventory: async () =>
            JSON.stringify({
              results: [
                {
                  index: -1,
                  path: '',
                  status: 'VALIDATED',
                  detectors: [{ className: 'core.Check', defaultEnabled: true, reports: [] }],
                },
                {
                  index: 0,
                  path: '/missing.jar',
                  status: 'VALIDATION_FAILED',
                  errorMessage: 'Missing JAR',
                },
                {
                  index: 1,
                  path: '/healthy.jar',
                  status: 'VALIDATED',
                  detectors: [{ className: 'healthy.Check', defaultEnabled: true, reports: [] }],
                },
              ],
            }),
        });
      const config = {
        getConfiguredPlugins: () =>
          registrations.map((entry) => ({
            ...entry,
            resolvedPath: entry.path,
            target: 'workspace' as const,
          })),
      };
      const changed = await configureDetectors(
        config,
        core
          ? undefined
          : {
              registrationId: 'healthy',
              pluginPath: '/healthy.jar',
              configurationTarget: 'workspace',
            },
      );
      assert.strictEqual(changed, true);
      assert.deepStrictEqual(core ? coreOverrides : registrations[1].detectors, {
        [core ? 'core.Check' : 'healthy.Check']: false,
      });
    }
  });

  it('does not save an open picker into a replacement registration at the same path', async () => {
    const { configureDetectors } =
      require('../commands/pluginInventory') as typeof import('../commands/pluginInventory');
    let registrations: PluginRegistration[] = [
      { id: 'original', path: '/same.jar', enabled: true, detectors: {} },
    ];
    let step = 0;
    let writes = 0;
    resetVscodeMock({
      workspace: {
        getConfiguration: () => ({
          inspect: (key: string) =>
            key === 'plugins.registrations' ? { workspaceValue: registrations } : undefined,
          update: async () => {
            writes++;
          },
        }),
      },
      window: {
        showQuickPick: async (items: Array<{ label: string }>) => {
          if (step++ === 0) return items[0];
          registrations = [{ id: 'replacement', path: '/same.jar', enabled: true, detectors: {} }];
          return items.find((item) => item.label === 'Disabled');
        },
      },
    } as never);
    inventoryService.getPluginInventory = async () => ({
      items: [
        {
          index: 0,
          registrationId: 'original',
          path: '/same.jar',
          detectors: [{ className: 'example.Check', defaultEnabled: true, reports: [] }],
        },
      ],
    });
    const changed = await configureDetectors(
      { getConfiguredPlugins: () => [] },
      {
        registrationId: 'original',
        pluginPath: '/same.jar',
        configurationTarget: 'workspace',
      },
    );
    assert.strictEqual(changed, false);
    assert.strictEqual(writes, 0);
    assert.deepStrictEqual(registrations[0].detectors, {});
  });
});
