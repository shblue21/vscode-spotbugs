import { AnalysisError } from './analysisProtocol';

export function formatAnalysisErrors(errors: AnalysisError[]): string {
  const messages = errors.map((err) => {
    const code = err.code ? `[${err.code}]` : '';
    const message = err.message || 'Unknown error';
    return `${code} ${message}`.trim();
  });
  return messages.join('; ');
}
