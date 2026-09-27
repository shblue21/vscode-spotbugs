import * as fs from 'fs';
import * as path from 'path';

export function readAnalysisProtocolFixtureJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../../test-fixtures/analysis-protocol', name), 'utf8'
  )) as T;
}
