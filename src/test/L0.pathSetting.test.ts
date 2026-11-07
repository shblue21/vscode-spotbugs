import * as assert from 'assert';
import * as path from 'path';
import type { PathSettingState } from '../services/pathSetting';
import { installVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const planner = require('../services/pathSetting') as typeof import('../services/pathSetting');

describe('pathSetting', () => {
  const root = path.resolve('/workspace');
  const state = (
    paths: string[] = [],
    target: PathSettingState['target'] = 'workspace',
    workspaceRoots: string[] = [root],
  ): PathSettingState => ({ target, paths, workspaceRoots });

  it('selects and normalizes the active scope', () => {
    const cases: Array<
      [Parameters<typeof planner.createPathSettingState>[0], string[], PathSettingState]
    > = [
      [undefined, [root], state()],
      [{ globalValue: [' global.jar '] }, [root], state(['global.jar'], 'global')],
      [
        {
          globalValue: ['global.jar'],
          workspaceValue: [' workspace.jar ', '', 'workspace.jar', 42],
        },
        [root],
        state(['workspace.jar']),
      ],
      [undefined, [], state([], 'global', [])],
    ];

    for (const [inspection, roots, expected] of cases) {
      assert.deepStrictEqual(planner.createPathSettingState(inspection, roots), expected);
    }
  });

  it('plans duplicate-free additions with the correct stored path', () => {
    const existing = path.join(root, 'plugins', 'existing.jar');
    const added = path.join(root, 'plugins', 'new.jar');
    assert.deepStrictEqual(
      planner.planPathAdditions(state(['plugins/existing.jar']), [existing, added, added]),
      {
        paths: ['plugins/existing.jar', 'plugins/new.jar'],
        additions: ['plugins/new.jar'],
      },
    );

    const inside = path.join(root, 'plugins', 'plugin.jar');
    const outside = path.resolve(root, '..', 'outside', 'plugin.jar');
    for (const [setting, selected] of [
      [state([], 'global'), inside],
      [state([], 'workspace', [root, path.resolve('/workspace-b')]), inside],
      [state(['plugins/plugin.jar'], 'workspace', [root, path.resolve('/workspace-b')]), inside],
      [state(), outside],
      [state(), root],
    ] as Array<[PathSettingState, string]>) {
      assert.deepStrictEqual(planner.planPathAdditions(setting, [selected]).additions, [selected]);
    }
  });

  it('removes relative or absolute targets and ignores stale ones', () => {
    const setting = state(['filters/a.xml', 'plugins/b.jar']);
    assert.deepStrictEqual(planner.planFilterPathRemoval(setting, 'filters/a.xml'), [
      'plugins/b.jar',
    ]);
    assert.deepStrictEqual(
      planner.planFilterPathRemoval(setting, path.join(root, 'plugins', 'b.jar')),
      ['filters/a.xml'],
    );
    assert.strictEqual(planner.planFilterPathRemoval(setting, 'missing.xml'), undefined);
    const absolute = path.join(root, 'filters/a.xml');
    const multi = state(['filters/a.xml', absolute], 'workspace', [
      root,
      path.resolve('/workspace-b'),
    ]);
    assert.deepStrictEqual(planner.planFilterPathRemoval(multi, 'filters/a.xml'), [absolute]);
    assert.deepStrictEqual(planner.planFilterPathRemoval(multi, absolute), ['filters/a.xml']);
    assert.deepStrictEqual(
      planner.planFilterPathRemoval(
        state(['filters/a.xml', path.join(root, 'filters/a.xml')]),
        'filters/a.xml',
      ),
      [],
    );
  });
});
