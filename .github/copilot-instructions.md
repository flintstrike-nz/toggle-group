# Copilot instructions for toggle-slicer

This is a Power BI custom visual (powerbi-visuals-api SDK): On/Off slicers drawn as switches, checkboxes
or radio buttons - one toggle, or a group of up to 12 - one per column of a single disconnected group
table (built with CROSSJOIN so it holds every On/Off combination), each column filtered via
`host.applyJsonFilter()` (one basic filter per column, all persisted together in `general.filter`).
Read [CLAUDE.md](../CLAUDE.md) before reviewing - it documents several intentional decisions that are
not bugs:

- `tsconfig.json` intentionally omits `strict` — enabling it breaks the SDK's generated
  `visualPlugin.ts` wrapper, which passes an optional `options?` into a required-options
  constructor.
- The `toggle` role's `dataReductionAlgorithm` is capped at 10000, not 2 per field, on purpose -
  the group table's columns arrive as every combination (2^N rows), and a mis-bound field must still
  surface its extra values to fail validation.
- `stateLabels.onText`/`offText` values (and placeholders) are deliberately NOT
  localized — they're per-report Format-pane text, not fixed visual chrome.
- `capabilities.json`'s own `displayName`/`description` strings are a non-localizable
  schema declaration; `settings.ts`'s `displayNameKey`/`descriptionKey` is what actually
  renders in the Format pane.
- The landing page's skeleton preview is decorative with no real state to track — it
  doesn't need to reference `--toggle-on-color`/`--toggle-off-color`.
- `npm audit` findings inside `powerbi-visuals-tools`' dev-server chain can't be fixed from this
  repo (see CLAUDE.md, Build & Dev Commands).

When reviewing, prioritize:
- Group-rule correctness in `handleClick()` — every click must write the *whole* group's filter
  array (general.filter holds one array for the visual), Only one active must leave at most one
  child On, and rows disabled by Group enable must stay inert without losing their state.
- Every user-facing string routed through `ILocalizationManager` or
  `FormattingSettingsService`'s `displayNameKey`/`descriptionKey` — flag literal English
  strings introduced in `visual.ts`/`settings.ts`.
- `settings.ts`, `capabilities.json` and the resjson staying in step (same object and property names,
  every key present), and no object/property renamed once the visual is published.
- High-contrast support: new colours in `visual.ts`/`visual.less` should reference the
  `--toggle-*-color` CSS custom properties (set from `applyColors()`), not hardcoded hex,
  unless explicitly decorative.
- `ITooltipService.show`/`move`/`hide` calls should derive `isTouchEvent` consistently
  within one interaction, not mix a dynamic value in some calls with a hardcoded one in others.
- Certification rules: no `fetch`/`XMLHttpRequest`/`eval`/`innerHTML`, no web-access privileges.

Don't suggest: enabling TypeScript `strict` mode, localizing the `onText`/`offText`
property values, or making the landing page skeleton colour-aware.
