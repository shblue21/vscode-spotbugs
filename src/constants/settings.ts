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
  pluginsRegistrations: 'plugins.registrations',
  analysisDetectors: 'analysis.detectors',
  resultsRevealSourceOnSelection: 'results.revealSourceOnSelection',
} as const;
