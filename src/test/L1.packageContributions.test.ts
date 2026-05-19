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
          markdownDescription?: string;
          scope?: string;
        }
      >;
    }>;
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

    assert.deepStrictEqual(
      {
        title: commands.get('spotbugs.runWorkspace')?.title,
        icon: commands.get('spotbugs.runWorkspace')?.icon,
      },
      {
        title: 'Analyze SpotBugs Workspace',
        icon: '$(bug)',
      }
    );
    assert.strictEqual(commands.get('spotbugs.exportSarif')?.title, 'Export SpotBugs Results (SARIF)');
    assert.strictEqual(commands.get('spotbugs.filterResults')?.title, 'Filter SpotBugs Results');
    assert.strictEqual(commands.get('spotbugs.resetResults')?.title, 'Reset SpotBugs Results');
  });

  it('contributes result exploration commands', () => {
    const commands = new Map(
      manifest.contributes.commands.map((entry) => [entry.command, entry])
    );

    assert.deepStrictEqual(
      {
        title: commands.get('spotbugs.searchResults')?.title,
        icon: commands.get('spotbugs.searchResults')?.icon,
      },
      {
        title: 'SpotBugs: Search Results',
        icon: '$(search)',
      }
    );
    assert.deepStrictEqual(
      {
        title: commands.get('spotbugs.clearSearch')?.title,
        icon: commands.get('spotbugs.clearSearch')?.icon,
      },
      {
        title: 'SpotBugs: Clear Search',
        icon: '$(clear-all)',
      }
    );
    assert.deepStrictEqual(
      {
        title: commands.get('spotbugs.groupResultsBy')?.title,
        icon: commands.get('spotbugs.groupResultsBy')?.icon,
      },
      {
        title: 'SpotBugs: Group Results By...',
        icon: '$(group-by-ref-type)',
      }
    );
    assert.deepStrictEqual(
      {
        title: commands.get('spotbugs.sortResultsBy')?.title,
        icon: commands.get('spotbugs.sortResultsBy')?.icon,
      },
      {
        title: 'SpotBugs: Sort Results By...',
        icon: '$(sort-precedence)',
      }
    );
  });

  it('contributes the settings command', () => {
    const commands = new Map(
      manifest.contributes.commands.map((entry) => [entry.command, entry])
    );

    assert.deepStrictEqual(
      {
        title: commands.get('spotbugs.openSettings')?.title,
        icon: commands.get('spotbugs.openSettings')?.icon,
      },
      {
        title: 'SpotBugs: Open Settings',
        icon: '$(gear)',
      }
    );
  });

  it('contributes a setting for source reveal on result selection', () => {
    const properties = Object.assign(
      {},
      ...manifest.contributes.configuration.map((group) => group.properties ?? {})
    ) as Record<
      string,
      { type?: string; default?: unknown; markdownDescription?: string; scope?: string }
    >;
    const setting = properties['spotbugs.results.revealSourceOnSelection'];

    assert.ok(setting);
    assert.strictEqual(setting.type, 'boolean');
    assert.strictEqual(setting.default, true);
    assert.strictEqual(setting.scope, 'window');
    assert.strictEqual(
      setting.markdownDescription,
      'Reveal the source location in a preview editor when selecting a SpotBugs finding in the results tree.'
    );
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
