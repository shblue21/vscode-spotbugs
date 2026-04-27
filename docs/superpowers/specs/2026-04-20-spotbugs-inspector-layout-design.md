# SpotBugs Inspector Layout Design

Date: 2026-04-20
Status: Ready for implementation planning

## Summary

Replace the current single-pane SpotBugs sidebar experience with two native contributed views inside the existing SpotBugs container:

- Results list: the current findings tree remains a VS Code `TreeView`.
- Inspector: the selected-finding summary is a separate VS Code `WebviewView` with view id `spotbugs-inspector-view`, intended to sit below the tree.
- Full details: the existing full HTML detail panel remains available, but opens only through explicit actions such as `Open details`.

The implementation primitive is intentionally `TreeView` plus `WebviewView`. This design does not rebuild the whole SpotBugs sidebar as one custom webview surface.

Because VS Code owns view sizing, collapse, visibility, and drag/reorder behavior, the 66%/33% split is a layout target rather than an enforceable invariant.

## Goals

- Reduce context switching while triaging findings.
- Keep the findings list visible while inspecting a selected finding.
- Preserve the existing full detail panel for long-form rule documentation.
- Make the difference between quick inspection, source navigation, and full details explicit.
- Keep current tree grouping and scoped tree actions intact.

## Non-Goals

- Do not replace the full HTML detail renderer with a sidebar-sized clone.
- Do not add a filter dashboard or scan overview into the inspector.
- Do not redesign category/pattern/finding grouping.
- Do not preserve click-to-open behavior from finding tree leaf selection.
- Do not add a compatibility shim for `spotbugs.openBugLocation`.

## Approved Layout

### Results Tree View

The primary view remains the main findings tree, implemented with VS Code `TreeView`:

- Category groups
- Pattern groups
- Individual findings
- Existing message/progress items

The current grouping model stays unchanged. Category and pattern tree nodes must keep their existing scoped semantics, including scoped SARIF export.

### Selected Finding Inspector View

The secondary view is a compact inspector implemented with VS Code `WebviewView`. It is optimized for quick decision-making rather than full documentation.

Sections, top to bottom:

1. Header
   - State label: `Selected finding` when the current tree selection is a finding leaf
   - State label: `Last inspected finding` when a category or pattern node is selected while the inspector keeps the previous leaf summary
   - Severity icon
   - One-line finding title, ellipsized with full text available in a tooltip
   - `Open details` action
2. Metadata
   - Pattern ID
   - Category
   - Priority or rank
   - CWE if available
3. Location
   - File path, middle-truncated or wrapped so it does not push actions out of view
   - Line number or range
   - Method or field name if available, truncated with tooltip when too long
   - `Go to code`
   - `Copy rule id`
4. Rule summary
   - Plain-text summary extracted from the first meaningful prose paragraph in local rule description data
   - Fallback to the first paragraph from `longDescription`
   - Must not concatenate examples, lists, blockquotes, code blocks, or later full-document sections into a compact details copy
5. Actions
   - `Open docs`, when `helpUri` is available
   - Future-ready slot for `Suppress / Exclude`

`Copy rule id` is in scope for v1 because it is low-risk and useful during triage. It copies `finding.patternId` exactly. `type` and `abbrev` may still be displayed as supporting metadata, but they are not the value copied by this action. Same-pattern occurrence count is deferred; it can be added later if the first inspector proves too sparse.

## Interaction Model

- Selecting a leaf finding in the tree updates the inspector state.
- Selecting a category or pattern node does not clear or replace the inspector. The inspector continues showing the last selected leaf finding, avoiding churn while users expand groups or use scoped tree actions.
- When the inspector is showing a retained finding while the current tree selection is category or pattern, it must label that state as `Last inspected finding` rather than implying the inspector summarizes the selected group.
- Category and pattern nodes keep their existing tree semantics. For example, scoped export must still resolve the selected category or pattern node rather than the last inspected finding.
- Selecting message/progress items does not create an inspector selection. Loading, reset, rerun, and filter invalidation are handled by the inspector state lifecycle below.
- Tree leaf single click no longer navigates to source and no longer opens the full details panel.
- `Open details` opens or reveals the existing full HTML details panel. If no details panel exists yet, it creates one in an adjacent editor group where possible.
- `Go to code` navigates to source without forcing the full details panel to open.
- Tree browsing should remain lightweight and should not create editor churn.

This design does not require visual deselection of the VS Code `TreeView`. VS Code owns the tree selection UI, and selecting the same leaf again may not emit another selection event. The extension should manage its own inspector state instead of trying to force the tree to appear deselected.

## Command Migration Contract

The current codebase couples finding-tree click behavior to `spotbugs.openBugLocation`, whose handler opens source and then shows the full details panel. This design intentionally breaks that coupling.

New frontend command IDs:

- `spotbugs.revealFindingSource`: reveal the finding source location only.
- `spotbugs.openFindingDetails`: open the existing full HTML finding details panel only.

Migration rules:

- Remove the `spotbugs.openBugLocation` command contribution, constant, registration, and tree leaf usage.
- Do not add a legacy compatibility shim for `spotbugs.openBugLocation`.
- Finding leaf nodes no longer set `TreeItem.command` for primary click.
- Inspector population is driven by `TreeView` selection events for `FindingItem` leaves.
- Inspector `Go to code` calls `spotbugs.revealFindingSource`.
- Inspector `Open details` calls `spotbugs.openFindingDetails`.
- The diagnostic quick fix titled `Show SpotBugs details` must call `spotbugs.openFindingDetails`, not the source navigation command.
- Existing full detail rendering code should be reused behind `spotbugs.openFindingDetails`.
- Both split commands should accept an explicit `Finding` payload for tree context menus, inspector actions, and quick fixes.
- Both split commands should also support a no-argument mode that acts on the current inspected finding, so command palette use remains possible when the inspector has state. This fallback must not reinterpret a category or pattern tree selection as the command target.
- When no-argument command execution targets a retained finding while the current tree focus is on a category or pattern, user-visible messaging should make clear that the action applies to the `Last inspected finding`.
- User-facing command titles should be explicit, such as `SpotBugs: Go to Code` and `SpotBugs: Open Finding Details`.

`spotbugs.openBugLocation` is a VS Code frontend command, not a Java runner or JDT LS backend command. It appears in the extension command contribution, tree item command wiring, diagnostic quick fix wiring, and activation handler. The backend analysis protocol is separate: frontend analysis uses `java.execute.workspaceCommand` with `java.spotbugs.run`, and the runner plugin registers only `java.spotbugs.run`. Therefore removing or splitting `spotbugs.openBugLocation` must not change the backend analysis protocol.

## Inspector Hidden Fallback

The inspector may be collapsed, hidden, moved, or temporarily unavailable because VS Code controls contributed view layout. Tree users must still have explicit access to the two primary finding actions.

Add at least these `view/item/context` actions for `view == spotbugs-view && viewItem == spotbugs.bug`:

- `Go to code` -> `spotbugs.revealFindingSource`
- `Open details` -> `spotbugs.openFindingDetails`

These actions are a functional fallback, not a replacement for the inspector. Existing category/pattern scoped export behavior remains available for `viewItem == spotbugs.category` and `viewItem == spotbugs.pattern`.

The fallback must remain reachable for keyboard-only users. At minimum, VS Code's tree item context menu path should expose these actions for focused finding leaves. Command palette execution should target only the current inspected finding and should show a clear message when no finding is available. If the command acts on a retained finding while tree focus is on a category or pattern, the message should identify the target as the `Last inspected finding`. No default keybindings are required in v1, but the command IDs and no-argument behavior should be safe for users to bind themselves.

## Toolbar and Menu Placement

Current top-level actions are contributed to `view/title` with `when: view == spotbugs-view`. With two contributed views, those actions must not disappear just because keyboard focus is in the inspector.

For v1, duplicate the existing top-level actions on both view titles:

- `spotbugs.runWorkspace`
- `spotbugs.exportSarif`
- `spotbugs.filterResults`
- `spotbugs.resetResults`

The result tree view keeps the current `view == spotbugs-view` title contributions. The inspector view adds equivalent title contributions with `view == spotbugs-inspector-view`. Command handlers remain shared, so duplicated placement does not duplicate behavior.

To avoid crowding the inspector title, `Analyze this workspace` remains the primary visible action. `Export`, `Filter`, and `Reset` may sit behind the view title overflow menu when width is constrained, but they must remain discoverable from the inspector view title. Inspector title actions should use the same icons and clear tooltips as the results view, and should read as shared SpotBugs results/container actions rather than inspector-specific state. Tooltips and labels should use wording such as `Analyze SpotBugs workspace`, `Export SpotBugs results`, `Filter SpotBugs results`, and `Reset SpotBugs results`.

If VS Code later offers a better container-level action strategy for this extension, that can replace the duplicated placement. The implementation plan should not leave toolbar placement undecided.

## Why This Layout

The SpotBugs sidebar is primarily a triage surface. Users need to answer four questions quickly:

1. What is this issue?
2. Where is it?
3. What rule does this finding belong to?
4. What should I do next?

The inspector answers these questions without taking focus away from the results list. The existing details panel remains the place for long-form documentation, HTML rendering, and external-doc style reading.

## Information That Must Stay Out of the Inspector

- Full HTML detail rendering
- Full rule-description body previews
- Large compliant/noncompliant code examples
- Large filter forms
- Scan progress dashboards
- Dense project summaries unrelated to the selected finding

If any of this content is needed, it belongs in the existing full details panel or another dedicated surface.

## Inspector Rule Summary Contract

The inspector rule summary is plain text, not rich HTML, and not a compact copy of the full details body. It is a rule-level summary for triage. The current backend data does not provide a separate instance-specific explanation for why a finding fired at a particular source location, so the UI must not label this content as `Why it fired`.

Extraction order:

1. Prefer `detailHtml` when available.
2. Apply the same sanitization policy used by the full details pipeline before extracting summary text.
3. Extract only the first meaningful prose paragraph from the sanitized HTML.
4. Do not concatenate multiple paragraphs, lists, blockquotes, code blocks, examples, or later recommendation sections into the inspector.
5. Convert the selected summary paragraph to text.
6. Remove markup and links from the summary. Visible anchor text may remain, but `href` targets and clickable behavior are discarded.
7. Decode text content through the parser, normalize whitespace to single spaces, trim leading/trailing whitespace, and remove empty output.
8. Apply truncation only as a safety guard after structural summary extraction:
   - Hard cap: 420 characters.
   - Prefer ending at a sentence boundary after at least 160 characters.
   - If no suitable sentence boundary exists, cut at the nearest word boundary before the hard cap.
   - Append `...` only when text was truncated.
   - In the rendered inspector, constrain the rule summary to compact sidebar reading, with `Open details` as the path to the full explanation.
9. If `detailHtml` does not produce a usable prose paragraph, apply the same paragraph-first extraction and safety truncation rules to `longDescription`.
10. If both sources are missing or empty after normalization, show a short empty-state explanation instead of rendering blank space.

The implementation should use a shared rule-summary extraction utility rather than duplicate or fork the existing full-detail rendering logic. The full details panel remains responsible for rich HTML rendering and long-form rule documentation.

## Data Sources

The inspector should reuse existing finding data where possible:

- `type`, `abbrev`, `category`, `priority`, `rank`, `cweId`
- `location.fullPath`, `location.realSourcePath`, `location.sourceFile`
- `location.startLine`, `location.endLine`
- `className`, `methodName`, `fieldName`
- `detailHtml`, `longDescription`, `helpUri`

No new analysis protocol fields are required for the initial layout.

## Proposed UI Boundary

Keep two layers of detail:

- Compact sidebar inspector (`WebviewView`): fast summary and explicit actions
- Full details panel: rich HTML documentation

This avoids duplicating the same large content in two places while still supporting both quick triage and deeper reading.

## Full Details Panel Behavior

`spotbugs.openFindingDetails` opens or updates the existing full HTML details panel. It should not create a new details panel for every invocation.

- If the details panel already exists, reuse it and update it to the requested finding.
- If the details panel does not exist, create it in an adjacent editor group where possible.
- `Open details` may focus or reveal the details panel because the user explicitly requested deep reading.
- `spotbugs.openFindingDetails` must not reveal source as a side effect.
- `spotbugs.revealFindingSource` remains the only command that opens or focuses the source location.
- Reset, rerun, loading, and filter invalidation clear inspector state but do not automatically close or blank an already opened details panel.
- An already opened details panel is treated as an explicit deep-reading surface. It may continue showing the last opened finding until the user closes it or invokes `Open details` for another finding.
- The details panel must not be used as the source of current inspector selection after results have been reset, rerun, or filtered away.

## Accessibility and Usability Notes

- All inspector actions must remain keyboard reachable.
- The inspector should remain readable in a narrow sidebar width.
- Metadata should be visually scannable and should not rely on color alone.
- Long finding titles, paths, methods, and fields must not resize or overlap inspector actions. Use ellipsis, middle truncation, wrapping, and tooltips according to the field type.
- Empty inspector state should provide a short message such as "Select a finding to inspect it."
- Context menu fallbacks must be available when the inspector is hidden or collapsed.
- The retained-finding state must be visually distinguishable from the normal selected-finding state without relying on color alone.

## Inspector State Lifecycle

The inspector must never show stale finding data. This is a state-management contract, not a requirement to mutate or visually clear VS Code tree selection.

- Initial activation: empty inspector state.
- Leaf finding selection: inspector state becomes that finding.
- Category or pattern selection: inspector keeps the last leaf finding state.
- Analysis start/loading: clear inspector state and show empty state.
- Workspace progress mode: clear inspector state and show empty state.
- Reset results: clear inspector state and show empty state.
- Filter change that removes the inspected finding from the visible result set: clear inspector state and show empty state.
- Filter change that keeps the inspected finding visible: keep inspector state.
- Fresh results after rerun: clear inspector state in v1 rather than attempting best-effort reattachment.

The v1 behavior favors correctness and predictability over selection persistence. It deliberately avoids a TreeView visual-deselection contract because VS Code does not provide a reliable, user-friendly model for this case.

## Implementation Outline

1. Contribute a second native SpotBugs inspector `WebviewView` with id `spotbugs-inspector-view` inside the existing SpotBugs container.
2. Keep the existing results tree as the primary `TreeView` and do not reimplement it in a custom webview.
3. Add an inspector controller that tracks selected finding state independently from the full details panel.
4. Remove finding-leaf primary-click command behavior and drive inspector updates from tree selection events.
5. Split source navigation and full details into `spotbugs.revealFindingSource` and `spotbugs.openFindingDetails`.
6. Migrate the diagnostic `Show SpotBugs details` quick fix to `spotbugs.openFindingDetails`.
7. Add `Go to code` and `Open details` fallback actions to finding leaf context menus.
8. Add command-palette/no-argument handling for the split commands only when a current inspected finding exists.
9. Duplicate top-level toolbar actions on the result tree and inspector view titles, with overflow-safe priority.
10. Add a shared plain-text rule-summary extractor for inspector content.
11. Reuse the existing full details panel instance and update its content for repeated `Open details` requests.
12. Implement `Copy rule id` as copying `finding.patternId`.
13. Keep already opened full details panels stable across reset, rerun, loading, and filter invalidation; update them only on the next explicit `Open details`.
14. Keep current rule-doc rendering code unchanged for the full details panel.
15. Update command registration and activation tests to remove `spotbugs.openBugLocation` and expect the new command IDs.

## Risks

- If the inspector includes too much content, it will become a cramped copy of the full details panel.
- If tree clicks still auto-open source or full details, the split layout loses most of its value.
- If category/pattern selection clears the inspector, normal tree browsing will make the inspector feel unstable.
- If inspector state is tied too tightly to visual tree selection, same-leaf reselection and VS Code-owned selection behavior can create stale or unrecoverable states.
- If toolbar actions remain bound only to `spotbugs-view`, users may lose Analyze/Export/Filter/Reset affordances while focused in the inspector.
- If the inspector is implemented as a passive mirror of the tree with no actions, it will not materially improve triage.
- If the implementation drifts toward a custom webview surface, complexity and accessibility costs rise sharply.

## Regression-Oriented Testing

- Tree leaf single click updates inspector state but does not call source navigation and does not open the full details panel.
- Category and pattern selection keeps the last leaf inspector summary while preserving scoped export behavior.
- Retained inspector state is labeled as `Last inspected finding` when the current tree selection is category or pattern.
- `spotbugs.openBugLocation` is no longer registered or used by tree items, quick fixes, or activation tests.
- `spotbugs.revealFindingSource` reveals source without opening full details.
- `spotbugs.openFindingDetails` opens the existing full details panel without revealing source as a side effect.
- Repeated `spotbugs.openFindingDetails` invocations reuse the existing details panel rather than creating duplicate panels.
- Reset, rerun, loading, and filter invalidation clear inspector state but leave an already opened details panel visible until the user closes it or explicitly opens another finding's details.
- Command-palette/no-argument execution of `spotbugs.revealFindingSource` and `spotbugs.openFindingDetails` works only when a current inspected finding exists and does not target category or pattern selections.
- Command-palette/no-argument execution that acts on a retained finding communicates that the target is the `Last inspected finding`.
- Diagnostic quick fix `Show SpotBugs details` still opens the full details panel through `spotbugs.openFindingDetails`.
- Inspector `Open details` and `Go to code` actions call the correct split commands.
- `Copy rule id` copies `finding.patternId`, not `type` or `abbrev`.
- Loading, analysis start, workspace progress, rerun, reset, and filter invalidation clear inspector state without requiring TreeView visual deselection.
- Filter changes that leave the inspected finding visible do not unnecessarily clear the inspector.
- Top-level Analyze/Export/Filter/Reset actions remain visible from both the result tree view title and inspector view title.
- Inspector title actions remain usable at narrow widths, with lower-priority actions available through overflow if needed.
- Inspector title action labels and tooltips identify the actions as SpotBugs results/container actions, not inspector-local actions.
- Finding leaf context menu includes fallback `Go to code` and `Open details` actions when `viewItem == spotbugs.bug`.
- Existing category/pattern context export remains available and scoped correctly.
- Rule-summary extraction sanitizes HTML, selects only the first meaningful prose paragraph, strips markup and links, normalizes whitespace, applies safety truncation only after structural extraction, falls back to the first `longDescription` paragraph, and shows an empty state for missing text.
- Long title, path, method, and field values remain readable or discoverable via tooltip without overlapping inspector controls.
- Narrow sidebar rendering remains readable in typical VS Code sidebar widths.

## Resolved Review Blockers

- Inspector primitive is explicit: `TreeView` for results plus `WebviewView` for inspector.
- `spotbugs.openBugLocation` can be removed without shim because it is a frontend command, not a backend LS command.
- Tree, quick fix, inspector, and details behavior are split across `spotbugs.revealFindingSource` and `spotbugs.openFindingDetails`.
- Inspector-hidden fallback actions are required on finding leaf context menus.
- The state contract is "clear inspector state" and does not require visual tree deselection.
- Category/pattern selection keeps the last leaf inspector summary while preserving scoped tree semantics.
- Toolbar/menu placement is specified for both view titles.
- Preview content is plain text with explicit sanitization, link removal, whitespace, and truncation rules.
- Layout review polish is captured: retained-state labeling, keyboard fallback discoverability, command-palette target messaging, toolbar overflow priority, container-level toolbar wording, compact rule-summary behavior, long-text behavior, `Copy rule id` value, and details panel reuse/focus/lifecycle behavior.
- Regression testing is oriented around the command split, inspector state lifecycle, toolbar visibility, and tree fallback actions.

## Deferred Non-Blocking Follow-Ups

- Same-pattern occurrence count in the inspector.
- A future `Suppress / Exclude` action slot.
- Optional finding leaf context-menu actions for `Open docs` and `Copy rule id` if users need those while the inspector is hidden.

These follow-ups are not blockers for implementation planning.
