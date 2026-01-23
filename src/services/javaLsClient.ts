import { Uri } from 'vscode';
import { getAllJavaProjects } from '../lsp/javaLsGateway';
import { buildWorkspace, BuildMode } from './workspaceBuildService';

export class JavaLsClient {
  static async getAllProjects(): Promise<string[]> {
    try {
      const uris = (await getAllJavaProjects()) || [];
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
