import { commands, Uri } from 'vscode';
import { Logger } from '../core/logger';
import { JavaLanguageServerCommands } from '../constants/commands';
import { buildWorkspace, BuildMode } from './workspaceBuildService';

export class JavaLsClient {
  static async getAllProjects(): Promise<string[]> {
    try {
      const uris = (await commands.executeCommand<string[]>(
        JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
      )) || [];
      // filter out default pseudo project
      return uris.filter((uriString) => {
        try {
          const p = Uri.parse(uriString).fsPath;
          return !p.endsWith('jdt.ls-java-project');
        } catch {
          return true;
        }
      });
    } catch {
      return [];
    }
  }

  static async buildWorkspace(mode: BuildMode = 'auto'): Promise<number | undefined> {
    return buildWorkspace({ mode, ensureCommands: false });
  }
}
