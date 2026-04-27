import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type PackageJson = {
  contributes: {
    views: Record<string, Array<{ id: string; name: string; type?: string }>>;
    commands: Array<{ command: string; title: string; icon?: string }>;
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

  it('contributes split finding commands and removes openBugLocation', () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command);

    assert.ok(commands.includes('spotbugs.revealFindingSource'));
    assert.ok(commands.includes('spotbugs.openFindingDetails'));
    assert.ok(!commands.includes('spotbugs.openBugLocation'));
  });

  it('uses SpotBugs results wording for shared toolbar commands', () => {
    const commands = new Map(
      manifest.contributes.commands.map((entry) => [entry.command, entry])
    );

    assert.strictEqual(commands.get('spotbugs.runWorkspace')?.title, 'Analyze SpotBugs Workspace');
    assert.strictEqual(commands.get('spotbugs.exportSarif')?.title, 'Export SpotBugs Results (SARIF)');
    assert.strictEqual(commands.get('spotbugs.filterResults')?.title, 'Filter SpotBugs Results');
    assert.strictEqual(commands.get('spotbugs.resetResults')?.title, 'Reset SpotBugs Results');
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

  it('keeps category and pattern scoped export', () => {
    const itemMenus = manifest.contributes.menus['view/item/context'];

    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.exportSarif' &&
          entry.when ===
            'view == spotbugs-view && (viewItem == spotbugs.category || viewItem == spotbugs.pattern)'
      )
    );
  });

  it('duplicates top-level actions on both view titles with overflow groups', () => {
    const titleMenus = manifest.contributes.menus['view/title'];

    assert.deepStrictEqual(commandIdsForView(titleMenus, 'spotbugs-view'), [
      'spotbugs.runWorkspace',
      'spotbugs.exportSarif',
      'spotbugs.filterResults',
      'spotbugs.resetResults',
    ]);
    assert.deepStrictEqual(commandIdsForView(titleMenus, 'spotbugs-inspector-view'), [
      'spotbugs.runWorkspace',
      'spotbugs.exportSarif',
      'spotbugs.filterResults',
      'spotbugs.resetResults',
    ]);

    for (const viewId of ['spotbugs-view', 'spotbugs-inspector-view']) {
      const menus = titleMenus.filter((entry) => entry.when === `view == ${viewId}`);
      assert.strictEqual(menus[0].group, 'navigation');
      assert.ok(menus.slice(1).every((entry) => !entry.group?.startsWith('navigation')));
    }
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
