import { SpotbugsTreeDataProvider } from '../spotbugsTreeDataProvider';

export interface WorkspaceProgressReporter {
  onStart(uriString: string, index: number, total: number): void;
  onDone(uriString: string, count: number): void;
  onFail(uriString: string, message: string): void;
}

export class TreeViewProgressReporter implements WorkspaceProgressReporter {
  private provider: SpotbugsTreeDataProvider;
  constructor(provider: SpotbugsTreeDataProvider) {
    this.provider = provider;
  }
  onStart(uriString: string, _index: number, _total: number): void {
    this.provider.updateProjectStatus(uriString, 'running');
  }
  onDone(uriString: string, count: number): void {
    this.provider.updateProjectStatus(uriString, 'done', { count });
  }
  onFail(uriString: string, message: string): void {
    this.provider.updateProjectStatus(uriString, 'failed', { error: message });
  }
}

