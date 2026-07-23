# LeanClaw reference UI design QA

## Comparison target

- Source visual truth: `/var/folders/4c/9wk1tlwj6yn003zb6r964zth0000gn/T/codex-clipboard-51b1cf76-6442-4d59-ac54-b70d33ade741.png`
- Implementation screenshot: `.omx/state/reference-ui/implementation-v1.png`
- Full-view comparison: `.omx/state/reference-ui/comparison-v2.png`
- Focused sidebar comparison: `.omx/state/reference-ui/focus-sidebar-v1.png`
- Focused board comparison: `.omx/state/reference-ui/focus-board-v1.png`
- Additional implementation states:
  - `.omx/state/reference-ui/home-v1.png`
  - `.omx/state/reference-ui/task-workspace-v1.png`

## Viewport and normalization

- Source pixels: `4096 × 1915`; the source is a macOS Retina capture, treated as approximately `2048 × 957.5 CSS px` at device scale factor 2.
- Implementation pixels: `4096 × 1582`; Electron content width is `2048 CSS px` at device scale factor 2. The physical test display limits the visible content height to `791 CSS px`.
- Full-view normalization: the source was cropped from the north edge to `4096 × 1582`; neither side was rescaled. This keeps typography, column width, sidebar width, card density, and device density directly comparable.
- State: light theme, task-board view. The source contains representative third-party issues; LeanClaw contains one waiting-for-approval task and one delivered task.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: passed. The SF Pro/PingFang system stack, compact page title, medium-weight navigation, small metadata, and stronger two-line card titles match the source hierarchy without copying its brand typography.
- Spacing and layout rhythm: passed. The fixed muted sidebar, two-level top toolbar, horizontal board, `270px` columns, compact column headers, card padding, restrained radii, and independent column scrolling reproduce the source density at the normalized Retina scale.
- Colors and visual tokens: passed. Neutral warm grays, thin borders, white cards, low-saturation semantic column backgrounds, and minimal shadows match the source's low-noise surface treatment. Each LeanClaw runtime state has a distinct semantic token.
- Image quality and asset fidelity: passed. The sidebar uses LeanClaw's real `resources/icon.png`; no placeholder or handcrafted brand asset was introduced. Reference-product navigation icons were intentionally not copied because LeanClaw has no approved icon dependency or equivalent feature set.
- Copy and content: passed. Issue-specific labels, FIR identifiers, agent brands, avatars, and promotional content were replaced with LeanClaw task IDs, project names, model/tool activity, local-runtime status, and privacy messaging.
- Interaction and accessibility: passed. Home, task creation, approval, delivered state, sidebar navigation, list/board switching, filter controls, and horizontal board overflow were exercised through Electron Playwright. Buttons retain semantic accessible names used by existing workflows.

## Comparison history

### Baseline

- Evidence: `.omx/state/reference-ui/baseline-tasks-board.png`
- [P1] The old board had no column surfaces, status color hierarchy, empty states, or card-oriented information structure.
- [P1] The old sidebar was an undifferentiated English link list without brand, grouping, counts, search entry, or runtime status.
- [P2] The old task header and view controls floated in a large unstructured canvas, unlike the reference's fixed two-level toolbar.

### Fixes made

- Rebuilt the shell around a branded, grouped, fixed sidebar and compact fixed topbar.
- Added task counts, command search, new-task entry, local-runtime status, and privacy context.
- Added a toolbar with filter chips and list/board control.
- Converted the board into horizontally scrollable, runtime-backed semantic columns with independent vertical bodies.
- Enriched task cards with LeanClaw IDs, progress, project context, and model/tool activity.
- Unified shared surface, border, radius, shadow, typography, and semantic color tokens across Home, Tasks, and task detail.

### Post-fix evidence

- Full and focused comparisons show the same UI category, density, surface hierarchy, column rhythm, and card treatment.
- Visual verdict: `91/100`, category match `true`, threshold passed.
- Remaining differences are intentional product mappings: five runtime-backed LeanClaw states instead of decorative issue states, text navigation instead of copied third-party icons, and execution metadata instead of assignee avatars.
- A second capture after the accessible-name fix showed no visual change; the Projects form and reference UI E2E tests both passed.

## Primary interactions and runtime checks

- Electron E2E: create task → approve → deliver.
- Electron E2E: create second task → wait for approval.
- Electron E2E: navigate to Tasks → switch to board → verify five columns and horizontal overflow.
- Renderer console errors: none.
- Renderer page errors: none.

## Adversarial probe

- Window: minimum supported `900 × 600`.
- Input: a long mixed Chinese/English task title repeated eight times.
- Result: toolbar remained inside the viewport, board horizontal overflow remained reachable, the `270px` status column retained its width, the card stayed inside the column, the title remained clamped to two lines, and no renderer console/page error occurred.
- Evidence: `.omx/state/reference-ui/adversarial-small-window.png`.

## Follow-up polish

- P3: add navigation icons only after choosing an approved icon source or introducing an explicit dependency.
- P3: add human/agent ownership metadata only when the runtime has a real ownership model.

final result: passed
