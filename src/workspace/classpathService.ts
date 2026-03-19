import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';
import { collectClasspathAttempts } from './classpathAttemptSelector';
import { runClasspathAttempts } from './classpathCommandRunner';
import { deriveTargetResolutionRoots } from './classpathLayout';

export interface ClasspathResult {
  output?: string;
  runtimeClasspaths: string[];
  targetResolutionRoots: string[];
  sourcepaths: string[];
}

export interface ClasspathLookupOptions {
  verbose?: boolean;
  logFailures?: boolean;
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
  project?: ProjectRef,
  options?: ClasspathLookupOptions
): Promise<ClasspathResult | undefined> {
  const attempts = await collectClasspathAttempts(project);
  return runClasspathAttempts(attempts, options);
}

export async function deriveOutputFolder(
  targetResolutionRoots: string[],
  workspacePath: string
): Promise<string | undefined> {
  const candidates: string[] = [];
  for (const cp of targetResolutionRoots) {
    for (const suf of PREFERRED_OUTPUT_SUFFIXES) {
      if (cp.includes(suf)) {
        candidates.push(cp);
        break;
      }
    }
  }
  for (const cp of targetResolutionRoots) {
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
