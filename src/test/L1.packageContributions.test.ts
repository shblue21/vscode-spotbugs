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

  it('contributes the results tree and inspector views', () => {
    const views = manifest.contributes.views['spotbugs-container'];
    assert.ok(views.some((view) => view.id === 'spotbugs-view'));
    const inspector = views.find((view) => view.id === 'spotbugs-inspector-view');
    assert.ok(inspector);
    assert.strictEqual(inspector.name, 'Inspector');
    assert.strictEqual(inspector.type, 'webview');
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
    ]) {
      assert.ok(commands.includes(command), `${command} missing from contributes.commands`);
    }
    assert.ok(!commands.includes('spotbugs.openBugLocation'));
  });

  it('contributes a setting for source reveal on result selection', () => {
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
