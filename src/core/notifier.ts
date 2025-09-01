import { window } from 'vscode';

export interface Notifier {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class VsCodeNotifier implements Notifier {
  info(message: string): void {
    window.showInformationMessage(message);
  }
  warn(message: string): void {
    window.showWarningMessage(message);
  }
  error(message: string): void {
    window.showErrorMessage(message);
  }
}

