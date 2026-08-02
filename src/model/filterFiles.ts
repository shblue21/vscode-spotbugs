export const FILTER_KINDS = ['include', 'exclude', 'baseline'] as const;

export type FilterKind = (typeof FILTER_KINDS)[number];

export type FilterPaths = Readonly<Record<FilterKind, readonly string[]>>;

export interface FilterFileCommandTarget {
  filterKind?: FilterKind;
  filterPath?: string;
}
