import * as fs from 'fs';
import * as path from 'path';

const FIXTURE_ROOT_SEGMENTS = ['test-fixtures', 'analysis-protocol'];

export function readAnalysisProtocolFixture(name: string): string {
  return fs.readFileSync(path.join(findFixtureRoot(), name), 'utf8');
}

export function readAnalysisProtocolFixtureJson<T>(name: string): T {
  return JSON.parse(readAnalysisProtocolFixture(name)) as T;
}

function findFixtureRoot(): string {
  const visited = new Set<string>();
  for (const startDir of [__dirname, process.cwd()]) {
    const fixtureRoot = findFixtureRootFrom(startDir, visited);
    if (fixtureRoot) {
      return fixtureRoot;
    }
  }
  throw new Error(`Analysis protocol fixture root not found: ${FIXTURE_ROOT_SEGMENTS.join('/')}`);
}

function findFixtureRootFrom(startDir: string, visited: Set<string>): string | undefined {
  let dir = path.resolve(startDir);
  while (!visited.has(dir)) {
    visited.add(dir);
    const candidate = path.join(dir, ...FIXTURE_ROOT_SEGMENTS);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}
