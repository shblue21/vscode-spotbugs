export const SETTINGS_SECTION = 'spotbugs';

export const settingKeys = {
  analysisEffort: 'analysis.effort',
  analysisPriorityThreshold: 'analysis.priorityThreshold',
  analysisExtraAuxClasspaths: 'analysis.extraAuxClasspaths',
  filtersIncludePaths: 'filters.includePaths',
  filtersExcludePaths: 'filters.excludePaths',
  filtersExcludeBaselineBugsPaths: 'filters.excludeBaselineBugsPaths',
  pluginsPaths: 'plugins.paths',
} as const;
