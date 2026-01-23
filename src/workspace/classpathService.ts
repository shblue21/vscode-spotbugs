import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';
import { collectClasspathAttempts } from './classpathAttemptSelector';
import { runClasspathAttempts } from './classpathCommandRunner';

export interface ClasspathResult {
  output?: string;
  classpaths: string[];
  sourcepaths: string[];
}

const PREFERRED_OUTPUT_SUFFIXES = [
  `${path.sep}target${path.sep}classes`,
  `${path.sep}build${path.sep}classes${path.sep}java${path.sep}main`,
  `${path.sep}build${path.sep}classes`,
  `${path.sep}bin`,
  `${path.sep}out${path.sep}production`,
  `${path.sep}out`,
  `${path.sep}classes`,
];

export type ProjectRef = string | Uri | undefined;

export async function getClasspaths(
  project?: ProjectRef
): Promise<ClasspathResult | undefined> {
  const attempts = await collectClasspathAttempts(project);
  return runClasspathAttempts(attempts);
}

export async function deriveOutputFolder(
  classpaths: string[],
  workspacePath: string
): Promise<string | undefined> {
  const jarsExcluded = classpaths.filter(
    (entry) =>
      !entry.toLowerCase().endsWith('.jar') &&
      !entry.toLowerCase().endsWith('.zip')
  );
  const candidates: string[] = [];
  for (const cp of jarsExcluded) {
    for (const suf of PREFERRED_OUTPUT_SUFFIXES) {
      if (cp.includes(suf)) {
        candidates.push(cp);
        break;
      }
    }
  }
  for (const cp of jarsExcluded) {
    if (!candidates.includes(cp) && cp.startsWith(workspacePath)) {
      candidates.push(cp);
    }
  }
  for (const c of candidates) {
    try {
      const st = await fs.promises.stat(c);
      if (st.isDirectory()) {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

