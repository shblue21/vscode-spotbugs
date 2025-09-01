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

export const notifyInfo = (message: string): void => defaultNotifier.info(message);
export const notifyWarn = (message: string): void => defaultNotifier.warn(message);
export const notifyError = (message: string): void => defaultNotifier.error(message);
