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

**Modeling → New table**. The column's name becomes the toggle's name in the visual, so rename `Toggle` to something readable (sentence case works well). `Toggle Table` and `Toggle` are placeholders; use your own names:

```dax
Toggle Table =
DATATABLE("Toggle", STRING, {{"On"}, {"Off"}})
```

### 3. Add a measure that reads it

**Modeling → New measure**:

```dax
Toggle State =
IF(
    SELECTEDVALUE('Toggle Table'[Toggle]) = "On",
    1,
    0
)
```

Use `[Toggle State]` anywhere else in the model, for example:

```dax
My Measure =
IF(
    [Toggle State] = 1,
    [Measure When On],
    [Measure When Off]
)
```

> `"On"`/`"Off"` is just the convention used here. `"True"`/`"False"` and `1`/`0` work too. Comparing to `"On"` (rather than using `SELECTEDVALUE`'s fallback) means an unfiltered column reads as Off, which is exactly what the toggle shows until someone clicks it.

### 4. Add the visual and bind the field

1. Drag the **Toggle Slicer** icon onto the report canvas.
2. Drag `'Toggle Table'[Toggle]` into the **Toggles** field well. The toggle appears straight away.
3. To rename it for this visual only, use **Rename for this visual** on the field in the well.

Click it, and any visual using `[Toggle State]` updates immediately, the same as with a native slicer. A bookmark restores the state, and **View → Sync slicers** carries it between pages.

For a single toggle you usually want **Toggle Label → Show** off and **Toggle Group Label → Alignment → Center** (the label centred over the toggle).

## Quick start: a toggle group

A group is **one disconnected table** with **one column per toggle**. Build it with `CROSSJOIN` so it holds every On/Off combination:

```dax
Toggle Group Table =
CROSSJOIN(
    DATATABLE("Toggle 1", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Toggle 2", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Toggle 3", STRING, {{"On"}, {"Off"}})
)
```

`CROSSJOIN` gives the table every combination (2 × 2 × 2 = 8 rows here). That's what lets each column be switched independently: filtering *Toggle 1* to On still leaves both values of every other column. To add a toggle later, add another `DATATABLE(...)` line.

Add a measure per toggle, exactly as above (`SELECTEDVALUE('Toggle Group Table'[Toggle 1]) = "On"`), then drag the table's columns into **Toggles** one by one, up to 12. A new empty slot appears below each one. Rows render in the order they sit in the well; drag within the well to reorder. To make the group behave as one, see [Group behavior](#group-behavior).

If you see a validation message instead of toggles, see [Troubleshooting](#troubleshooting).

## How it works

Each column in the **Toggles** well is one toggle. Clicking a toggle writes a real slicer-style filter on that column (the same `general.filter` mechanism a native slicer uses). The visual keeps **one basic filter per column**, `'Toggle Group Table'[Toggle 1] IN {"On"}` or `IN {"Off"}`, and always writes the whole group's set at once. So:

- `SELECTEDVALUE('Toggle Group Table'[Toggle 1])`, and anything built on it, reads each toggle exactly like a slicer.
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

Use this when the toggles should filter a dimension directly, e.g. "only the rows of your dimension that match Toggle 1". A table can only have one active path to a dimension, so the whole group shares **one bridge**, keyed on the combination of toggle states. First, give the group table a key column (**Modeling → New column** on `Toggle Group Table`):

```dax
Option Key =
'Toggle Group Table'[Toggle 1] & "|" & 'Toggle Group Table'[Toggle 2]
```

Then the bridge lists, for every combination, the members that pass **all** of its On toggles. An Off toggle doesn't restrict anything:

```dax
Toggle Group Bridge =
SELECTCOLUMNS(
    GENERATE(
        'Toggle Group Table',
        FILTER(
            'Dimension Table',
            ('Toggle Group Table'[Toggle 1] = "Off" || 'Dimension Table'[Matches Toggle 1])
                && ('Toggle Group Table'[Toggle 2] = "Off" || 'Dimension Table'[Matches Toggle 2])
        )
    ),
    "Option Key", 'Toggle Group Table'[Option Key],
    "Dimension Key", 'Dimension Table'[Dimension Key]
)
```

Relationships:

- `'Toggle Group Table'[Option Key]` (one) → `'Toggle Group Bridge'[Option Key]` (many), single direction.
- `'Toggle Group Bridge'[Dimension Key]` (many) → `'Dimension Table'[Dimension Key]` (one), **both directions**, so the filter can flow from the bridge up to the dimension.

On toggles **intersect** (AND): each one narrows the dimension further, and Off toggles leave it untouched. Combined with **Only one active**, that gives a "pick one lens" control: exactly one subset applies at a time, or none. Before anyone clicks, nothing is filtered, so every combination (and every member) is in play.

The bridge has up to (combinations × members) rows, e.g. 8 × 2,000 dimension rows = 16,000 rows for three toggles. Keep bridged groups to a handful of toggles; for more, use Pattern A.

### Group enable column

**What it's for.** Group enable is an on/off switch for the whole group. Switching it Off greys out every toggle below it, but it deliberately leaves each toggle's state and filter alone, so they remember their settings and come back exactly as they were when it's switched On again. The visual can't know what your measures do with those toggles, though, so on its own your report's numbers would keep following the greyed-out toggles. If you want switching Group enable Off to also switch their *effects* off, make your measures check it, as below. If you don't need that, skip Group enable entirely.

Add the column to the **same** `CROSSJOIN` as the toggles:

```dax
    DATATABLE("Group Enable", STRING, {{"On"}, {"Off"}}),
```

Group enable renders **On** until someone first switches it Off, so a new group isn't born disabled. Its test is therefore `<> "Off"`, so that unfiltered reads as enabled. Gate each toggle's measure on it:

```dax
Toggle 1 Active =
IF(
    SELECTEDVALUE('Toggle Group Table'[Group Enable]) <> "Off",
    [Toggle 1 State],
    0
)
```

With **bridges**, gate in the bridge instead. Add `[Group Enable]` to `Option Key`, and treat "Off" as "no toggle restricts anything":

```dax
FILTER(
    'Dimension Table',
    'Toggle Group Table'[Group Enable] = "Off"
        || (
            ('Toggle Group Table'[Toggle 1] = "Off" || 'Dimension Table'[Matches Toggle 1])
                && ('Toggle Group Table'[Toggle 2] = "Off" || 'Dimension Table'[Matches Toggle 2])
        )
)
```

Switching Group enable Off then neutralises every bridged toggle while they keep showing (and remembering) their own state.

## Group behavior

All in the **Group Behavior** card, except Group enable, which comes from binding a field to the **Group enable** well.

| Rule | What it does |
|---|---|
| **Only one active** | Turning a toggle On turns every other toggle Off. Turning the active one Off leaves none On, except with the **Radio** control style, where (like a native radio group) the active option can't be clicked Off. If several were already On when the rule was switched on, the next click brings the group back to at most one. |
| **Master switch** | Adds a master toggle at the top; the rest are indented by **Toggle Group → Indent**. Master On/Off sets every toggle below it On/Off. It shows **On** when all are On, **Off** when none are, and **mixed** (a dash on the checkbox; a half-way knob on the toggle) when only some are. Clicking a mixed master turns them all On. It has no field of its own. Under Only one active, "all On" isn't allowed, so the master reads On when *any* toggle is On, and switching it On selects the first toggle. |
| **Group enable** | Bind an On/Off field to the **Group enable** well. It's drawn as a header toggle at the very top, and everything below it (master included) is indented. Switching it Off **disables** the toggles below it (greyed out, not clickable, out of the tab order) **without changing their state**. Because it's a real field, DAX can read it (see [Group enable column](#group-enable-column)). |

Master switch and Group enable can be combined: Group enable at the top, master below it, toggles below that, each level indented. Under the **Radio** style, header rows (master, Group enable) are drawn as checkboxes, since they aren't one of the mutually exclusive options.

## Features

- **Single toggle or group** - one On/Off column is a toggle; up to 12 make a group.
- **Dynamic field well** - drop in a column and a new empty slot appears below it.
- **Three control styles** - sliding **Toggle**, square **Checkbox** or round **Radio**. All three share the same colors, border, sizing and 3D effect.
- **Group Behavior** - Only one active, Master switch (with mixed state), and Group enable (disable without resetting).
- **Style every layer** - the Toggle Group, its label, each Toggle, its Handle, the Toggle Labels and the State Labels each have their own Background, Border (None, Flat, Embossed or Sunken), Corner radius and Padding.
- **State text inside the switch** - the On/Off text sits still while the handle slides over it, wiping it in and out.
- **Aligned layout** - toggle labels and controls line up in columns, with labels on either side and Left/Center/Right/Justify alignment.
- **Sync slicers**, **bookmarks** and **persisted state** - every toggle's state is a real filter.
- **Keyboard accessible** - <kbd>Space</kbd>/<kbd>Enter</kbd> toggle, arrow keys and <kbd>Home</kbd>/<kbd>End</kbd> move between rows, and an exclusive radio group is a single Tab stop. Each control's accessible name includes its toggle name and current state, and its role matches what's drawn (switch, checkbox or radio).
- **Clickable labels** - clicking a toggle's label toggles it, like a native label.
- **High contrast** - theme colors replace custom colors when Power BI's high-contrast mode is active.
- **Tooltip** and **context menu** per toggle.
- **Respects Allow Interactions** - read-only state where interactivity is disabled.
- **Responsive** - controls scale with the visual's height shared across the rows (between a configurable min/max), or lock to a fixed size; state labels hide when the visual is narrow.
- **Placeholder with setup guide** - tabs for **One toggle** and **Toggle group**, each with copyable DAX; a validation message names any field that isn't a valid On/Off pair.

## Format pane options

The Format pane works from the outside in, one card per layer:

```
Toggle Group            the box around everything
 ├─ Toggle Group Label  its heading
 ├─ Toggle              the switch, checkbox or radio
 │   └─ Handle          what slides (or sits) inside the toggle
 ├─ Toggle Label        each row's name
 ├─ State Label         the On/Off text
 └─ Group Behavior      the rules (no box)
```

Power BI also gives every visual its own **General → Title** and **General → Background**. Those are separate: the Toggle Group Label and the Toggle Group's Background are drawn by this visual.

### The same four settings on every layer

Every layer except Group Behavior has these (some are hidden when they don't apply):

| Group | Property | Description |
|---|---|---|
| Background | Show / Color | Fill behind the layer. Off by default, so what is behind it shows through. (The Toggle's fill is its **On color** and **Off color**; the Handle's is its **Color**, always on.) |
| Border | Style | **None**, **Flat** (a plain line), **Embossed** (raised) or **Sunken** (recessed) |
| Border | Color / Width | Shown once a style is chosen |
| Corners & padding | Corner radius | Roundness of the corners. Pixels for the group and the text layers; a percentage of the toggle's height for the Toggle and Handle (50 is fully round) |
| Corners & padding | Padding | Space between the layer's border and what is inside it |

### Toggle Group

The box around the label and every row, and how the rows are laid out inside it.

| Group | Property | Description | Default |
|---|---|---|---|
| Layout | Row alignment | Pack the rows to the Left, Center or Right, or Justify labels and toggles to opposite edges. With a Left or Right Toggle Group Label, the rows align within the space beside it, so the label's own Alignment then has no spare room to act on | Left |
| Layout | Row spacing | Space in pixels between rows | 8px |
| Layout | Indent | Pixels each level is indented below a master switch or Group enable toggle | 16px |
| Layout | Vertical alignment | Top, Middle or Bottom of the visual | Middle |
| Background, Border, Corners & padding | | As above | No background or border; 4px radius; 8px padding |

### Toggle Group Label

A heading this visual draws itself. Turn the card's **Show** toggle off to hide it.

| Group | Property | Description | Default |
|---|---|---|---|
| (header) | Show | Show the label | On |
| Text | Text | Label text. Shows "Toggle group" until you set your own | blank |
| Text | Position | Above the group, or to its Left or Right | Above |
| Text | Alignment | Left, Center, Right, or Justify (label and group to opposite ends). Center with the label Above and **Toggle Label → Show** off gives the classic single-toggle look | Left |
| Text | Spacing | Space in pixels between the label and the group | 8px |
| Text | Font / Font color | Typography of the label | Segoe UI, 14px, bold / Dark grey |
| Background, Border, Corners & padding | | As above | No background or border; 4px radius; 0 padding |

### Toggle

The switch, checkbox or radio button itself.

| Group | Property | Description | Default |
|---|---|---|---|
| Style | Control style | Toggle switch, Checkbox, or Radio button | Toggle |
| Style | 3D effect | Raised, glossy look with shading and shadows | Off |
| Colors | On color | Fill when On | Report theme's first data color, until you pick your own |
| Colors | Off color | Fill when Off | Grey |
| Size | Size mode | Responsive (scale with the visual's height, shared across rows) or Fixed | Responsive |
| Size | Minimum / Maximum height | Bounds of each toggle's height in Responsive mode | 16px / 22px |
| Size | Height | Each toggle's exact height in Fixed mode | 22px |
| Border | Style, Color, Width | As above | None; dark grey; 2px |
| Corners & padding | Corner radius | Percentage of the toggle's height. Until you set one, the pane shows the style's own default: 50 (a pill) for Toggle, 20 (a rounded square) for Checkbox. A Radio is always a circle, so it's hidden | 50 |
| Corners & padding | Padding | Gap between the toggle's edge and its handle | 2px |

Width always follows height: 2:1 for the Toggle style (wider if the State Label sits inside it), 1:1 for Checkbox and Radio.

### Handle

What sits inside the toggle: the sliding knob (Toggle), the dot (Radio) or the tick (Checkbox).

| Group | Property | Description | Default |
|---|---|---|---|
| Color | Color | The handle's fill (the tick's color for a Checkbox) | White |
| Border | Style, Color, Width | As above. Not used by a Checkbox's tick | None; dark grey; 1px |
| Corners & padding | Corner radius | Percentage of the handle's size (50 is a circle). Not used by a Checkbox | 50 |
| Corners & padding | Padding | Gap around the dot or tick inside the toggle, as a percentage of the toggle's height so it scales with it. Not used by the Toggle style's knob, which is sized by the toggle's padding | 18% |

### Toggle Label

Each row's name, which is its field's display name. Rename it in the Toggles well. Turn the card's **Show** toggle off to hide the names.

| Group | Property | Description | Default |
|---|---|---|---|
| (header) | Show | Show each toggle's label | On |
| Text | Position | Label to the Left or Right of its toggle | Left |
| Text | Spacing | Space in pixels between a label and its toggle | 8px |
| Text | Font / Font color | Typography of the labels | Segoe UI, 12px / Near-black |
| Background, Border, Corners & padding | | As above | No background or border; 4px radius; 0 padding |

### State Label

The On/Off text. Turn the card's **Show** toggle on to display it.

| Group | Property | Description | Default |
|---|---|---|---|
| (header) | Show | Show the On/Off text | Off |
| Text | On text / Off text | Text shown when a toggle is On / Off | "On" / "Off" |
| Text | Position | **Inside switch**, Left or Right of the toggle, or Above it. Inside applies to the Toggle style only; checkboxes and radios show it on the right | Inside switch |
| Text | Spacing | Space in pixels between a toggle and its text (hidden for Inside switch) | 8px |
| Text | Font / Font color | Typography of the text | Arial, 10px, regular / Dark blue |
| Background, Border, Corners & padding | | As above | No background or border; 4px radius; 4px padding |

**Inside switch:** the text of each state stays where it is, centered horizontally and vertically in the part of the toggle the handle isn't covering, and the handle slides over it. As the handle moves, it wipes the old text out and uncovers the new text, and the toggle never changes width when clicked. The Off text uses the State Label's font color; the On text uses the Handle's color (white by default) so it stays readable on the On color. The toggle is as wide as it needs to be to fit the longer of the two texts.

### Group Behavior

| Property | Description | Default |
|---|---|---|
| Only one active | Turning a toggle On turns every other toggle Off | Off |
| Master switch | Add a master toggle at the top that turns every toggle On/Off | Off |
| Master label | Name shown next to the master switch (only while it is on) | "All" |

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
