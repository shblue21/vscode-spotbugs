import { Disposable, Event, EventEmitter } from 'vscode';
import { Finding } from '../model/finding';

export type FindingInspectorStatus = 'empty' | 'selected' | 'retained';

export type FindingInspectorSnapshot =
  | { status: 'empty'; finding?: undefined }
  | { status: 'selected'; finding: Finding }
  | { status: 'retained'; finding: Finding };

export class FindingInspectorState implements Disposable {
  private readonly onDidChangeEmitter = new EventEmitter<FindingInspectorSnapshot>();
  readonly onDidChange: Event<FindingInspectorSnapshot> = this.onDidChangeEmitter.event;

  private snapshot: FindingInspectorSnapshot = { status: 'empty' };

  get current(): FindingInspectorSnapshot {
    return this.snapshot;
  }

  select(finding: Finding): void {
    this.set({ status: 'selected', finding });
  }

  retainCurrent(): void {
    if (this.snapshot.status !== 'selected') {
      return;
    }
    this.set({ status: 'retained', finding: this.snapshot.finding });
  }

  clear(): void {
    if (this.snapshot.status === 'empty') {
      return;
    }
    this.set({ status: 'empty' });
  }

  reconcileVisibleFindings(visibleFindings: readonly Finding[]): void {
    if (this.snapshot.status === 'empty') {
      return;
    }
    const current = this.snapshot.finding;
    if (visibleFindings.some((candidate) => isSameFinding(candidate, current))) {
      return;
    }
    this.clear();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private set(snapshot: FindingInspectorSnapshot): void {
    this.snapshot = snapshot;
    this.onDidChangeEmitter.fire(snapshot);
  }
}

function isSameFinding(left: Finding, right: Finding): boolean {
  if (left === right) {
    return true;
  }
  if (left.instanceHash && right.instanceHash) {
    return left.instanceHash === right.instanceHash;
  }

  return (
    left.patternId === right.patternId &&
    left.location.fullPath === right.location.fullPath &&
    left.location.realSourcePath === right.location.realSourcePath &&
    left.location.sourceFile === right.location.sourceFile &&
    left.location.startLine === right.location.startLine &&
    left.location.endLine === right.location.endLine &&
    left.className === right.className &&
    left.methodName === right.methodName &&
    left.fieldName === right.fieldName
  );
}
