# Publishing Toggle Slicer to AppSource

A checklist for the Partner Center submission. Everything the repository can prepare is already done (marked ✅); the rest needs a person, because it involves your Microsoft account, Power BI Desktop or a decision only you can make.

Requirements come from Microsoft Learn: [Publish Power BI visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store), [Test a custom visual before submitting](https://learn.microsoft.com/en-us/power-bi/developer/visuals/submission-testing), [Power BI visual offer listing](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/power-bi-visual-offer-listing) and [Certified visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified). Re-check them before you submit, since they change.

## 0. Before anything else

- [ ] **Make the repository public** (or host the two documents below elsewhere). Partner Center needs `https://` links for the privacy policy and support page, and they must open for anyone. With the repo public and this branch merged to `main` they are:
  - Privacy: `https://github.com/flintstrike-nz/toggle-group/blob/main/PRIVACY.md`
  - Support: `https://github.com/flintstrike-nz/toggle-group/blob/main/SUPPORT.md`
- [ ] **Enrol in Partner Center** with a work email, as an individual or organisation ([how](https://learn.microsoft.com/en-us/azure/marketplace/create-account)).
- [ ] **The GUID is permanent.** `toggleSlicer11DC17E503E54434BF7A4EF24AB80D88` in `pbiviz.json` is what AppSource and every saved report will know this visual by. Never change it after publishing. To test a later version, use Developer mode, not a new GUID.
- [ ] **Property names are permanent too.** Once published, renaming an object or property in `capabilities.json` drops the saved value in reports that use it. Add rather than rename.

## 1. Build and verify the package

```bash
npm install
npm run eslint                           # ✅ clean
npm run package                          # ✅ builds dist/toggleSlicer….1.0.0.0.pbiviz
npx pbiviz package --certification-audit # ✅ no fetch/XHR/eval in the bundle
npm audit --omit=dev                     # ✅ 0 vulnerabilities in production dependencies
```

`npm audit` (including dev dependencies) still lists a few high findings inside `powerbi-visuals-tools`' own dev-server dependencies (`webpack-dev-server` → `braces`/`micromatch`). They never ship in the `.pbiviz`. `braces` has no fixed release and `powerbi-visuals-tools` 7.2.1 is already the latest, so they can't be cleared from this repository. If a reviewer raises it, say so, and re-run `npm audit` before each submission in case upstream has moved.

- [x] `pbiviz.json` has a name, display name, GUID, four-part version (`1.0.0.0`), description, support URL, author name and email.
- [x] No web-access privileges (`capabilities.json` has an empty `privileges` list). No `innerHTML`, `eval`, `fetch` or `XMLHttpRequest` in `src/`.
- [x] The Rendering Events API is implemented (`update()` calls `renderingStarted`/`renderingFinished`/`renderingFailed`).
- [x] Context menu, tooltips, keyboard focus, high contrast and Allow Interactions are handled.
- [ ] For each later release: raise the fourth version number (`npm run bump` on Windows), rebuild and resubmit.

## 2. Test in Power BI (needs Desktop)

Run Microsoft's [test matrix](https://learn.microsoft.com/en-us/power-bi/developer/visuals/submission-testing) in Power BI Desktop and the service. It has not been run against a real model yet (only a mock host was used). The ones most likely to matter for this visual:

- [ ] Convert a Stacked column chart and a Gauge to Toggle Slicer and back; no errors.
- [ ] Add, change and remove fields in any order, including all of them; no errors, and a removed field's filter is dropped.
- [ ] Open the Format pane with nothing bound, one column bound, and several bound (with Group enable too); every card opens without errors.
- [ ] Click each toggle; a measure using it updates. Save, reopen, switch pages and back; state and formatting persist.
- [ ] Bookmarks restore state. **View → Sync slicers** carries it to a second page (also with several columns, which has not been confirmed yet).
- [ ] Several copies of the visual on one page and across pages.
- [ ] Reading view and Edit view; View mode Actual size, Fit to page and Fit to width; a very small visual; pin to a dashboard.
- [ ] Bad data: nulls, a column with three values, a numeric column of 1/0, thousands of rows.
- [ ] Windows High Contrast mode, and keyboard-only use (Tab, arrows, Space).
- [ ] Publish from Desktop to the service and repeat the basics there.

## 3. Sample report (.pbix)

- [ ] Build the offline sample report from [`sample-report-spec.md`](sample-report-spec.md). It must work offline with no external connections (use Enter Data tables only), and should end with a Hints page.

## 4. Listing assets (✅ prepared)

| Item | Requirement | File |
|---|---|---|
| Logo | PNG, exactly 300 × 300 | ✅ `docs/appsource/logo-300.png` |
| Screenshots | 1 to 5 PNGs, exactly 1366 × 768, each ≤ 1024 KB, with text bubbles | ✅ `docs/appsource/screenshots/01…05-*.png` (all under 110 KB) |
| Privacy policy link | `https://` URL | ✅ `PRIVACY.md` (see section 0 for the URL) |
| Support link | `https://` URL | ✅ `SUPPORT.md` |
| EULA | Standard contract, or your own | Tick **Use the Standard Contract for Microsoft Marketplace** (it can't be switched back to custom terms later) or give a link to your own |
| Video | Optional YouTube or Vimeo link | — |

The screenshots show sample names and no real data. Look at each once before uploading: blurry images get a submission rejected.

## 5. Create the offer in Partner Center

1. **Marketplace offers → New offer → Power BI visual.** Pick an offer alias (internal only).
2. **Offer setup:** leave "My product requires the purchase of a service" unticked (the visual is free). Tick **Request Power BI certification** only once the visual is published, or if you are ready to meet the [certification requirements](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified#certification-requirements) now (see section 7).
3. **Properties:** categories (up to two) and industries (up to two), the standard contract or EULA link, the privacy policy link and the support link.
4. **Offer listing:** use the text below. All media must be PNG.
5. **Technical configuration:** upload the `.pbiviz` and the sample `.pbix`.
6. **Availability:** choose markets.
7. **Review and publish.**

### Listing text

**Name:** Toggle Slicer

**Summary (search results):**
> Turn On/Off columns into switch, checkbox or radio slicers, singly or in a group.

**Search keywords (up to three):** `toggle`, `switch`, `slicer`

**Categories:** Filters (and optionally Other). **Industries:** leave blank or pick any that fit; the visual is industry-neutral.

**Description (up to 3,000 characters):**

```
Toggle Slicer turns any On/Off column into a clean, purpose-built slicer. Use one toggle for a simple "show targets" switch, or a group of up to 12 for a tidy options panel.

Draw each toggle as a sliding switch, a checkbox or a radio button. Every toggle writes a real slicer-style filter, so your DAX reads it with SELECTEDVALUE, bookmarks restore it, and Sync slicers carry it between pages.

HIGHLIGHTS
• One toggle or a group - drop in one On/Off column, or up to 12 from one table
• Switch, checkbox or radio styles, with an optional raised 3D look
• Only one active - pick-one-lens behavior for radio-style groups
• Master switch - turn every toggle On or Off, with a mixed state
• Group enable - grey out the whole group without losing each toggle's state
• Style every layer - the group, its label, each toggle and its handle, and the labels each get their own background, border (flat, embossed or sunken), corner radius and padding
• Switch text that stays put while the handle wipes it in and out
• Toggle labels, state labels and a group label with your own text, fonts and alignment
• Responsive sizing that fills the visual, or a fixed size
• Follows your report theme, supports Windows High Contrast, and is fully keyboard and screen-reader accessible

GETTING STARTED
Add the visual to a page and the placeholder shows what to build: a one-column table and a measure for a single toggle, or a CROSSJOIN table for a group, with copyable DAX. Drag the column into Toggles and click.

WORKS WITH YOUR MODEL
Columns accept On/Off, True/False or 1/0. Use measures for flexible logic, or a bridge table to filter real data through relationships. The README documents both patterns.

PRIVACY
The visual makes no network requests, collects no data and needs no special permissions.
```

## 6. After you submit

- Partner Center runs validation and may email questions or a rejection with policy numbers ([policy 1180](https://learn.microsoft.com/en-us/legal/marketplace/certification-policies#1180-power-bi-visuals)). Fix and resubmit.
- A new visual is on its AppSource page within hours, then takes about 10 to 14 more days to reach Power BI Desktop and the service. An update takes up to about two weeks to take effect in reports.
- Review the listing in its test environment, then **Go live**.

## 7. Optional: Power BI certification

Certified visuals get a badge and work in features like export to PowerPoint and email subscriptions. Publish first, then request it (it can take up to about four weeks the first time). Requirements, beyond the checks in section 1:

- [ ] A repository with code for **only this visual**, and a branch named exactly **`certification`** whose source matches the submitted package (it can only change during a resubmission).
- [ ] The repository must be readable by the Power BI team. If it's private, create a dedicated account, enable two-factor authentication, generate recovery codes and give read access to the `pbicvsupport` account, then put the link and credentials in **Notes for certification** on the Review and publish page.
- [ ] `.gitignore` excludes `node_modules`, `.tmp` and `dist` ✅. `package.json` has `typescript`, `eslint` and `eslint-plugin-powerbi-visuals` ✅, and an `eslint` script ✅.
- [ ] `npm audit` with no moderate or high findings. **Open question:** the dev-toolchain findings in section 1 may need a note to the reviewers. Check whether the current `powerbi-visuals-tools` release has cleared them before requesting certification.
- [ ] The compiled package must exactly match the submitted one, so don't rebuild with a different command between submitting and certifying (`npm run package` is a plain `pbiviz package`).
