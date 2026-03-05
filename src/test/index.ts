import * as fs from 'fs';
import * as path from 'path';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true });
  const testsRoot = path.resolve(__dirname);
  const files = collectTestFiles(testsRoot);

  for (const file of files) {
    mocha.addFile(file);
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} test(s) failed.`));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.vscode.test.js')) {
      results.push(fullPath);
    }
  }
  return results;
}
