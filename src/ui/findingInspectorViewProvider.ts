import { commands, env, l10n, window } from 'vscode';
import type { Disposable, WebviewView, WebviewViewProvider } from 'vscode';
import { SpotBugsCommands } from '../constants/commands';
import { getFindingRuleDocumentationUri } from '../services/spotbugsDiagnosticSupport';
import { FindingInspectorState } from './findingInspectorState';
import { renderFindingInspectorHtml } from './findingInspectorRenderer';

export const FINDING_INSPECTOR_VIEW_ID = 'spotbugs-inspector-view';

type InspectorMessage =
  | { type: 'revealSource' }
  | { type: 'openDetails' }
  | { type: 'copyRuleId' }
  | { type: 'openDocs' };

export class FindingInspectorViewProvider
  implements WebviewViewProvider, Disposable
{
  private view: WebviewView | undefined;
  private readonly subscriptions: Disposable[] = [];

  constructor(private readonly state: FindingInspectorState) {
    this.subscriptions.push(this.state.onDidChange(() => this.render()));
  }

  resolveWebviewView(webviewView: WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    this.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((message: InspectorMessage) =>
        this.handleMessage(message)
      )
    );
    this.render();
  }

  dispose(): void {
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.dispose();
    }
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderFindingInspectorHtml(
      this.state.current,
      createNonce(),
      { l10n: { t: (message, ...args) => l10n.t(message, ...args) } }
    );
  }

  private async handleMessage(message: InspectorMessage): Promise<void> {
    const finding = this.state.current.finding;
    if (!finding) {
      await window.showInformationMessage(
        l10n.t('No SpotBugs finding is currently selected.')
      );
      return;
    }

    if (message.type === 'revealSource') {
      await commands.executeCommand(SpotBugsCommands.REVEAL_FINDING_SOURCE, finding);
      return;
    }

    if (message.type === 'openDetails') {
      await commands.executeCommand(SpotBugsCommands.OPEN_FINDING_DETAILS, finding);
      return;
    }

    if (message.type === 'copyRuleId') {
      await env.clipboard.writeText(finding.patternId);
      await window.showInformationMessage(
        l10n.t('Copied SpotBugs rule id: {0}', finding.patternId)
      );
      return;
    }

    if (message.type === 'openDocs') {
      const target = getFindingRuleDocumentationUri(finding);
      if (!target) {
        await window.showInformationMessage(
          l10n.t('No SpotBugs rule documentation is available.')
        );
        return;
      }
      await commands.executeCommand('vscode.open', target);
    }
  }
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}
