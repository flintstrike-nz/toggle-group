# Sample report spec (`.pbix`)

AppSource requires a sample report that shows what the visual does, how to format it, and a Hints page. It **must work offline**, so every table below is created with **Enter Data** or DAX; no external sources, web images or connectors. Name the file `Toggle Slicer - Sample.pbix`.

Build it in Power BI Desktop with the packaged visual imported (or the published one, once live). Use a neutral theme (the default is fine), 16:9 pages, and keep the on-page text short.

## Model

**Enter Data → table `Monthly`:**

| Month | Sales | Targets | Forecast | Returns |
|---|---|---|---|---|
| Jan | 120 | 110 | 115 | 8 |
| Feb | 135 | 125 | 130 | 9 |
| Mar | 128 | 130 | 135 | 7 |
| Apr | 150 | 140 | 145 | 11 |
| May | 162 | 150 | 158 | 10 |
| Jun | 158 | 160 | 165 | 12 |

Add a `Month No` column (1 to 6) and sort `Month` by it.

**Base measures** (Modeling → New measure):

```dax
Total Sales = SUM(Monthly[Sales])
Total Targets = SUM(Monthly[Targets])
Total Forecast = SUM(Monthly[Forecast])
Total Returns = SUM(Monthly[Returns])
```

**Toggle tables** (Modeling → New table):

```dax
Targets Toggle =
DATATABLE("Show targets", STRING, {{"On"}, {"Off"}})

Display Options =
CROSSJOIN(
    DATATABLE("Show targets", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Show forecast", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Include returns", STRING, {{"On"}, {"Off"}})
)

Measure Lens =
CROSSJOIN(
    DATATABLE("Sales", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Targets", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Forecast", STRING, {{"On"}, {"Off"}})
)

Gated Options =
CROSSJOIN(
    DATATABLE("Options enabled", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Show targets", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Show forecast", STRING, {{"On"}, {"Off"}})
)
```

Leave all four tables unrelated to anything.

**Toggle measures:**

```dax
Show Targets State =
IF(SELECTEDVALUE('Targets Toggle'[Show targets]) = "On", 1, 0)

Group Targets On = IF(SELECTEDVALUE('Display Options'[Show targets]) = "On", 1, 0)
Group Forecast On = IF(SELECTEDVALUE('Display Options'[Show forecast]) = "On", 1, 0)
Group Returns On = IF(SELECTEDVALUE('Display Options'[Include returns]) = "On", 1, 0)

Targets (page 2) = IF([Show Targets State] = 1, [Total Targets], BLANK())
Targets (group) = IF([Group Targets On] = 1, [Total Targets], BLANK())
Forecast (group) = IF([Group Forecast On] = 1, [Total Forecast], BLANK())
Net Sales (group) = [Total Sales] - IF([Group Returns On] = 1, [Total Returns], 0)

Lens Value =
SWITCH(
    TRUE(),
    SELECTEDVALUE('Measure Lens'[Sales]) = "On", [Total Sales],
    SELECTEDVALUE('Measure Lens'[Targets]) = "On", [Total Targets],
    SELECTEDVALUE('Measure Lens'[Forecast]) = "On", [Total Forecast],
    BLANK()
)

Gate On = IF(SELECTEDVALUE('Gated Options'[Options enabled]) <> "Off", 1, 0)
Gated Targets = IF([Gate On] = 1 && SELECTEDVALUE('Gated Options'[Show targets]) = "On", [Total Targets], BLANK())
Gated Forecast = IF([Gate On] = 1 && SELECTEDVALUE('Gated Options'[Show forecast]) = "On", [Total Forecast], BLANK())
```

## Pages

Each page gets a one-line title text box ("what this shows") and, where useful, a small text box saying what to try. Keep the toggle visual large enough that the setup guide, if ever shown, isn't needed.

### 1. Start here

Text boxes only (and the visual's icon if you like):

- What it is: "Toggle Slicer turns On/Off columns into switch, checkbox or radio slicers, singly or in a group."
- How to use it: the three steps (table, measure, drag into Toggles).
- What's in this report: a list of the pages below.

### 2. One toggle

- **Toggle Slicer**: `'Targets Toggle'[Show targets]` in **Toggles**. Format: **Toggle Label → Show** off; **Toggle Group Label → Text** "Show targets", **Alignment** Center; **State Label → Show** on, **Position** Right.
- **Line and clustered column chart:** Month on the axis, `Total Sales` as columns, `Targets (page 2)` as the line.
- Try: click the toggle and the target line appears and disappears.

### 3. Toggle group

- **Toggle Slicer**: the three `'Display Options'` columns in **Toggles**. Format: **Group Behavior → Master switch** on, label "All options"; **Toggle Group → Border → Style** Embossed.
- **Line chart:** `Net Sales (group)`, `Targets (group)`, `Forecast (group)` by Month.
- Try: switch toggles individually, then use the master switch (note the half-way mixed state).

### 4. Radio and only one active

- **Toggle Slicer**: the three `'Measure Lens'` columns in **Toggles**. Format: **Toggle → Control style** Radio; **Group Behavior → Only one active** on; **Toggle Group Label → Text** "Show".
- **Column chart:** `Lens Value` by Month. **Card:** `Lens Value`.
- Try: pick each option; the radio can't be cleared (use a Master switch to allow clearing).

### 5. Group enable

- **Toggle Slicer**: `'Gated Options'[Options enabled]` in **Group enable** and the two other columns in **Toggles**. Format: **Toggle Group → Border → Style** Sunken; **Toggle → 3D effect** on.
- **Line chart:** `Gated Targets` and `Gated Forecast` by Month.
- Try: switch Group enable off. The toggles grey out and the lines vanish, but switch it back on and each toggle's state is still there.

### 6. Formatting gallery

Four small copies of the same group (`'Display Options'`), each with a different look, labelled with text boxes:

1. Toggle, State Label → Show on, Position **Inside switch** (the text stays put while the handle wipes it).
2. Checkbox, Toggle Group → Border style **Flat**.
3. Radio, Only one active, Toggle Group → Border style **Embossed**.
4. Toggle with **3D effect**, custom On/Off colors, Toggle Group → Border style **Sunken**.

Add a fifth small copy using **Toggle Group → Row alignment → Justify** to show the aligned columns.

### 7. Hints (last page)

Short tips, and things to avoid:

- One table per group, built with `CROSSJOIN`. A two-row table with several columns ties the toggles together.
- Compare to `"On"` in measures. Every toggle starts Off (Group enable starts On) until clicked.
- Rename a toggle with **Rename for this visual** on the field in the well.
- The title is this visual's own; turn off Power BI's General → Title to avoid two.
- For a single toggle: **Toggle Label → Show** off, **Toggle Group Label → Alignment** Center.
- Use **View → Sync slicers** to keep a group in step across pages. Bookmarks restore every toggle.
- Avoid: binding a real column (it needs exactly two values, On/Off, True/False or 1/0), and binding the same column twice.
- Group enable disables the toggles; it doesn't change your numbers until your measures check it.

## Before saving

- [ ] Every page renders with no errors and no placeholder "Drag an On/Off column" message left on a page.
- [ ] No external connections: **Transform data** shows only Enter Data and DAX tables.
- [ ] File opens offline (disconnect, close and reopen it).
- [ ] The visual shown is the packaged version you are submitting.
