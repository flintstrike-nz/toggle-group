# Toggle Slicer

A Power BI custom visual that turns On/Off columns into **switch, checkbox or radio slicers**. Use a single toggle, or a **group** of up to 12 with rules: **Only one active**, a **Master switch**, and a **Group enable** toggle that greys out the rest. Each toggle writes a real slicer-style filter, so DAX reads it, bookmarks restore it and Sync slicers carry it between pages.

It replaces a stack of standard slicers styled to look like switches with one purpose-built control.

## Contents

- [Quick start: one toggle](#quick-start-one-toggle)
- [Quick start: a toggle group](#quick-start-a-toggle-group)
- [How it works](#how-it-works)
- [Tables and bridges](#tables-and-bridges)
- [Group behavior](#group-behavior)
- [Features](#features)
- [Format pane options](#format-pane-options)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Development](#development)
- [Publishing to AppSource](#publishing-to-appsource)
- [Further reading](#further-reading)

## Quick start: one toggle

This takes you from nothing to a working toggle in Power BI Desktop. The same steps are on the visual's placeholder (the **One toggle** tab) when you add it to a report, with Copy buttons for the DAX.

### 1. Get the visual

Add **Toggle Slicer** from AppSource (Visualizations pane → **···** → **Get more visuals**), or import a `.pbiviz` file you built yourself (see [Development](#development)): **···** → **Import a visual from a file**. Imported files show a "custom visuals aren't certified" warning, which is expected for anything not from AppSource.

### 2. Create a table with one column

**Modeling → New table**. The column's name becomes the toggle's name in the visual, so give it a readable, sentence-case name:

```dax
Targets Toggle =
DATATABLE("Show targets", STRING, {{"On"}, {"Off"}})
```

### 3. Add a measure that reads it

**Modeling → New measure**:

```dax
Show Targets State =
IF(
    SELECTEDVALUE('Targets Toggle'[Show targets]) = "On",
    1,
    0
)
```

Use `[Show Targets State]` anywhere else in the model, for example:

```dax
Sales or Targets =
IF(
    [Show Targets State] = 1,
    [Total Targets],
    [Total Sales]
)
```

> `"On"`/`"Off"` is just the convention used here. `"True"`/`"False"` and `1`/`0` work too. Comparing to `"On"` (rather than using `SELECTEDVALUE`'s fallback) means an unfiltered column reads as Off, which is exactly what the toggle shows until someone clicks it.

### 4. Add the visual and bind the field

1. Drag the **Toggle Slicer** icon onto the report canvas.
2. Drag `'Targets Toggle'[Show targets]` into the **Toggles** field well. The toggle appears straight away.
3. To rename it for this visual only, use **Rename for this visual** on the field in the well.

Click it, and any visual using `[Show Targets State]` updates immediately, the same as with a native slicer. A bookmark restores the state, and **View → Sync slicers** carries it between pages.

For a single toggle you usually want **Toggle names → Show** off and **Title → Alignment → Center** (title centred over the toggle).

## Quick start: a toggle group

A group is **one disconnected table** with **one column per toggle**. Build it with `CROSSJOIN` so it holds every On/Off combination:

```dax
Display Options =
CROSSJOIN(
    DATATABLE("Show targets", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Show forecast", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Include returns", STRING, {{"On"}, {"Off"}})
)
```

`CROSSJOIN` gives the table every combination (2 × 2 × 2 = 8 rows here). That's what lets each column be switched independently: filtering *Show targets* to On still leaves both values of every other column. To add a toggle later, add another `DATATABLE(...)` line.

Add a measure per toggle, exactly as above (`SELECTEDVALUE('Display Options'[Show targets]) = "On"`), then drag the table's columns into **Toggles** one by one, up to 12. A new empty slot appears below each one. Rows render in the order they sit in the well; drag within the well to reorder. To make the group behave as one, see [Group behavior](#group-behavior).

If you see a validation message instead of toggles, see [Troubleshooting](#troubleshooting).

## How it works

Each column in the **Toggles** well is one toggle. Clicking a toggle writes a real slicer-style filter on that column (the same `general.filter` mechanism a native slicer uses). The visual keeps **one basic filter per column**, `'Display Options'[Show targets] IN {"On"}` or `IN {"Off"}`, and always writes the whole group's set at once. So:

- `SELECTEDVALUE('Display Options'[Show targets])`, and anything built on it, reads each toggle exactly like a slicer.
- State persists across saves, survives bookmarks, and can be synced across pages.
- A toggle that's Off applies its **Off** value rather than clearing its filter. That keeps every column filtered once the group has been used, which the bridge pattern below relies on.

The visual de-duplicates each column's values on its own and checks that each has exactly one On value and one Off value, so the extra combination rows in a group table don't matter to it. The 12-toggle cap keeps the table small: 2¹² = 4,096 rows, or 8,192 with a Group enable column.

If you remove a field from the well, its filter would otherwise stay applied invisibly. The visual rewrites the filter set on its next update to drop it (or clears it entirely once the well is empty).

The visual makes no network requests, stores nothing outside the report, and needs no special privileges.

## Tables and bridges

The model is **one disconnected table per group**, with one On/Off column per toggle, built with `CROSSJOIN` so it holds every combination. The combinations matter: a table with just two rows and several columns would tie the columns together, so switching one toggle would silently change what the others can show. (A single toggle is simply a group of one.)

> Columns from separate tables also work (the visual treats each field the same way), but one table per group keeps the model tidy and is what the bridge pattern below needs.

### Pattern A: measure-driven (recommended)

One group table plus one measure per toggle, exactly as in the quick starts. The table relates to nothing, and measures decide what each toggle means. This supports every group rule, including Group enable.

### Pattern B: bridge-driven (filter real data through relationships)

Use this when the toggles should filter a dimension directly, e.g. "Show products with a target only". A table can only have one active path to a dimension, so the whole group shares **one bridge**, keyed on the combination of toggle states. First, give the group table a key column (**Modeling → New column** on `Display Options`):

```dax
Option Key =
'Display Options'[Show targets] & "|" & 'Display Options'[Show forecast]
```

Then the bridge lists, for every combination, the members that pass **all** of its On toggles. An Off toggle doesn't restrict anything:

```dax
Display Options Bridge =
SELECTCOLUMNS(
    GENERATE(
        'Display Options',
        FILTER(
            'Product',
            ('Display Options'[Show targets] = "Off" || 'Product'[Has Target])
                && ('Display Options'[Show forecast] = "Off" || 'Product'[Has Forecast])
        )
    ),
    "Option Key", 'Display Options'[Option Key],
    "Product Key", 'Product'[Product Key]
)
```

Relationships:

- `'Display Options'[Option Key]` (one) → `'Display Options Bridge'[Option Key]` (many), single direction.
- `'Display Options Bridge'[Product Key]` (many) → `'Product'[Product Key]` (one), **both directions**, so the filter can flow from the bridge up to the dimension.

On toggles **intersect** (AND): each one narrows the dimension further, and Off toggles leave it untouched. Combined with **Only one active**, that gives a "pick one lens" control: exactly one subset applies at a time, or none. Before anyone clicks, nothing is filtered, so every combination (and every member) is in play.

The bridge has up to (combinations × members) rows, e.g. 8 × 2,000 products = 16,000 rows for three toggles. Keep bridged groups to a handful of toggles; for more, use Pattern A.

### Group enable column

Add it to the **same** `CROSSJOIN` as the toggles:

```dax
    DATATABLE("Options enabled", STRING, {{"On"}, {"Off"}}),
```

Group enable renders **On** until someone first switches it Off, so a new group isn't born disabled. Its test is therefore `<> "Off"`, so that unfiltered reads as enabled. Gate each toggle's measure on it:

```dax
Show Targets Active =
IF(
    SELECTEDVALUE('Display Options'[Options enabled]) <> "Off",
    [Show Targets State],
    0
)
```

With **bridges**, gate in the bridge instead. Add `[Options enabled]` to `Option Key`, and treat "Off" as "no toggle restricts anything":

```dax
FILTER(
    'Product',
    'Display Options'[Options enabled] = "Off"
        || (
            ('Display Options'[Show targets] = "Off" || 'Product'[Has Target])
                && ('Display Options'[Show forecast] = "Off" || 'Product'[Has Forecast])
        )
)
```

Switching Group enable Off then neutralises every bridged toggle while they keep showing (and remembering) their own state.

## Group behavior

All in the **Group behavior** card, except Group enable, which comes from binding a field to the **Group enable** well.

| Rule | What it does |
|---|---|
| **Only one active** | Turning a toggle On turns every other toggle Off. Turning the active one Off leaves none On, except with the **Radio** control style, where (like a native radio group) the active option can't be clicked Off. If several were already On when the rule was switched on, the next click brings the group back to at most one. |
| **Master switch** | Adds a master toggle at the top; the rest are indented by **Layout → Indent**. Master On/Off sets every toggle below it On/Off. It shows **On** when all are On, **Off** when none are, and **mixed** (a dash on the checkbox; a half-way knob on the toggle) when only some are. Clicking a mixed master turns them all On. It has no field of its own. Under Only one active, "all On" isn't allowed, so the master reads On when *any* toggle is On, and switching it On selects the first toggle. |
| **Group enable** | Bind an On/Off field to the **Group enable** well. It's drawn as a header toggle at the very top, and everything below it (master included) is indented. Switching it Off **disables** the toggles below it (greyed out, not clickable, out of the tab order) **without changing their state**. Because it's a real field, DAX can read it (see [Group enable column](#group-enable-column)). |

Master switch and Group enable can be combined: Group enable at the top, master below it, toggles below that, each level indented. Under the **Radio** style, header rows (master, Group enable) are drawn as checkboxes, since they aren't one of the mutually exclusive options.

## Features

- **Single toggle or group** - one On/Off column is a toggle; up to 12 make a group.
- **Dynamic field well** - drop in a column and a new empty slot appears below it.
- **Three control styles** - sliding **Toggle**, square **Checkbox** or round **Radio**. All three share the same colors, outline, sizing and 3D effect.
- **Group behavior** - Only one active, Master switch (with mixed state), and Group enable (disable without resetting).
- **Border and background** - None, Flat, Embossed or Gutter, with color, width, corner radius, padding and optional fill.
- **Aligned layout** - names and controls line up in columns, with names on either side and Left/Center/Right/Justify alignment.
- **Sync slicers**, **bookmarks** and **persisted state** - every toggle's state is a real filter.
- **Keyboard accessible** - <kbd>Space</kbd>/<kbd>Enter</kbd> toggle, arrow keys and <kbd>Home</kbd>/<kbd>End</kbd> move between rows, and an exclusive radio group is a single Tab stop. Each control's accessible name includes its toggle name and current state, and its role matches what's drawn (switch, checkbox or radio).
- **Clickable names** - clicking a toggle's name toggles it, like a native label.
- **High contrast** - theme colors replace custom colors when Power BI's high-contrast mode is active.
- **Tooltip** and **context menu** per toggle.
- **Respects Allow Interactions** - read-only state where interactivity is disabled.
- **Responsive** - controls scale with the visual's height shared across the rows (between a configurable min/max), or lock to a fixed size; state labels hide when the visual is narrow.
- **Placeholder with setup guide** - tabs for **One toggle** and **Toggle group**, each with copyable DAX; a validation message names any field that isn't a valid On/Off pair.

## Format pane options

The Format pane is organised from the controls outward: what each toggle looks like, its text, how the group behaves, where it sits, and the box around it. Options that don't apply to your current choices are hidden.

### Controls

| Group | Property | Description | Default |
|---|---|---|---|
| Style | Control style | Toggle switch, Checkbox, or Radio button | Toggle |
| Style | 3D effect | Raised, glossy look with shading and shadows | Off |
| Colors | On color | Fill when On | Report theme's first data color, until you pick your own |
| Colors | Off color | Fill when Off | Grey |
| Size | Size mode | Responsive (scale with the visual's height, shared across rows) or Fixed | Responsive |
| Size | Minimum / Maximum height | Bounds of each control's height in Responsive mode | 16px / 22px |
| Size | Height | Each control's exact height in Fixed mode | 22px |
| Outline (toggle) | Color / Width | A ring around each control's track | Off / Dark grey / 2px |

Width always follows height: 2:1 for the Toggle style, 1:1 for Checkbox and Radio.

### State labels

The On/Off text beside each control. Turn the card's **Show** toggle on to display it.

| Property | Description | Default |
|---|---|---|
| Show | Show the On/Off text next to each control | Off |
| On text / Off text | Text shown when a toggle is On / Off | "On" / "Off" |
| Position | Left or Right of the control, Above it, or Inside the switch opposite the knob (the track widens to fit the longer label; toggle style only, checkboxes and radios show it on the right) | Left |
| Spacing | Space in pixels between a control and its text (hidden for Inside switch) | 8px |
| Font / Font color | Typography of the text | Arial, 12px, bold / Dark blue |

### Toggle names

Each row's name is its field's display name; rename it in the well.

| Property | Description | Default |
|---|---|---|
| Show | Show each toggle's name | On |
| Position | Name to the Left or Right of its control | Left |
| Spacing | Space in pixels between a name and its control | 8px |
| Font / Font color | Typography of the names | Segoe UI, 12px / Near-black |

### Group behavior

| Property | Description | Default |
|---|---|---|
| Only one active | Turning a toggle On turns every other toggle Off | Off |
| Master switch | Add a master toggle at the top that turns every toggle On/Off | Off |
| Master label | Name shown next to the master switch (only while it is on) | "All" |

### Layout

| Group | Property | Description | Default |
|---|---|---|---|
| Rows | Row alignment | Pack names and controls to the Left, Center or Right, or Justify them to opposite edges. With an Inline title, the rows align within the space beside the title, so Title → Alignment then has no spare room to act on | Left |
| Rows | Row spacing | Space in pixels between rows | 8px |
| Rows | Indent | Pixels each level is indented below a master switch or Group enable toggle | 16px |
| Placement | Vertical alignment | Top, Middle or Bottom of the visual | Middle |
| Placement | Padding | Space between the border and its contents | 8px |

### Title

A heading this visual draws itself, separate from Power BI's own General → Title.

| Property | Description | Default |
|---|---|---|
| Show | Show the title | On |
| Text | Title text. Shows "Toggle group" until you set your own | blank |
| Position | Above the group, or to its Left or Right | Above |
| Alignment | Left, Center, Right, or Justify (title and group to opposite ends). Center with the title Above and **Toggle names → Show** off gives the classic single-toggle look | Left |
| Spacing | Space in pixels between the title and the group | 8px |
| Font / Font color | Typography of the title | Segoe UI, 14px, bold / Dark grey |

### Border & background

The box drawn around the whole group, title included.

| Group | Property | Description | Default |
|---|---|---|---|
| Border | Style | None, Flat (a plain line), Embossed (raised) or Gutter (recessed) | None |
| Border | Color / Width | Shown once a style is chosen | Light grey / 1px |
| Border | Corner radius | Roundness of the corners | 4px |
| Background (toggle) | Color | Fill inside the border. Separate from Power BI's own General → Background | Off / White |

The font defaults are static: Power BI gives custom visuals no way to read the report theme's typography (unlike color, where On color follows the theme).

## Troubleshooting

**I see "Drag an On/Off column into Toggles".**
Nothing is bound to **Toggles** yet (a Group enable field on its own isn't enough). Make the visual larger to reveal the setup guide with copyable DAX.

**I see a message saying a field must contain exactly one On value and one Off value.**
The message names the field. It must resolve to exactly two values, one On-shaped (`"On"`, `"true"`, `1`, case-insensitive) and one Off-shaped (`"Off"`, `"false"`, `0`). The usual cause is binding a real column (e.g. Region) or the bridge's `Option Key` column instead of a toggle column.

**Clicking a toggle does nothing / it's greyed out.**
If there's a Group enable toggle at the top, it's Off. Switch it On. Otherwise check the visual isn't in a read-only context (Focus mode thumbnail, some embeds), where toggles show a reduced-opacity read-only state.

**Clicking the active radio doesn't turn it off.**
That's radio behavior under Only one active. Add a Master switch to clear the group, or use the Toggle/Checkbox style to allow clicking the active option Off.

**Turning on Only one active didn't turn anything off.**
Rules apply on the next click, so a group that already has several toggles On keeps them until someone clicks one. That click leaves at most one On.

**Disabling the group didn't change my numbers.**
By design, Group enable disables the controls without changing their state or filters. Gate your measures (or bridge) on the Group enable column; see [Group enable column](#group-enable-column).

**The toggles don't match my measures on first load.**
Every toggle starts Off (Group enable starts On) until clicked, since the visual can't read your DAX. Write measures so an unfiltered column agrees: compare toggles to `"On"` and Group enable to `<> "Off"`, as in the starter DAX, rather than relying on `SELECTEDVALUE`'s fallback.

**A custom color or font isn't showing.**
High Contrast mode overrides custom colors with the theme's palette, for legibility.

## Roadmap

### More than two states per toggle (not scheduled)

Each row is still binary. A multi-state row (e.g. Off/Mid/On, as a stepped slider) would need an explicit ordering for its values instead of the On/Off alias matching, a "select the chosen stop" interaction in place of flipping, and per-state labels. It's recorded here so the shape of the problem isn't lost, not because it's planned.

### Vertical orientation (not scheduled)

Rendering each switch's track vertically. With the group already stacking rows vertically, the use case is narrower than it was for a single switch.

## Development

Requires Node.js and the [Power BI visuals tools](https://www.npmjs.com/package/powerbi-visuals-tools) (`pbiviz`, installed by `npm install`).

```bash
# install deps
npm install

# lint (must be clean for certification)
npm run eslint

# local dev server with live reload (test via Power BI's Developer Visual)
npm start

# package for import / distribution
npm run package
```

The packaged `.pbiviz` lands in `dist/`. See [CLAUDE.md](CLAUDE.md) for the visual's architecture, implementation notes, and conventions in more depth. `npm run bump` (Windows PowerShell) increments the fourth version number in `pbiviz.json` before packaging.

## Publishing to AppSource

The step-by-step checklist, with the listing text, asset specifications and Microsoft's requirements, is in [docs/appsource/SUBMISSION.md](docs/appsource/SUBMISSION.md). The visual's privacy policy is [PRIVACY.md](PRIVACY.md), support information is [SUPPORT.md](SUPPORT.md), and the licence is [LICENSE](LICENSE).

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
- [Guidelines for publishing Power BI custom visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/guidelines-powerbi-visuals)
- [Publish Power BI visuals to Partner Center](https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store)
- [Certified Power BI visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified)
