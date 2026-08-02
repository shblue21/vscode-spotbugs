import * as assert from 'assert';
import type { Uri } from 'vscode';
import type {
  FilterConfigurationDeps,
  FilterPathConfiguration,
} from '../commands/filterFiles';
import type { FilterKind } from '../model/filterFiles';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

const vscode = installVscodeMock();
const { addFilterFiles, removeFilterFile } = require(
  '../commands/filterFiles'
) as typeof import('../commands/filterFiles');
const filterTreeModule = require(
  '../ui/filterTreeDataProvider'
) as typeof import('../ui/filterTreeDataProvider');

type Write = [FilterKind, string[], string];
type Validation = [FilterKind, string[]];

describe('filter file commands', () => {
  beforeEach(() => resetVscodeMock());

  it('adds validated files with single-root relative and multi-root absolute paths', async () => {
    const writes: Write[] = [];
    const validations: Validation[] = [];

    await addFilterFiles(
      { filterKind: 'exclude' },
      deps(
        state(['filters/existing.xml'], ['/workspace']),
        uris('/workspace/filters/existing.xml', '/workspace/filters/new.xml'),
        writes,
        validations
      )
    );
    await addFilterFiles(
      undefined,
      deps(
        state([], ['/workspace-a', '/workspace-b']),
        uris('/workspace-a/filters/baseline.xml'),
        writes,
        validations,
        'baseline'
      )
    );

    assert.deepStrictEqual(validations[0], [
      'exclude',
      ['/workspace/filters/existing.xml', '/workspace/filters/new.xml'],
    ]);
    assert.deepStrictEqual(writes[0], [
      'exclude',
      ['filters/existing.xml', 'filters/new.xml'],
      'workspace',
    ]);
    assert.deepStrictEqual(validations[1], [
      'baseline',
      ['/workspace-a/filters/baseline.xml'],
    ]);
    assert.deepStrictEqual(writes[1], [
      'baseline',
      ['/workspace-a/filters/baseline.xml'],
      'workspace',
    ]);
  });

  it('does not write non-XML or invalid selections', async () => {
    const writes: Write[] = [];
    const configuration = state([], ['/workspace']);

    await addFilterFiles(
      { filterKind: 'include' },
      deps(configuration, uris('/workspace/filter.txt'), writes)
    );
    const invalid = deps(
      configuration,
      uris('/workspace/filter.xml'),
      writes
    );
    invalid.validateFilterFiles = async () => ({
      code: 'CFG_FILTER_NOT_FOUND',
      message: 'missing',
    });
    await addFilterFiles({ filterKind: 'include' }, invalid);

    assert.deepStrictEqual(writes, []);
  });

  it('removes only the matching path and ignores stale rows', async () => {
    const writes: Write[] = [];
    const commandDeps = deps(
      state(['filters/a.xml', '/outside/b.xml'], ['/workspace']),
      [],
      writes
    );

    await removeFilterFile(
      { filterKind: 'include', filterPath: '/workspace/filters/a.xml' },
      commandDeps
    );
    await removeFilterFile(
      { filterKind: 'include', filterPath: '/workspace/filters/missing.xml' },
      commandDeps
    );

    assert.deepStrictEqual(writes, [
      ['include', ['/outside/b.xml'], 'workspace'],
    ]);
  });
});

describe('filterTreeDataProvider', () => {
  beforeEach(() => resetVscodeMock());

  it('renders the three groups and configured files', async () => {
    const provider = new filterTreeModule.FilterTreeDataProvider({
      include: ['filters/include.xml'],
      exclude: ['/workspace/filters/exclude.xml'],
      baseline: [],
    });
    const groups = await provider.getChildren();

    assert.deepStrictEqual(groups.map((item) => item.label), [
      'Include',
      'Exclude',
      'Baseline bugs',
    ]);
    assert.deepStrictEqual(groups.map((item) => item.description), ['1', '1', '0']);
    assert.deepStrictEqual(groups.map((item) => item.filterKind), [
      'include',
      'exclude',
      'baseline',
    ]);
    assert.ok(groups.every((item) => item.contextValue === 'spotbugs.filter.group'));

    const [file] = await provider.getChildren(groups[0]);
    assert.deepStrictEqual(
      [file.label, file.tooltip, file.contextValue, file.filterKind, file.filterPath],
      [
        'include.xml',
        'filters/include.xml',
        'spotbugs.filter.file',
        'include',
        'filters/include.xml',
      ]
    );
  });
});

function state(
  paths: string[],
  workspaceRoots: string[]
): FilterPathConfiguration {
  return { target: 'workspace', paths, workspaceRoots };
}

function uris(...paths: string[]): Uri[] {
  return paths.map((filePath) => vscode.Uri.file(filePath) as unknown as Uri);
}

function deps(
  configuration: FilterPathConfiguration,
  selected: readonly Uri[],
  writes: Write[],
  validations: Validation[] = [],
  selectedKind: FilterKind = 'include'
): FilterConfigurationDeps {
  return {
    selectFilterKind: async () => selectedKind,
    selectFilterFiles: async () => selected,
    readConfiguration: () => configuration,
    writeConfiguration: async (kind, paths, target) => {
      writes.push([kind, paths, target]);
    },
    validateFilterFiles: async (kind, paths) => {
      validations.push([kind, paths]);
      return undefined;
    },
  };
}
