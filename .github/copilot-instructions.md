# Copilot instructions for toggle-slicer-visual

This is a Power BI custom visual (powerbi-visuals-api SDK): a group of on/off toggles, one per
bound field, each driving its own disconnected-table filter via `host.applyJsonFilter()` (one
basic filter per field, all persisted together in `general.filter`). Read [CLAUDE.md](../CLAUDE.md) before
reviewing - it documents several intentional decisions that are not bugs:

- `tsconfig.json` intentionally omits `strict` — enabling it breaks the SDK's generated
  `visualPlugin.ts` wrapper, which passes an optional `options?` into a required-options
  constructor.
- The `toggle` role's `dataReductionAlgorithm` is capped at 10000, not 2 per field, on purpose -
  fields from unrelated tables arrive cross-joined (2^N rows), and a mis-bound field must still
  surface its extra values to fail validation.
- `toggleSettings.onLabel`/`offLabel` values (and placeholders) are deliberately NOT
  localized — they're per-report Format-pane text, not fixed visual chrome.
- `capabilities.json`'s own `displayName`/`description` strings are a non-localizable
  schema declaration; `settings.ts`'s `displayNameKey`/`descriptionKey` is what actually
  renders in the Format pane.
- The landing page's skeleton preview is decorative with no real state to track — it
  doesn't need to reference `--toggle-on-color`/`--toggle-off-color`.

When reviewing, prioritize:
- Group-rule correctness in `handleClick()` — every click must write the *whole* group's filter
  array (general.filter holds one array for the visual), Only one active must leave at most one
  child On, and rows disabled by Group enable must stay inert without losing their state.
- Every user-facing string routed through `ILocalizationManager` or
  `FormattingSettingsService`'s `displayNameKey`/`descriptionKey` — flag literal English
  strings introduced in `visual.ts`/`settings.ts`.
- High-contrast support: new colours in `visual.ts`/`visual.less` should reference the
  `--toggle-*-color` CSS custom properties (set from `applyColors()`), not hardcoded hex,
  unless explicitly decorative.
- `ITooltipService.show`/`move`/`hide` calls should derive `isTouchEvent` consistently
  within one interaction, not mix a dynamic value in some calls with a hardcoded one in others.

Don't suggest: enabling TypeScript `strict` mode, localizing the `onLabel`/`offLabel`
property values, or making the landing page skeleton colour-aware.
