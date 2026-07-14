export interface AnalysisRunLease {
  isCurrent(): boolean;
}

export class AnalysisRunCoordinator {
  private generation = 0;
  private disposed = false;

  public begin(): AnalysisRunLease {
    const generation = ++this.generation;
    return {
      isCurrent: () => !this.disposed && generation === this.generation,
    };
  }

  public invalidate(): void {
    this.generation += 1;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
  }
}
