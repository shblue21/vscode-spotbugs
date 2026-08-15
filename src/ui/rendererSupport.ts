import type * as vscode from 'vscode';

type Localize = (
  message: string,
  ...args: Array<string | number | boolean>
) => string;

export type LocalizationApi = {
  l10n: { t: Localize };
  readonly vscodeL10nType?: typeof vscode.l10n;
};

export const fallbackLocalizationApi: LocalizationApi = {
  l10n: {
    t: formatFallback,
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function formatFallback(
  message: string,
  ...args: Array<string | number | boolean>
): string {
  return message.replace(/\{(\d+)\}/g, (placeholder, indexValue: string) => {
    const index = Number(indexValue);
    return index < args.length ? String(args[index]) : placeholder;
  });
}
