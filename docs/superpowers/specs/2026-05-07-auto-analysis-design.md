# Auto Analysis V1 Design

Date: 2026-05-07

## Goal

Add an opt-in automatic analysis mode that refreshes SpotBugs findings after a
Java file is saved. The first version should be small, predictable, and quiet:
it should reuse the existing file analysis pipeline, avoid automatic builds, and
not add tuning settings that most users do not need.

This closes the largest workflow gap with the Eclipse and IntelliJ SpotBugs
plugins without copying their deeper build-system integrations in the first
iteration. Eclipse exposes automatic SpotBugs runs from project settings, while
the IntelliJ plugin supports background scanning and affected-file analysis
after compile/automake.

## Non-Goals

- Do not enable automatic analysis by default.
- Do not invoke a Java build automatically in V1.
- Do not implement Java Language Server build-completion or affected-class
  event tracking in V1.
- Do not expose debounce, build mode, trigger, or concurrency settings yet.
- Do not add suppression quick fixes or detector/category UI in this feature.

## User-Facing Behavior

Add one setting:

```json
"spotbugs.autoAnalysis.enabled": false
```

When enabled:

1. Saving a Java document schedules an automatic SpotBugs analysis for that file.
2. Repeated saves of the same file are debounced; only the latest save runs.
3. The extension runs the existing file analysis path against the saved file.
4. Successful analysis updates diagnostics and the SpotBugs tree using the same
   behavior as manual file analysis.
5. Successful automatic runs do not show success notifications.
6. If no compiled class/output target is available, the automatic run ends
   quietly and keeps the user's current workflow uninterrupted.
7. Manual analysis commands remain authoritative. If a manual analysis is
   already running, automatic analysis skips the scheduled run.

## Internal Policy

Only `enabled` is public in V1. Keep the rest as internal policy so later
versions can promote individual fields to settings without changing service
boundaries.

```ts
interface AutoAnalysisSettings {
  enabled: boolean;
}

interface AutoAnalysisPolicy {
  trigger: 'onSave';
  debounceMs: number;
  manualConflict: 'skip';
  missingClassBehavior: 'quiet';
}
```

Initial policy:

```ts
const DEFAULT_AUTO_ANALYSIS_POLICY: AutoAnalysisPolicy = {
  trigger: 'onSave',
  debounceMs: 1500,
  manualConflict: 'skip',
  missingClassBehavior: 'quiet',
};
```

Future-compatible fields can become settings later:

- `spotbugs.autoAnalysis.trigger`: `onSave`, later `onBuild` or `onCompile`
- `spotbugs.autoAnalysis.debounceMs`: if users need tuning
- `spotbugs.autoAnalysis.buildMode`: `never`, later `incremental`
- `spotbugs.autoAnalysis.scope`: `file`, later `project` or `affected`

## Architecture

Introduce `src/services/autoAnalysisService.ts`.

Responsibilities:

- Subscribe to `workspace.onDidSaveTextDocument`.
- Filter to Java file documents.
- Read `spotbugs.autoAnalysis.enabled` via `Config` or a small helper near
  existing configuration code.
- Maintain a per-file debounce timer.
- Maintain a simple service-level running flag for automatic analysis.
- Coordinate with manual runs through a shared analysis activity guard.
- Call the existing file analysis flow with an automatic-analysis mode.
- Dispose timers and subscriptions on extension deactivation.

The existing `runFileAnalysis` path should remain the single behavior source
for resolving classpaths, invoking the Java runner, mapping findings, updating
diagnostics, and refreshing the tree. The auto service should not duplicate
analysis logic.

Automatic mode should not focus the SpotBugs view and should not replace the
tree with a loading item before analysis starts. It should update visible
results only after a successful run.

## Manual Conflict Guard

Add a small shared guard so manual and automatic analysis can make consistent
decisions.

V1 behavior:

- Manual analysis sets the guard to `manual`.
- Automatic analysis checks the guard before starting.
- If the guard is busy, the automatic run is skipped and logged.
- Automatic analysis sets the guard to `auto` while it runs.
- The guard is cleared in `finally`.

This keeps V1 simple. A future queue can replace `skip` when build-completion
analysis is added.

## Automatic Run Mode

Extend `runFileAnalysis` with an execution mode:

```ts
type AnalysisRunMode = 'manual' | 'auto';
```

Manual remains the default. Auto mode changes only UX policy; target resolution,
backend invocation, finding mapping, diagnostics, and tree update logic stay
shared.

Auto mode should use a quiet notifier policy because the manual path
intentionally surfaces user messages:

- Suppress success/info notifications.
- Suppress `no-class-targets` for automatic runs.
- Keep serious configuration and execution errors visible only when they block
  meaningful user action, otherwise log them.

## Diagnostics And Tree Updates

On successful automatic analysis:

- Update diagnostics for the saved file.
- Refresh the SpotBugs tree with the latest automatic file findings.
- Keep inspector lifecycle behavior consistent with manual file analysis.

On quiet skip/failure:

- Do not clear current diagnostics.
- Do not replace the tree with a failure item.
- Log the reason for troubleshooting.

This avoids a poor first-run experience where enabling auto analysis makes the
tree flicker or clear results before the project has produced class files.

## Tests

Add focused tests around the new service and package contributions:

- Setting is contributed with default `false`.
- Setting off means save events do not schedule analysis.
- Java file save schedules one analysis after debounce.
- Repeated saves of the same file run only once.
- Non-Java saves are ignored.
- Busy manual guard causes automatic analysis to skip.
- `no-class-targets` in automatic mode does not show a user-facing error and
  does not replace current tree results with a failure item.
- Service disposal clears pending timers.

Existing compile, lint, unit, and Java runner tests should continue to pass.

## References

- Eclipse SpotBugs plugin documentation:
  https://spotbugs.readthedocs.io/en/latest/eclipse.html
- IntelliJ SpotBugs plugin metadata:
  https://raw.githubusercontent.com/JetBrains/spotbugs-intellij-plugin/master/src/main/resources/META-INF/plugin.xml
- SpotBugs command-line options:
  https://spotbugs.readthedocs.io/en/latest/running.html

## Spec Review

- Requirements are concrete and do not leave unresolved blanks.
- V1 scope is limited to opt-in save-triggered automatic analysis.
- Future settings are identified but not exposed in V1.
- Manual conflict, missing class output, diagnostics, tree behavior, and tests
  are explicitly defined.
