import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type PackageJson = {
  contributes: {
    views: Record<string, Array<{ id: string; name: string; type?: string }>>;
    configuration: Array<{
      properties?: Record<
        string,
        {
          type?: string;
          default?: unknown;
          scope?: string;
        }
      >;
    }>;
    commands: Array<{ command: string }>;
    menus: Record<string, Array<{ command?: string; when?: string; group?: string }>>;
  };
};

describe('package contributions', () => {
  const manifest = readPackageJson();

  it('contributes the results tree, inspector, and plugin inventory views', () => {
    const views = manifest.contributes.views['spotbugs-container'];
    assert.ok(views.some((view) => view.id === 'spotbugs-view'));
    const inspector = views.find((view) => view.id === 'spotbugs-inspector-view');
    assert.ok(inspector);
    assert.ok(hasManifestNlsPlaceholder(inspector.name));
    assert.strictEqual(inspector.type, 'webview');
    const plugins = views.find((view) => view.id === 'spotbugs-plugins-view');
    assert.ok(plugins);
    assert.ok(hasManifestNlsPlaceholder(plugins.name));
  });

  it('has default NLS values for every manifest placeholder', () => {
    const defaultMessages = readPackageNlsJson();
    const koreanMessages = readPackageNlsKoJson();
    const placeholderKeys = collectManifestNlsPlaceholderKeys(manifest);

    assert.ok(placeholderKeys.size > 0, 'package.json should contain NLS placeholders');
    for (const key of placeholderKeys) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(defaultMessages, key),
        `package.nls.json is missing ${key}`
      );
    }

    for (const key of Object.keys(koreanMessages)) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(defaultMessages, key),
        `package.nls.ko.json contains unknown key ${key}`
      );
    }
  });

  it('contributes command ids used by result tree actions and removes openBugLocation', () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command);

    for (const command of [
      'spotbugs.runWorkspace',
      'spotbugs.revealFindingSource',
      'spotbugs.openFindingDetails',
      'spotbugs.filterResults',
      'spotbugs.exportSarif',
      'spotbugs.resetResults',
      'spotbugs.searchResults',
      'spotbugs.clearSearch',
      'spotbugs.groupResultsBy',
      'spotbugs.sortResultsBy',
      'spotbugs.openSettings',
      'spotbugs.refreshPluginInventory',
    ]) {
      assert.ok(commands.includes(command), `${command} missing from contributes.commands`);
    }
    assert.ok(!commands.includes('spotbugs.openBugLocation'));
  });

  it('contributes configuration settings', () => {
    const properties = Object.assign(
      {},
      ...manifest.contributes.configuration.map((group) => group.properties ?? {})
    ) as Record<
      string,
      { type?: string; default?: unknown; scope?: string }
    >;
    const setting = properties['spotbugs.results.revealSourceOnSelection'];

    assert.ok(setting);
    assert.strictEqual(setting.type, 'boolean');
    assert.strictEqual(setting.default, true);
    assert.strictEqual(setting.scope, 'window');
  });

  it('adds finding leaf context fallbacks for source and details', () => {
    const itemMenus = manifest.contributes.menus['view/item/context'];

    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.revealFindingSource' &&
          entry.when === 'view == spotbugs-view && viewItem == spotbugs.bug'
      )
    );
    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.openFindingDetails' &&
          entry.when === 'view == spotbugs-view && viewItem == spotbugs.bug'
      )
    );
  });

  it('keeps category, pattern, and generic group scoped export', () => {
    const itemMenus = manifest.contributes.menus['view/item/context'];

    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.exportSarif' &&
          entry.when ===
            'view == spotbugs-view && (viewItem == spotbugs.category || viewItem == spotbugs.pattern || viewItem == spotbugs.group)'
      )
    );
  });

  it('keeps result exploration actions on results and source navigation on inspector titles', () => {
    const titleMenus = manifest.contributes.menus['view/title'];

    assert.deepStrictEqual(commandIdsForView(titleMenus, 'spotbugs-view'), [
      'spotbugs.runWorkspace',
      'spotbugs.searchResults',
      'spotbugs.openSettings',
      'spotbugs.exportSarif',
      'spotbugs.filterResults',
      'spotbugs.resetResults',
      'spotbugs.groupResultsBy',
      'spotbugs.sortResultsBy',
      'spotbugs.clearSearch',
    ]);
    assert.deepStrictEqual(commandIdsForView(titleMenus, 'spotbugs-inspector-view'), [
      'spotbugs.revealFindingSource',
    ]);
    assert.deepStrictEqual(commandIdsForView(titleMenus, 'spotbugs-plugins-view'), [
      'spotbugs.refreshPluginInventory',
    ]);

    const resultMenus = titleMenus.filter((entry) => entry.when === 'view == spotbugs-view');
    assert.strictEqual(resultMenus[0].group, 'navigation@1');
    assert.strictEqual(resultMenus[1].group, 'navigation@2');
    assert.strictEqual(resultMenus[2].group, 'navigation@99');
    assert.ok(
      resultMenus
        .filter((entry) =>
          entry.command?.startsWith('spotbugs.group') ||
          entry.command?.startsWith('spotbugs.sort') ||
          entry.command === 'spotbugs.clearSearch'
        )
        .every((entry) => entry.group?.startsWith('3_results'))
    );
  });
});

function commandIdsForView(
  titleMenus: Array<{ command?: string; when?: string; group?: string }>,
  viewId: string
): Array<string | undefined> {
  return titleMenus
    .filter((entry) => entry.when === `view == ${viewId}`)
    .map((entry) => entry.command);
}

function readPackageJson(): PackageJson {
  const manifestPath = path.resolve(__dirname, '../../package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackageJson;
}

function readPackageNlsJson(): Record<string, string> {
  return readFlatStringMap('package.nls.json');
}

function readPackageNlsKoJson(): Record<string, string> {
  return readFlatStringMap('package.nls.ko.json');
}

function readFlatStringMap(fileName: string): Record<string, string> {
  const filePath = path.resolve(__dirname, '../..', fileName);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;

  assert.ok(
    parsed && typeof parsed === 'object' && !Array.isArray(parsed),
    `${fileName} must be a flat object with string values`
  );

  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    assert.strictEqual(typeof value, 'string', `${fileName}.${key} must be a string`);
    messages[key] = value as string;
  }
  return messages;
}

function hasManifestNlsPlaceholder(value: string): boolean {
  NLS_PLACEHOLDER_PATTERN.lastIndex = 0;
  return NLS_PLACEHOLDER_PATTERN.test(value);
}

function collectManifestNlsPlaceholderKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  collectManifestNlsPlaceholderKeysInto(value, keys);
  return keys;
}

function collectManifestNlsPlaceholderKeysInto(value: unknown, keys: Set<string>): void {
  if (typeof value === 'string') {
    NLS_PLACEHOLDER_PATTERN.lastIndex = 0;
    for (const match of value.matchAll(NLS_PLACEHOLDER_PATTERN)) {
      keys.add(match[1]);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectManifestNlsPlaceholderKeysInto(item, keys);
    }
    return;
  }

  for (const item of Object.values(value)) {
    collectManifestNlsPlaceholderKeysInto(item, keys);
  }
}

const NLS_PLACEHOLDER_PATTERN = /%([^%]+)%/g;
