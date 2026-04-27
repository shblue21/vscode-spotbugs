import { Finding } from '../model/finding';
import { FindingInspectorState } from '../ui/findingInspectorState';

type LifecycleOperation = () => PromiseLike<void> | void;

export async function clearInspectorBeforeOperation(
  inspectorState: FindingInspectorState,
  operation: LifecycleOperation
): Promise<void> {
  inspectorState.clear();
  await operation();
}

export async function reconcileInspectorAfterOperation(
  inspectorState: FindingInspectorState,
  operation: LifecycleOperation,
  getVisibleFindings: () => readonly Finding[]
): Promise<void> {
  await operation();
  inspectorState.reconcileVisibleFindings(getVisibleFindings());
}
