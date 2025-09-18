export const SETTINGS_SECTION = 'spotbugs';

export const settingKeys = {
  analysisEffort: 'analysis.effort',
  analysisPriorityThreshold: 'analysis.priorityThreshold',
  filtersExcludeFilterPath: 'filters.excludeFilterPath',
  pluginsPaths: 'plugins.paths',
} as const;

export type SettingKey = typeof settingKeys[keyof typeof settingKeys];
