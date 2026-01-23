import { Uri, workspace } from 'vscode';
import { getAllJavaProjects } from '../lsp/javaLsGateway';
import { ProjectRef } from './classpathService';

export interface ClasspathAttempt {
  label: string;
  arg?: unknown;
}

export async function collectClasspathAttempts(
  project?: ProjectRef
): Promise<ClasspathAttempt[]> {
  const attempts: ClasspathAttempt[] = [];
  if (project) attempts.push({ label: `preferred:${toUriString(project)}`, arg: project });

  const folders = workspace.workspaceFolders ?? [];
  for (const f of folders) {
    if (!project || toUriString(f.uri) !== toUriString(project)) {
      attempts.push({ label: `workspace:${f.name}`, arg: f.uri });
    }
  }

  try {
    const uris = (await getAllJavaProjects()) || [];
    for (const u of uris) {
      if (!attempts.find((a) => a.arg && toUriString(a.arg) === u)) {
        attempts.push({ label: `project:${u}`, arg: u });
      }
    }
  } catch {
    // ignore
  }

  attempts.push({ label: 'no-arg' });
  return attempts;
}

function toUriString(ref: ProjectRef | unknown): string {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  if (ref instanceof Uri) return ref.toString();
  if (typeof (ref as { toString?: unknown })?.toString === 'function') {
    return String((ref as { toString: () => string }).toString());
  }
  return '';
}
