# Copilot instructions for toggle-slicer-visual

This is a Power BI custom visual (powerbi-visuals-api SDK): a toggle switch that drives a
disconnected-table slicer selection via SelectionManager. Read [CLAUDE.md](../CLAUDE.md) before
reviewing - it documents several intentional decisions that are not bugs:

- `tsconfig.json` intentionally omits `strict` — enabling it breaks the SDK's generated
  `visualPlugin.ts` wrapper, which passes an optional `options?` into a required-options
  constructor.
- The `toggle` role's `dataReductionAlgorithm` is capped at 100, not 2, on purpose.
- `toggleSettings.onLabel`/`offLabel` values (and placeholders) are deliberately NOT
  localized — they're per-report Format-pane text, not fixed visual chrome.
- `capabilities.json`'s own `displayName`/`description` strings are a non-localizable
  schema declaration; `settings.ts`'s `displayNameKey`/`descriptionKey` is what actually
  renders in the Format pane.
- The landing page's skeleton preview is decorative with no real state to track — it
  doesn't need to reference `--toggle-on-color`/`--toggle-off-color`.

When reviewing, prioritize:
- Async correctness around `SelectionManager.select()`/`clear()` — race conditions on rapid
  interaction, unhandled rejections, optimistic state flips that outrun the awaited call.
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
