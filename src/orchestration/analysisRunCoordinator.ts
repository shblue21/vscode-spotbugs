import type { CancellationToken, CancellationTokenSource } from 'vscode';

export interface AnalysisRunLease {
  readonly token?: CancellationToken;
  isCurrent(): boolean;
  cancel(): void;
}

interface AnalysisCancellationState {
  readonly source: CancellationTokenSource;
  cancelled: boolean;
}

export class AnalysisRunCoordinator {
  private generation = 0;
  private disposed = false;
  private currentCancellation?: AnalysisCancellationState;

  public constructor(
    private readonly createCancellationSource?: () => CancellationTokenSource
  ) {}

  public begin(): AnalysisRunLease {
    this.cancelCurrent();
    const generation = ++this.generation;
    const source = this.disposed ? undefined : this.createCancellationSource?.();
    const cancellation = source ? { source, cancelled: false } : undefined;
    this.currentCancellation = cancellation;

    return {
      token: source?.token,
      isCurrent: () => !this.disposed && generation === this.generation,
      cancel: () => this.cancelSource(cancellation, false),
    };
  }

  public invalidate(): void {
    this.generation += 1;
    this.cancelCurrent();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
  }

  private cancelCurrent(): void {
    const cancellation = this.currentCancellation;
    this.currentCancellation = undefined;
    this.cancelSource(cancellation, true);
  }

  private cancelSource(
    cancellation: AnalysisCancellationState | undefined,
    dispose: boolean
  ): void {
    if (!cancellation) {
      return;
    }
    try {
      if (!cancellation.cancelled) {
        cancellation.cancelled = true;
        cancellation.source.cancel();
      }
    } finally {
      if (dispose) {
        cancellation.source.dispose();
      }
    }
  }
}
