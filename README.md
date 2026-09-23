# Toggle Group Visual

A custom Power BI visual: a **group of on/off toggles**, one per field, each driving its own DAX-readable filter. Draw them as sliding switches, checkboxes or radio buttons, box them in a flat, embossed or gutter border, and give the group rules: **Only one active**, a **Master switch**, and a **Group enable** toggle that greys out the rest. It replaces a stack of standard slicers styled to look like switches, giving report users a cleaner, purpose-built control for a pattern that gets reused across many reports.

Built by a Health Data Analyst Business Partner at Health New Zealand | Te Whatu Ora, for use in internal Power BI reporting.

## Contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Tables and bridges](#tables-and-bridges)
- [Group rules](#group-rules)
- [Features](#features)
- [Format pane options](#format-pane-options)
- [Troubleshooting](#troubleshooting)
- [Upgrading from the single Toggle Slicer](#upgrading-from-the-single-toggle-slicer)
- [Roadmap](#roadmap)
- [Development](#development)
- [Deployment](#deployment)
- [Further reading](#further-reading)

## Quick start

This walks through going from nothing to a working toggle group on a report page. It assumes Power BI Desktop and no prior custom-visual experience.

### 1. Get the `.pbiviz` file

If you already have a `.pbiviz` file for this visual, skip to step 2. Otherwise, build it yourself:

```bash
# from a clone of this repo
npm install
npx pbiviz package
```

The packaged file lands in `dist/` as `toggleSlicerVisual.<version>.pbiviz` (the exact name comes from `pbiviz.json`'s `visual.name`/`version` and changes on every version bump, so don't hardcode it). See [Development](#development) if `pbiviz` isn't installed.

### 2. Import it into your report

In Power BI Desktop:

1. Open (or create) the report you want to add the toggles to.
2. In the **Visualizations** pane, click the **···** (ellipsis) → **Import a visual from a file**.
3. Browse to the `.pbiviz` file from step 1 and select it. Dismiss the "custom visuals aren't certified" warning — this is expected for any non-AppSource visual.

The **Toggle Group** icon now appears at the bottom of your Visualizations pane.

### 3. Build one small table per toggle

Each toggle is its own tiny **disconnected** table. The table's *column name* becomes the toggle's name in the visual, so give it a readable, sentence-case name. **Modeling → New table**:

```dax
Show Budget = DATATABLE(
    "Show budget", STRING,
    "Value", INTEGER,
    {
        {"On", 1},
        {"Off", 0}
    }
)
```

Then **Modeling → New measure** that reads it:

```dax
Show Budget State = SELECTEDVALUE('Show Budget'[Value], 0)
```

Repeat for each toggle you want in the group (e.g. `Include ED`, `Exclude Outliers`). Use `[Show Budget State]` anywhere else in the model, e.g.:

```dax
Sales or Budget =
IF(
    [Show Budget State] = 1,
    [Total Budget],
    [Total Sales]
)
```

> `"On"`/`"Off"` is just the convention used here — `"True"`/`"False"` and `1`/`0` work too, and each toggle is checked independently, so one group can mix conventions. Every toggle renders **Off** until someone clicks it (or a bookmark applies a state), so set each measure's `SELECTEDVALUE` fallback (the `0` above) to your Off value. See [Tables and bridges](#tables-and-bridges) if a toggle needs to filter real data through relationships instead of a measure.

### 4. Add the visual and bind the fields

1. Drag the **Toggle Group** icon onto the report canvas.
2. Drag your first toggle's column (e.g. `'Show Budget'[Show budget]`) into the **Toggles** field well. The toggle appears straight away, and **a new empty slot appears below it** in the well, ready for the next one.
3. Keep dragging columns in — one per toggle, up to 12. Rows render in the order they sit in the well; drag within the well to reorder them.
4. To rename a toggle for this visual only, use **Rename for this visual** on the field in the well.
5. *(Optional)* Drag a Group enable column into **Group enable** — see [Group rules](#group-rules).

If you see a validation message instead, see [Troubleshooting](#troubleshooting).

### 5. Set the rules and style

With the visual selected, open the **Format visual** pane. The cards are listed in [Format pane options](#format-pane-options). Common first tweaks:

- **Group rules → Only one active / Master switch** — see [Group rules](#group-rules).
- **Toggle Settings → Control style** — **Toggle**, **Checkbox**, or **Radio**. Radio pairs naturally with Only one active.
- **Container → Border style** — **Flat**, **Embossed** (raised) or **Gutter** (recessed).
- **Toggle Settings → Make it fancy!** — glossy, raised toggles for any control style.
- **Title → Title text** — a heading for the group (e.g. "Budget options").

### 6. Test it

Click each toggle; any visual using its measure should update immediately, the same as with a native slicer. Check that a bookmark restores every toggle's state, and try **View → Sync slicers** if one group should control several pages.

### 7. Share it

- **One report, personal use:** nothing further to do — the visual is embedded in the `.pbix` once you've used it.
- **Reuse across reports:** re-import the same `.pbiviz` into each report, or see [Deployment](#deployment) for publishing it org-wide.

## How it works

Each field in the **Toggles** well is one toggle. Clicking a toggle writes a real slicer-style filter on that field's column (the same `general.filter` mechanism a native slicer uses). The visual keeps **one basic filter per field**, `'Show Budget'[Show budget] IN {"On"}` or `IN {"Off"}`, and always writes the whole group's set at once. So:

- `SELECTEDVALUE('Show Budget'[Value], 0)` — and anything built on it — reads each toggle exactly like a slicer.
- State persists across saves, survives bookmarks, and can be synced across pages.
- A toggle that's Off applies its **Off** value rather than clearing its filter, so bridge tables can map Off to "everything" (see below).

Fields from separate tables reach the visual cross-joined (every combination of every field's values), so the visual de-duplicates each column on its own and checks each one has exactly one On value and one Off value. That cross join is also why a group is capped at 12 toggles: 2¹² combinations is still a trivially small query, but it doubles with every field added.

If you remove a field from the well, its filter would otherwise stay applied invisibly. The visual rewrites the filter set on its next update to drop it.

## Tables and bridges

Moving from one switch to a group changes the recommended model from "one `ToggleTable` per report" to **"one small table per toggle"**. This is deliberate: separate tables are what let each toggle filter independently. Putting several On/Off columns in one table would need a row for every combination, and a filter on one column would silently constrain the others.

### Pattern A — measure-driven (recommended)

One disconnected table + one measure per toggle, exactly as in [Quick start](#3-build-one-small-table-per-toggle). Nothing relates to the rest of the model, and measures decide what each toggle means. This supports every group rule, including Group enable.

### Pattern B — bridge-driven (filter real data through relationships)

Use this when a toggle should filter a dimension directly, e.g. "Show budget-holding cost centres only". Each toggle gets its own bridge that maps **On → the subset** and **Off → every member**:

```dax
Bridge Show Budget =
UNION(
    SELECTCOLUMNS(
        FILTER('Cost Centre', 'Cost Centre'[Has Budget]),
        "Toggle", "On", "Cost Centre Key", 'Cost Centre'[Cost Centre Key]
    ),
    SELECTCOLUMNS(
        'Cost Centre',
        "Toggle", "Off", "Cost Centre Key", 'Cost Centre'[Cost Centre Key]
    )
)
```

Relationships:

- `'Show Budget'[Show budget]` (one) → `'Bridge Show Budget'[Toggle]` (many), single direction.
- `'Bridge Show Budget'[Cost Centre Key]` (many) → `'Cost Centre'[Cost Centre Key]` (one), **both directions**, so the filter can flow from the bridge up to the dimension.

With several bridged toggles on the same dimension, their filters **intersect** (AND): each On toggle narrows the dimension further, and each Off toggle leaves it untouched. Combined with **Only one active**, that gives a "pick one lens" control: exactly one subset applies at a time, or none.

> **Group enable with bridges:** switching Group enable Off greys the toggles out but does *not* remove their filters, because the toggles keep their state by design. Bridge filters therefore keep applying while the group is disabled. If disabling the group has to neutralise the toggles, use Pattern A and gate the measures (below).

### Group enable table

Build it like any other toggle table, but give its measure a fallback of **1**, because Group enable renders **On** until someone first switches it Off (so a new group isn't born disabled):

```dax
Group Enable = DATATABLE(
    "Budget options enabled", STRING,
    "Value", INTEGER,
    {
        {"On", 1},
        {"Off", 0}
    }
)

Show Budget Active =
IF(
    SELECTEDVALUE('Group Enable'[Value], 1) = 1,
    [Show Budget State],
    0
)
```

## Group rules

All in the **Group rules** card, except Group enable, which comes from binding a field.

| Rule | What it does |
|---|---|
| **Only one active** | Turning a toggle On turns every other toggle Off. Turning the active one Off leaves none On — except with the **Radio** control style, where (like a native radio group) the active option can't be clicked Off. |
| **Master switch** | Adds a master toggle at the top; the rest are indented by **Indent** px. Master On/Off sets every toggle below it On/Off. It shows **On** when all are On, **Off** when none are, and **mixed** (a dash on the checkbox; a half-way knob on the toggle) when only some are. Clicking a mixed master turns them all On. It has no field of its own. Under Only one active, "all On" isn't allowed, so the master reads On when *any* toggle is On, and switching it On selects the first toggle. |
| **Group enable** | Bind an On/Off field to the **Group enable** well. It's drawn as a header toggle at the very top, and everything below it (master included) is indented. Switching it Off **disables** the toggles below it — greyed out, not clickable, out of the tab order — **without changing their state**. Because it's a real field, DAX can read it (see [Group enable table](#group-enable-table)). |

Master switch and Group enable can be combined: Group enable at the top, master below it, toggles below that, each level indented. Under the **Radio** style, header rows (master, Group enable) are drawn as checkboxes, since they aren't one of the mutually exclusive options.

## Features

- **Dynamic field well** — drop in a field and a new empty slot appears below it; one toggle row per field, up to 12.
- **Three control styles** — sliding **Toggle**, square **Checkbox** or round **Radio**. All three share the same colours, border, sizing and "Make it fancy!" treatment.
- **Group rules** — Only one active, Master switch (with mixed state), and Group enable (disable without resetting).
- **Container border** — None, Flat, Embossed or Gutter, with colour, width, corner radius, padding and optional fill.
- **Aligned layout** — names and toggles line up in columns, with names on either side and Left/Right/Justify alignment.
- **Sync slicers**, **bookmarks** and **persisted state** — every toggle's state is a real filter.
- **Keyboard accessible** — <kbd>Space</kbd>/<kbd>Enter</kbd> toggle, arrow keys and <kbd>Home</kbd>/<kbd>End</kbd> move between rows, and an exclusive radio group is a single Tab stop. Each control's accessible name includes its toggle name and current state, and its role matches what's drawn (switch, checkbox or radio).
- **Clickable names** — clicking a toggle's name toggles it, like a native label.
- **High contrast** — theme colours replace custom colours when Power BI's high-contrast mode is active.
- **Tooltip** and **context menu** per toggle.
- **Respects Allow Interactions** — read-only state where interactivity is disabled.
- **Responsive** — toggles scale with the tile's height shared across the rows (between a configurable min/max), or lock to a fixed size; state labels hide on narrow tiles.
- **Landing page** with a skeleton preview and a copyable starter-DAX guide; a validation message names any field that isn't a valid On/Off pair.

## Format pane options

### Group rules

| Property | Description | Default |
|---|---|---|
| Only one active | Turning a toggle On turns every other toggle Off | Off |
| Master switch | Add a master toggle at the top that turns every toggle On/Off | Off |
| Master label | Name shown next to the master toggle (only while Master switch is on) | "All" |
| Indent | Pixels each level is indented below a master or Group enable toggle | 16px |
| Row spacing | Space in pixels between rows | 8px |

### Toggle Settings

| Property | Description | Default |
|---|---|---|
| Control style | Toggle switch, Checkbox, or Radio button | Toggle |
| On colour | Fill of each toggle when On | Report theme's first data colour, until you pick your own |
| Off colour | Fill of each toggle when Off | Grey |
| On label / Off label | State text shown next to a toggle when On/Off | "On" / "Off" |
| Show labels | Show the On/Off state text next to each toggle | Off |
| Label position | State text left or right of each toggle (Label left / Label right), or above it (Above) | Label left |
| Label spacing | Space in pixels between a toggle and its state text | 8px |
| Font / Font colour | Typography of the state text | Arial, 12px, bold / Dark blue |
| Show border / Border colour / Border width | A coloured ring around each toggle's track | Off / Dark grey / 2px |
| Make it fancy! | Raised, glossy look with shading and shadows | Off |

### Toggle names

| Property | Description | Default |
|---|---|---|
| Show names | Show each toggle's name (its field's display name — rename it in the well) | On |
| Name position | Name to the Left or Right of its toggle | Left |
| Alignment | Pack names and toggles to the Left or Right, or Justify them to opposite edges | Left |
| Name spacing | Space in pixels between a name and its toggle | 8px |
| Font / Font colour | Typography of the names | Segoe UI, 12px / Near-black |

### Container

| Property | Description | Default |
|---|---|---|
| Border style | None, Flat (a plain line), Embossed (raised) or Gutter (recessed) | None |
| Border colour / Border width | Colour and width of the group's border (shown when a style is chosen) | Light grey / 1px |
| Corner radius | Roundness of the group's corners | 4px |
| Padding | Space between the border and its contents | 8px |
| Vertical alignment | Top, Middle or Bottom of the tile | Middle |
| Show group background / Group background colour | Fill inside the container. Separate from Power BI's native General → Background | Off / White |

### Title

| Property | Description | Default |
|---|---|---|
| Title text | Heading this visual renders itself (separate from Power BI's native visual title). Clear it to hide | "Toggle group" |
| Title position | Above the group, or before/after it (Inline left / Inline right) | Above |
| Alignment | Left, Right, or Justify (title and group to opposite ends) | Left |
| Title spacing | Space in pixels between the title and the group | 8px |
| Font / Font colour | Typography of the title | Segoe UI, 14px, bold / Dark grey |

### Size

| Property | Description | Default |
|---|---|---|
| Size mode | Responsive (scale with the tile's height, shared across rows) or Fixed | Responsive |
| Min height / Max height | Bounds of each toggle's height in Responsive mode | 16px / 22px |
| Fixed height | Each toggle's exact height in Fixed mode | 22px |

Width always follows height: 2:1 for the Toggle style, 1:1 for Checkbox and Radio. The font defaults are static — Power BI gives custom visuals no way to read the report theme's typography (unlike colour, where On colour follows the theme).

## Troubleshooting

**I see "Drag one field per toggle into Toggles to build the group".**
Nothing is bound to **Toggles** yet (a Group enable field on its own isn't enough). Resize the tile larger to reveal a copyable starter-DAX guide.

**I see a message saying a field must contain exactly one On row and one Off row.**
The message names the field. It must resolve to exactly two values, one On-shaped (`"On"`, `"true"`, `1`, case-insensitive) and one Off-shaped (`"Off"`, `"false"`, `0`). The usual cause is binding a real column (e.g. Region), or putting several toggles' columns in one table so their values multiply. Give each toggle its own table.

**Clicking a toggle does nothing / it's greyed out.**
If there's a Group enable toggle at the top, it's Off — switch it On. Otherwise check the visual isn't in a read-only context (Focus mode thumbnail, some embeds), where toggles show a reduced-opacity read-only state.

**Clicking the active radio doesn't turn it off.**
That's radio behaviour under Only one active. Add a Master switch to clear the group, or use the Toggle/Checkbox style to allow clicking the active option Off.

**Turning on Only one active didn't turn anything off.**
Rules apply on the next click, so a group that already has several toggles On keeps them until someone clicks.

**Disabling the group didn't change my numbers.**
By design, Group enable disables the controls without changing their state or filters. Gate your measures on the Group enable field — see [Group enable table](#group-enable-table).

**The toggles don't match my measures on first load.**
Every toggle starts Off (Group enable starts On) until clicked, since the visual can't read `SELECTEDVALUE`'s fallback out of your DAX. Make each fallback match: `0`/Off for toggles, `1`/On for Group enable.

**A custom colour or font isn't showing.**
High Contrast mode overrides custom colours with the theme's palette, for legibility.

## Upgrading from the single Toggle Slicer

This visual keeps the same GUID and the same `toggle` data role, so an existing report upgrades in place and its single bound field becomes a group of one. A few things change:

- The field's display name now shows as the toggle's name. Turn off **Toggle names → Show names** to get the old look back, or rename the field in the well.
- **Title position** now defaults to **Above**. Reports that never set it will move the title; set it back to **Inline left** if needed.
- **Show switch background** has moved to **Container → Show group background**; a report that had it on needs it switching on again there.
- The old **Toggle Settings → Alignment** property has been removed; row alignment is now **Toggle names → Alignment**.
- The existing filter on the bound field is read as before, so the toggle's state carries over.

## Roadmap

### More than two states per toggle (not scheduled)

Each row is still binary. A multi-state row (e.g. Off/Mid/On, as a stepped slider) would need an explicit ordering for its values instead of the On/Off alias matching, a "select the chosen stop" interaction in place of flipping, and per-state labels. It's recorded here so the shape of the problem isn't lost, not because it's planned.

### Vertical orientation (not scheduled)

Rendering each switch's track vertically. With the group already stacking rows vertically, the use case is narrower than it was for a single switch.

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
