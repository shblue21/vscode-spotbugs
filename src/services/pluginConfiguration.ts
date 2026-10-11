import { workspace } from 'vscode';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';
import { normalizedStringArray, readPathSetting, type PathSettingState } from './pathSetting';

export interface ConfiguredPlugin {
  path: string;
  resolvedPath: string;
  enabled: boolean;
  target: PathSettingState['target'];
}

export interface PluginConfigurationState extends PathSettingState {
  disabledPaths: string[];
}

export function readPluginConfiguration(): PluginConfigurationState {
  const state = readPathSetting(settingKeys.pluginsPaths);
  const disabled = workspace.getConfiguration(SETTINGS_SECTION)
    .inspect<unknown>(settingKeys.pluginsDisabledPaths);
  return {
    ...state,
    disabledPaths: normalizedStringArray(
      state.target === 'workspace' ? disabled?.workspaceValue : disabled?.globalValue,
    ),
  };
}
