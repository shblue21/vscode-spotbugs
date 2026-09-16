import type { ClasspathLookupOutcome } from '../lsp/javaLsOutcome';
import {
  lookupJavaProjectClasspath,
  type ClasspathLookupOptions,
} from './classpathCommandRunner';
import type { ClasspathResult, ProjectRef } from './classpathTypes';

export type { ClasspathLookupOptions } from './classpathCommandRunner';
export type { ClasspathScope, ProjectRef } from './classpathTypes';

export function getClasspathsOutcome(
  project?: ProjectRef,
  options?: ClasspathLookupOptions
): Promise<ClasspathLookupOutcome> {
  return lookupJavaProjectClasspath(project, options);
}

export async function getClasspaths(
  project?: ProjectRef,
  options?: ClasspathLookupOptions
): Promise<ClasspathResult | undefined> {
  const outcome = await getClasspathsOutcome(project, options);
  return outcome.status === 'resolved' ? outcome.classpath : undefined;
}
