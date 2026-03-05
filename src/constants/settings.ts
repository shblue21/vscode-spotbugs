export const SETTINGS_SECTION = 'spotbugs';

export const settingKeys = {
  analysisEffort: 'analysis.effort',
  analysisPriorityThreshold: 'analysis.priorityThreshold',
  analysisIncludeFilterPaths: 'analysis.includeFilterPaths',
  analysisExcludeFilterPaths: 'analysis.excludeFilterPaths',
  analysisExcludeBaselineBugsPaths: 'analysis.excludeBaselineBugsPaths',
  // Legacy key kept as read-only fallback for backward compatibility.
  filtersExcludeFilterPath: 'filters.excludeFilterPath',
  pluginsPaths: 'plugins.paths',
} as const;
