# Support: Toggle Slicer

## Get help

- **Questions and bugs:** open an issue at <https://github.com/flintstrike-nz/toggle-group/issues>.
- **Email:** hayden@flintstrike.co.nz

When you report a problem, it helps to include:

1. What you expected and what happened (a screenshot is ideal).
2. The visual's version (shown in Power BI's **Manage visuals**, or in `pbiviz.json`).
3. Whether you're in Power BI Desktop or the Power BI service, and its version.
4. The DAX for your toggle table and measures, and how many columns are bound to **Toggles**.
5. Which Format pane options are on (control style, Only one active, Master switch, Group enable).

## Quick fixes

**The visual shows "Drag an On/Off column into Toggles".** Nothing is bound to **Toggles** yet. Drag a column in. The setup guide on that placeholder has copyable DAX (make the visual larger to see it).

**It says a field must contain exactly one On value and one Off value.** The message names the column. Each toggle column must hold exactly two values: one of `On`, `True` or `1`, and one of `Off`, `False` or `0` (case doesn't matter).

**Clicking does nothing / everything is greyed out.** If a Group enable toggle is shown at the top, it is Off. Switch it On. Also check the visual isn't in a read-only view (a Focus mode thumbnail or some embedded views).

**My measure doesn't match the toggle on first load.** Every toggle starts Off (Group enable starts On) until clicked. Compare to `"On"` in your measure (`SELECTEDVALUE('Table'[Column]) = "On"`) instead of relying on `SELECTEDVALUE`'s fallback argument.

**A custom color or font doesn't show.** Windows High Contrast mode overrides custom colors for legibility.

The [README](README.md) has full setup steps, the DAX patterns, and a troubleshooting section.

## Supported environments

Power BI Desktop and the Power BI service, in a current browser. The visual needs no gateway, add-ins or network access.

## Response

This visual is maintained by an individual publisher, on a best-effort basis. There is no guaranteed response time.
