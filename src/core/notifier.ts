import { window } from 'vscode';

export interface Notifier {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const defaultNotifier: Notifier = {
  info: (message: string) => window.showInformationMessage(message),
  warn: (message: string) => window.showWarningMessage(message),
  error: (message: string) => window.showErrorMessage(message),
};
