import { commands, Uri, workspace } from 'vscode';
import * as path from 'path';
import { JavaLanguageServerCommands } from '../constants/commands';
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
    const uris =
      (await commands.executeCommand<string[]>(
        JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
      )) || [];
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

export async function getAllJavaProjectUris(): Promise<string[]> {
  try {
    const uris =
      (await commands.executeCommand<string[]>(
        JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
      )) || [];
    return uris.filter((uriString) => {
      try {
        const p = Uri.parse(uriString).fsPath;
        return path.basename(p) !== 'jdt.ls-java-project';
      } catch {
        return true;
      }
    });
  } catch {
    return [];
  }
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

