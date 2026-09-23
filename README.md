# Toggle Slicer Visual

A custom Power BI visual: a two-state (on/off) toggle switch that drives a DAX-based filter toggle in Power BI reports. It replaces a standard slicer styled to look like a switch, giving a cleaner, purpose-built end-user control for a pattern that gets reused across multiple reports.

Built by a Health Data Analyst Business Partner at Health New Zealand | Te Whatu Ora, for use in internal Power BI reporting.

## Contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Features](#features)
- [Format pane options](#format-pane-options)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Development](#development)
- [Deployment](#deployment)
- [Further reading](#further-reading)

## Quick start

This walks through going from nothing to a working switch on a report page. It assumes Power BI Desktop and no prior custom-visual experience.

### 1. Get the `.pbiviz` file

If you already have a `.pbiviz` file for this visual, skip to step 2. Otherwise, build it yourself:

```bash
# from a clone of this repo
npm install
npx pbiviz package
```

The packaged file lands in `dist/` as `toggleSlicerVisual.<version>.pbiviz` (the exact name/casing come from `pbiviz.json`'s `visual.name`/`version`, e.g. `toggleSlicerVisual.1.0.0.12.pbiviz` — it changes on every version bump, so don't hardcode it). See [Development](#development) if `pbiviz` isn't installed.

### 2. Import it into your report

In Power BI Desktop:

1. Open (or create) the report you want to add the switch to.
2. In the **Visualizations** pane, click the **···** (ellipsis) → **Import a visual from a file**.
3. Browse to the `.pbiviz` file from step 1 and select it. Dismiss the "custom visuals aren't certified" warning — this is expected for any non-AppSource visual.

The switch icon now appears at the bottom of your Visualizations pane, ready to drag onto the canvas.

### 3. Build the disconnected table and measure

This visual doesn't filter your existing data directly — it drives a small **disconnected** table that the rest of your model reads through a measure. In Power BI Desktop, go to **Modeling → New table** and paste:

```dax
ToggleTable = DATATABLE(
    "Toggle", STRING,
    "Value", INTEGER,
    {
        {"On", 1},
        {"Off", 0}
    }
)
```

Then **Modeling → New measure**:

```dax
ToggleState = SELECTEDVALUE(ToggleTable[Value], 0)
```

Leave `ToggleTable` unrelated to every other table in your model — that's what makes it "disconnected," and it's what lets one switch drive logic anywhere in the report without accidentally filtering unrelated visuals. `ToggleState` is what you'll reference elsewhere, for example inside another measure:

```dax
Sales or Budget =
IF(
    [ToggleState] = 1,
    [Total Sales],
    [Total Budget]
)
```

> The `"On"`/`"Off"` text values are just the convention this README uses — `"True"`/`"False"` and `1`/`0` work too (see [How it works](#how-it-works)). The switch itself always renders **Off** on first load, before anyone has clicked it or a bookmark has applied a selection — it has no way to read `SELECTEDVALUE`'s fallback back out of your measure. Set that fallback (the second argument, `0` above) to whatever value your `ToggleTable` uses for Off, so the rest of your report's default state agrees with what the switch actually starts showing, rather than the other way around.

### 4. Add the switch to the canvas and bind the field

1. Drag the **Toggle Slicer** icon from the Visualizations pane onto the report canvas.
2. With it selected, drag `ToggleTable[Toggle]` from the Fields pane into the visual's **Toggle** field well.
3. The switch should immediately render. If instead you see a validation message, see [Troubleshooting](#troubleshooting).

### 5. Style it from the Format pane

With the visual selected, open the **Format visual** pane (the paint-roller icon) and open the **Toggle Settings**, **Title** and **Size** cards. Every property is listed in [Format pane options](#format-pane-options) below — common first tweaks:

- **Control style** — leave as **Toggle** for a sliding switch, or set to **Checkbox** for a square tick-box look.
- **On colour** / **Off colour** — by default, On follows your report theme's first data colour automatically; set your own to override that.
- **On label** / **Off label** and **Show labels** — turn labels on and relabel them (e.g. "Actual"/"Budget") to match what the switch actually controls.
- **Title text** — give the switch its own heading (e.g. "View by:") without relying on Power BI's native visual title.

### 6. Test it

Click the switch. It should visually flip, and any visual/measure using `[ToggleState]` should update immediately — the same way a native slicer would. Try **Sync slicers** (View → Sync slicers) if you want one switch to control multiple report pages, and check a bookmark you create still restores the switch's position correctly.

### 7. Share it

- **One report, personal use:** nothing further to do — the visual is embedded in the `.pbix` once you've used it.
- **Reuse across reports:** re-import the same `.pbiviz` into each report (steps 2–5), or see [Deployment](#deployment) for publishing it org-wide so it shows up for every report author without a manual import.

## How it works

The visual binds to a single categorical field from a disconnected table in the report's data model — see [step 3](#3-build-the-disconnected-table-and-measure) above for the exact DAX.

Clicking the switch applies a real filter on `ToggleTable[Toggle]` (the same mechanism a native slicer uses, via Power BI's `general.filter` object), so `SELECTEDVALUE(ToggleTable[Value], 0)` — and anything built on it — continues to work unchanged. The bound column's two values don't have to be literally `"On"`/`"Off"` text — `"True"`/`"False"` and `1`/`0` are also accepted (case-insensitive, whitespace-trimmed), so a `BOOLEAN` or `INTEGER` column works too. Because it's a real filter rather than an internal setting, the switch's state persists across saves, survives bookmarks, and can be synced across pages exactly like a native slicer.

## Features

- **Control style** — draw the control as a sliding toggle switch or a checkbox; both share the same colours, border and "Make it fancy!" treatment.
- **Sync slicers** — selection can be synced across report pages via the Sync Slicers pane, same as a native slicer.
- **High contrast** support — substitutes the theme's colours when Power BI's high-contrast mode is active.
- **Keyboard accessible** — focusable, toggles with <kbd>Space</kbd>/<kbd>Enter</kbd>, and its accessible name always states both states and which is current (and matches whichever role — switch or checkbox — is currently drawn).
- **Tooltip** on hover showing the current state.
- **Context menu** (right-click) with the standard Power BI filter/drill options.
- **Bookmarks** — stays in sync when a bookmark, another synced slicer, or "clear all filters" changes the selection.
- **Respects Allow Interactions** — shows a visibly read-only state and ignores input in contexts like Focus mode thumbnails where interactivity is disabled.
- **Responsive** — the switch scales fluidly with the visual's own height between a configurable min/max (or lock it to one fixed size), and labels scale/hide on small tiles.
- **Hover feedback** — a subtle shadow on hover (no movement), off automatically under reduced-motion settings.
- **"Make it fancy!"** (optional) — a raised, glossy skeuomorphic look instead of a flat fill.
- **Landing page** guides report authors who haven't bound a field yet with a copyable step-by-step DAX guide (once the tile's big enough to show it), and a validation message covers a field bound to the wrong shape of data.

## Format pane options

| Property | Description | Default |
|---|---|---|
| Control style | Draw the control as a sliding Toggle switch, or a square Checkbox | Toggle |
| On colour | Fill colour of the switch track when On | Report theme's first data colour, until you pick your own |
| Off colour | Fill colour of the switch track when Off | Grey |
| On label | Text shown next to the switch when On | "On" |
| Off label | Text shown next to the switch when Off | "Off" |
| Show labels | Show the On/Off label text next to the switch when there's room for it | Off |
| Label position | The current-state label to the left or right of the switch (Label left / Label right), or centred above it (Above) | Label left |
| Alignment | Position of the switch+label row within the tile: Left, Right, or Justify (spreads the label and switch to opposite ends). Only shown when Label position is Above — with Label left/right, the row shares its space with the title, whose own Alignment (below) governs it instead | Left |
| Label spacing | Space in pixels between the switch and its label(s) | 8px |
| Label font | Family/size/bold/italic/underline of the On/Off label text | Segoe UI, 12px, regular |
| Label font colour | Colour of the On/Off label text | Dark grey |
| Show switch background | Fill a background behind the switch and its label(s). Separate from Power BI's own native General → Background, which every visual gets automatically | Off |
| Switch background colour | Fill colour behind the switch and its label(s), when Show switch background is on | White |
| Show border | Show a coloured border around the switch track | Off |
| Border colour | Colour of the switch track's border, when Show border is on | Dark grey |
| Border width | Width in pixels of the switch track's border, when Show border is on | 2px |
| Make it fancy! | Give the switch a raised, glossy look with shading and shadows instead of a flat fill | Off |
| Title text | Static heading text this visual renders itself, positioned beside or above the switch (separate from Power BI's own native visual title) | "Toggle label" |
| Title position | Before the switch (Inline left), after it (Inline right), or centred above it (Above) | Inline left |
| Title alignment | Position of the title+switch group within the tile: Left, Right, or Justify (spreads the title and switch to opposite ends) | Left |
| Title spacing | Space in pixels between the switch and the title | 8px |
| Title font | Family/size/bold/italic/underline of the title text | Segoe UI, 14px, bold |
| Title font colour | Colour of the title text | Dark grey |
| Size mode | Scale fluidly between Min/Max height as the tile is resized (Responsive), or lock to one Fixed height (Fixed) | Responsive |
| Min height | Smallest height in pixels the switch scales down to, in Responsive mode. Width always follows at a fixed 2:1 ratio | 16px |
| Max height | Largest height in pixels the switch scales up to, in Responsive mode. Width always follows at a fixed 2:1 ratio | 22px |
| Fixed height | Exact height in pixels the switch is drawn at, in Fixed mode, regardless of tile size. Width always follows at a fixed 2:1 ratio | 22px |

The two font properties' defaults are a static approximation of a typical report theme, not a live readout of one — Power BI gives custom visuals no way to read the report's actual chosen typography (unlike colour, where `On colour`'s default *does* follow the theme's first data colour). If you turn on `Show switch background` and still see a fill behind the switch after turning it back off, check Format → General → Background — that's Power BI's own native background, present on every visual and entirely separate from this one.

## Troubleshooting

**I see an info icon and "Select or drag a field to populate this visual" instead of a switch.**
No field is bound to the **Toggle** data role yet — drag `ToggleTable[Toggle]` (or your own equivalent field) into it. Resize the tile larger and a copyable starter-DAX guide appears alongside the hint if you need to build the table/measure from scratch.

**I see a message saying the field must contain exactly one On row and one Off row.**
The bound field is either not shaped correctly, or filtered/related in a way that changes what rows reach the visual. It needs to resolve to **exactly two rows**, one matching an On alias (`"On"`, `"true"`, or `"1"`, case-insensitive) and one matching an Off alias (`"Off"`, `"false"`, or `"0"`). Mixing conventions across the two rows (e.g. `"On"` / `"0"`) is fine; three rows, zero rows, or two rows that are both "On"-shaped is not.

**Clicking the switch doesn't do anything.**
Check **Format → General → Edit interactions**/**Allow interactions** isn't disabled for this visual, and that you're not viewing a Focus-mode thumbnail or an export/embed context where interactivity is intentionally turned off — the switch shows a visibly read-only state (default cursor, reduced opacity) in these cases.

**The switch doesn't visually match the measure on first load.**
The switch always renders Off on first load, specifically because no filter has been applied yet — it has no way to read `SELECTEDVALUE(ToggleTable[Value], 0)`'s fallback value back out of your measure, so changing that fallback doesn't change what the switch shows. The dependency runs the other way: make sure the fallback you choose (the second argument) is whatever value your `ToggleTable` uses for Off, so the rest of your model's default state agrees with the switch's fixed starting position instead of contradicting it.

**I turned on "Show switch background" but nothing changed.**
Every Power BI visual — native or custom — also has its own separate background under Format → General → Background. "Show switch background" only controls a fill directly behind the switch and its labels; check you're not looking at the native one instead.

**A custom On colour/border/font isn't showing.**
Windows High Contrast mode overrides custom colours with the active theme's palette for legibility — this is intentional and matches how native visuals behave under high contrast.

## Roadmap

### Vertical orientation and more than two states (planned)

Goal: let the switch render as a vertical slider, and support more than two discrete states (e.g. Off/Mid/On, or 1/2/3/4) instead of only a binary On/Off — while keeping today's simple two-state horizontal switch working exactly as it does now, unchanged, as the default.

This is a bigger change than the Format-pane options above and touches the data contract, not just styling, so it needs its own design pass before starting. Rough shape of the work:

1. **Data role / validation** — `update()`'s current rule ("exactly one On row and one Off row") only makes sense for two states. Multi-state needs an explicit **ordering** for the bound field's rows (DAX categorical order isn't guaranteed to match the intended sequence), most likely a required sort/rank so `capabilities.json`'s `dataReductionAlgorithm` and the validation logic can agree on "row N = state N" rather than matching against `ON_VALUES`/`OFF_VALUES` string aliases. The existing two-state `ToggleTable` pattern (`"On"`/`"Off"`, `1`/`0`) should keep working as the N=2 case of whatever this becomes, not be replaced by it.
2. **Interaction model** — a single click no longer means "flip the only other state." Options to weigh: click advances to the next state and wraps around; clicking a position along the track jumps straight to the nearest stop (more slider-like, probably the better fit for a vertical multi-state control); keyboard arrow keys step between stops either way. `handleToggleClick()`'s current clear-then-select-the-other-row logic needs to generalize to "select whichever stop was chosen," and the `isToggling` race guard still applies.
3. **Rendering** — a new `Orientation` property (Horizontal default, Vertical) rotates the track/knob axis; the knob's offset generalizes from today's binary `0` or `trackWidth - trackHeight` to `stopIndex / (stateCount - 1) * (trackLength - knobSize)` along whichever axis is active. Evenly-spaced stops, not arbitrary positions, to start.
4. **Labels** — `onLabel`/`offLabel` becomes a per-state list. The existing `labelPosition: "above"` behavior (show only the current state's label, centred) generalizes cleanly to N states without a redesign; the `"inline"` (flanking) behavior does not, and needs its own treatment (labels/tick marks alongside each stop) or could simply be unsupported once state count > 2.
5. **Scope for a first pass** — rather than an arbitrary N, constrain the first version to a small fixed choice (e.g. 3 or 4 states as explicit Format-pane slots, similar to today's `onColor`/`offColor` pair extended) rather than a fully dynamic list, since `formattingSettings` doesn't have a built-in repeatable-list editor to lean on.

None of this is scheduled work yet — it's here so the shape of the problem (and the parts of the current design it would need to change) isn't lost before someone picks it up.

## Development

Requires Node.js and the [Power BI visuals tools](https://www.npmjs.com/package/powerbi-visuals-tools) (`pbiviz`).

```bash
# install deps
npm install

# local dev server with live reload (test via Power BI's Developer Visual)
pbiviz start

# package for import / distribution
pbiviz package
```

The packaged `.pbiviz` lands in `dist/`. See [CLAUDE.md](CLAUDE.md) for the visual's architecture, implementation notes, and conventions in more depth.

## Deployment

- **Personal/local use:** `pbiviz package`, then import the `.pbiviz` file directly into a report (Visualizations pane → Import from file) — see [Quick start](#quick-start) for the full walkthrough.
- **Org-wide reuse:** publish to Te Whatu Ora's organizational visuals via the Power BI admin portal, so it appears in every report author's Visualizations pane without a manual import. As an uncertified custom visual (runs arbitrary JS in the report), this will likely need sign-off from the Power BI admin/security team before it's available outside personal tenant testing.

## Further reading

Background on the underlying platform, from Microsoft Learn:

- [Power BI visual project structure](https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure)
- [Capabilities](https://learn.microsoft.com/en-us/power-bi/developer/visuals/capabilities)
- [Data view mappings](https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings)
- [Landing page](https://learn.microsoft.com/en-us/power-bi/developer/visuals/landing-page)
- [High contrast support](https://learn.microsoft.com/en-us/power-bi/developer/visuals/high-contrast-support)
- [Add tooltips](https://learn.microsoft.com/en-us/power-bi/developer/visuals/add-tooltips)
- [Context menu](https://learn.microsoft.com/en-us/power-bi/developer/visuals/context-menu)
- [Localization](https://learn.microsoft.com/en-us/power-bi/developer/visuals/localization)
- [Guidelines for publishing Power BI custom visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/guidelines-powerbi-visuals) (commercial marketplace/AppSource specifics — not applicable to this internal visual, but useful if that ever changes)
