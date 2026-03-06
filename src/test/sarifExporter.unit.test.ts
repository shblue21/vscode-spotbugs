import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { mapBugsToFindings } from '../lsp/spotbugsMapper';
import { Bug } from '../model/bug';
import { Finding } from '../model/finding';
import { buildSarifLog } from '../services/sarifExporter';
import {
  normalizeSarifLog,
  NormalizedSarifLog,
} from './helpers/sarifNormalization';

const fixturesDir = path.resolve(__dirname, '..', '..', 'src', 'test', 'fixtures', 'sarif');
const placeholderWorkspaceRoot = '/__WORKSPACE_ROOT__';

describe('buildSarifLog', () => {
  it('matches normalized native SARIF core fields for fixture findings', () => {
    const bugs = readJsonFixture<Bug[]>('bugs.json');
    const findings = mapBugsToFindings(bugs);

    const actual = normalizeSarifLog(
      buildSarifLog(findings, {
        toolVersion: '(Unknown)',
      })
    );
    const expected = readJsonFixture<NormalizedSarifLog>('nativeNormalized.json');

    assert.deepStrictEqual(actual, expected);
  });

  it('includes rich metadata when available', () => {
    const finding = makeFinding({
      type: 'NP_NULL_ON_SOME_PATH',
      rank: 5,
      priority: 'High',
      shortDescription: 'Null pointer dereference',
      longDescription: 'Detailed null pointer explanation.',
      helpUri: 'https://example.test/help/NP_NULL_ON_SOME_PATH',
      cweId: 476,
      instanceHash: 'abc123',
      location: {
        fullPath: '/__WORKSPACE_ROOT__/src/main/java/example/Example.java',
        startLine: 12,
        endLine: 12,
      },
    });

    const actual = normalizeSarifLog(
      buildSarifLog([finding], {
        toolVersion: '4.8.3',
        workspaceRootPath: placeholderWorkspaceRoot,
      }),
      {
        workspaceRootPath: placeholderWorkspaceRoot,
        includeFullDescription: true,
        includeFingerprints: true,
        includeRelationships: true,
      }
    );

    assert.deepStrictEqual(actual, {
      toolDriver: {
        name: 'SpotBugs',
        version: '4.8.3',
      },
      rules: [
        {
          id: 'NP_NULL_ON_SOME_PATH',
          shortDescription: 'Null pointer dereference.',
          fullDescription: 'Detailed null pointer explanation.',
          helpUri: 'https://example.test/help/NP_NULL_ON_SOME_PATH',
          relationships: [
            {
              kinds: ['relevant'],
              targetId: '476',
              targetComponent: 'CWE',
            },
          ],
        },
      ],
      results: [
        {
          ruleId: 'NP_NULL_ON_SOME_PATH',
          level: 'error',
          message: 'Null pointer dereference',
          uri: 'src/main/java/example/Example.java',
          startLine: 12,
          instanceHash: 'abc123',
        },
      ],
    });
  });

  it('omits regions when the start line is unknown and normalizes workspace paths', () => {
    const finding = makeFinding({
      type: 'UUF_UNUSED_FIELD',
      rank: 18,
      priority: 'Medium',
      shortDescription: 'Unused field',
      location: {
        fullPath: '/__WORKSPACE_ROOT__/src/main/java/example/Example.java',
        startLine: 0,
        endLine: 7,
      },
    });

    const actual = normalizeSarifLog(
      buildSarifLog([finding], {
        workspaceRootPath: placeholderWorkspaceRoot,
      }),
      {
        workspaceRootPath: placeholderWorkspaceRoot,
      }
    );

    assert.deepStrictEqual(actual.results, [
      {
        ruleId: 'UUF_UNUSED_FIELD',
        level: 'note',
        message: 'Unused field',
        uri: 'src/main/java/example/Example.java',
      },
    ]);
  });

  it('keeps export structure stable for subset exports', () => {
    const bugs = readJsonFixture<Bug[]>('bugs.json');
    const findings = mapBugsToFindings(bugs).slice(1);

    const actual = normalizeSarifLog(buildSarifLog(findings));

    assert.deepStrictEqual(actual.rules, [
      {
        id: 'UUF_UNUSED_FIELD',
        shortDescription: 'Unused field.',
        helpUri:
          'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#UUF_UNUSED_FIELD',
      },
    ]);
    assert.deepStrictEqual(actual.results, [
      {
        ruleId: 'UUF_UNUSED_FIELD',
        level: 'note',
        message: 'Unused field',
        uri: 'fixtures/sarif/SarifFixtureSample.java',
      },
    ]);
  });
});

function readJsonFixture<T>(fileName: string): T {
  const filePath = path.join(fixturesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    patternId: 'NP',
    type: 'NP',
    rank: 10,
    priority: 'Medium',
    category: 'CORRECTNESS',
    abbrev: 'NP',
    message: 'NP: Example in example.Foo',
    location: {
      fullPath: '/__WORKSPACE_ROOT__/src/main/java/example/Foo.java',
      startLine: 10,
      endLine: 10,
    },
    ...overrides,
  };
}
