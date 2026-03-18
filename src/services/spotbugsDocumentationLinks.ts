export const GENERIC_SPOTBUGS_DOCS_URI =
  'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html';

const SPOTBUGS_DOCS_HOSTNAME = 'spotbugs.readthedocs.io';
const SPOTBUGS_BUG_DESCRIPTIONS_PATH_SUFFIX = '/bugDescriptions.html';
const LEGACY_SPOTBUGS_ANCHOR_PATTERN = /^[A-Z0-9_]+$/;

export function rewriteLegacySpotBugsHelpUrl(url: URL, bugType?: string): URL {
  const normalizedBugType = normalizeLegacyBugType(bugType);
  if (!normalizedBugType || !isSpotBugsBugDescriptionsUrl(url)) {
    return url;
  }

  const fragment = normalizeLegacyBugType(readHashFragment(url.hash));
  if (
    !fragment ||
    fragment !== normalizedBugType ||
    !LEGACY_SPOTBUGS_ANCHOR_PATTERN.test(fragment)
  ) {
    return url;
  }

  url.hash = toSlugAnchor(fragment);
  return url;
}

function isSpotBugsBugDescriptionsUrl(url: URL): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname === SPOTBUGS_DOCS_HOSTNAME &&
    url.pathname.endsWith(SPOTBUGS_BUG_DESCRIPTIONS_PATH_SUFFIX)
  );
}

function normalizeLegacyBugType(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function readHashFragment(hash: string): string | undefined {
  if (!hash || hash === '#') {
    return undefined;
  }

  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function toSlugAnchor(value: string): string {
  return value.toLowerCase().replace(/_/g, '-');
}
