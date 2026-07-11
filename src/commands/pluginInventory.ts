import type { Uri } from 'vscode';
import type { Config } from '../core/config';
import {
  getPluginInventory,
  type PluginInventoryResult,
  type PluginInventoryServiceDeps,
} from '../services/pluginInventoryService';

export interface PluginInventoryView {
  showLoading(): void;
  showInventory(result: PluginInventoryResult): void;
}

let refreshGeneration = 0;

export function invalidatePluginInventoryRefresh(): void {
  refreshGeneration++;
}

export async function refreshPluginInventory(
  config: Pick<Config, 'getAnalysisSettings'>,
  view: PluginInventoryView,
  resource?: Uri,
  deps?: PluginInventoryServiceDeps
): Promise<void> {
  const generation = ++refreshGeneration;

  view.showLoading();
  const result = await getPluginInventory(config, resource, deps);
  if (generation === refreshGeneration) {
    view.showInventory(result);
  }
}
