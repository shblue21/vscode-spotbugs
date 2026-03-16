import { Disposable, ViewColumn, WebviewPanel, window } from 'vscode';
import { Finding } from '../model/finding';
import {
  getFindingDescriptionTitle,
  renderFindingDescriptionHtml,
} from './findingDescriptionRenderer';

const PANEL_VIEW_TYPE = 'spotbugs.findingDescription';
const PANEL_TITLE = 'SpotBugs Details';

export class FindingDescriptionPanel implements Disposable {
  private panel: WebviewPanel | undefined;

  show(finding: Finding): void {
    const panel = this.getOrCreatePanel();
    panel.title = getFindingDescriptionTitle(finding);
    panel.webview.html = renderFindingDescriptionHtml(finding);
    panel.reveal(ViewColumn.Beside, true);
  }

  dispose(): void {
    if (this.panel) {
      const panel = this.panel;
      this.panel = undefined;
      panel.dispose();
    }
  }

  private getOrCreatePanel(): WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    const panel = window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      PANEL_TITLE,
      {
        viewColumn: ViewColumn.Beside,
        preserveFocus: true,
      },
      {
        enableScripts: false,
        localResourceRoots: [],
      }
    );

    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
      }
    });

    this.panel = panel;
    return panel;
  }
}
