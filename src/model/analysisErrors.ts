import { AnalysisError } from './analysisProtocol';

export function formatAnalysisErrors(
  errors: Pick<AnalysisError, 'code' | 'message'>[]
): string {
  const formatted = errors.map((messageInfo) => {
    const code = messageInfo.code ? `[${messageInfo.code}]` : '';
    const message = messageInfo.message || 'Unknown error';
    return `${code} ${message}`.trim();
  });
  return formatted.join('; ');
}
