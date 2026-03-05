export const SETTINGS_SECTION = 'spotbugs';

export const settingKeys = {
  analysisEffort: 'analysis.effort',
  analysisPriorityThreshold: 'analysis.priorityThreshold',
  filtersIncludePaths: 'filters.includePaths',
  filtersExcludePaths: 'filters.excludePaths',
  filtersExcludeBaselineBugsPaths: 'filters.excludeBaselineBugsPaths',
  pluginsPaths: 'plugins.paths',
} as const;
