export const SETTINGS_SECTION = 'spotbugs';

export const settingKeys = {
  diagnosticsSeverity: 'diagnostics.severity',
  analysisMinimumConfidence: 'analysis.minimumConfidence',
  analysisEffort: 'analysis.effort',
  analysisPriorityThreshold: 'analysis.priorityThreshold',
  analysisExtraAuxClasspaths: 'analysis.extraAuxClasspaths',
  filtersIncludePaths: 'filters.includePaths',
  filtersExcludePaths: 'filters.excludePaths',
  filtersExcludeBaselineBugsPaths: 'filters.excludeBaselineBugsPaths',
  pluginsPaths: 'plugins.paths',
  resultsRevealSourceOnSelection: 'results.revealSourceOnSelection',
} as const;
