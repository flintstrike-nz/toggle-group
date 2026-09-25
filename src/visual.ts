/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import ITooltipService = powerbi.extensibility.ITooltipService;

import { VisualFormattingSettingsModel } from "./settings";

/**
 * Matches each bound On/Off field's category values. Accepts a few common conventions for the
 * same two states, not just the "On"/"Off" text used in the starter DAX below, so a report
 * author's own tables don't have to match it exactly - and each field is checked independently,
 * so different toggles in the same group can use different conventions.
 */
const ON_VALUES = new Set(["on", "true", "1"]);
const OFF_VALUES = new Set(["off", "false", "0"]);

/**
 * Starter DAX shown (with Copy buttons) on the landing page, matching README's own documented
 * example exactly. DAX identifiers aren't localized - like the on/off label values themselves,
 * they're literal code to paste verbatim, not natural-language UI text.
 *
 * One table per *group*, one column per toggle: each column's name ("Show budget") is what the
 * visual shows as that toggle's name, and each column is its own field in the Toggles well.
 * CROSSJOIN gives the table every On/Off combination, which is what lets each column be filtered
 * independently - filtering "Show budget" to On still leaves both values of every other column.
 * The measures compare against "On" (or "Off" for Group enable) rather than using SELECTEDVALUE's
 * fallback argument, so an unfiltered column - first load, before any click - reads as Off (or
 * enabled) exactly as readStatesFromFilters() renders it.
 */
const TOGGLE_TABLE_DAX = `Budget Options =
CROSSJOIN(
    DATATABLE("Show budget", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Include ED", STRING, {{"On"}, {"Off"}}),
    DATATABLE("Exclude outliers", STRING, {{"On"}, {"Off"}})
)`;
const TOGGLE_MEASURE_DAX = `Show Budget State =
IF(
    SELECTEDVALUE('Budget Options'[Show budget]) = "On",
    1,
    0
)`;
const GROUP_GATE_DAX = `Show Budget Active =
IF(
    SELECTEDVALUE('Budget Options'[Options enabled]) <> "Off",
    [Show Budget State],
    0
)`;

type FilterTarget = { table: string; column: string };

/**
 * One row of the group. "toggle" and "enable" rows are each bound to their own On/Off field and
 * own one basic filter in general.filter; "master" is a visual-only header whose state is always
 * derived from its children (see updateMasterState()), so it has no field, filter or identity.
 */
interface GroupItem {
    kind: "enable" | "master" | "toggle";
    name: string;
    // Indent depth - 0 for a header at the very top, +1 below each header above it.
    level: number;
    isOn: boolean;
    // Master only: some-but-not-all children On (never set in Only one active mode - see
    // updateMasterState()).
    isMixed: boolean;
    category?: DataViewCategoryColumn;
    target?: FilterTarget;
    onValue?: powerbi.PrimitiveValue;
    offValue?: powerbi.PrimitiveValue;
    onRowIndex?: number;
    offRowIndex?: number;
}

/** The DOM for one row - pooled and reused across renders (see ensureRowPool()). */
interface RowElements {
    rowEl: HTMLElement;
    nameEl: HTMLElement;
    cellEl: HTMLElement;
    offLabelEl: HTMLElement;
    onLabelEl: HTMLElement;
    innerOffEl: HTMLElement;
    innerOnEl: HTMLElement;
    switchEl: HTMLElement;
}

// Gives each Visual instance's title element a unique id (a report page can have more than one of
// these visuals), for the group's aria-labelledby - see render()'s title handling.
let nextInstanceId = 0;

export class Visual implements IVisual {
    private events: IVisualEventService;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private localizationManager: ILocalizationManager;
    private tooltipService: ITooltipService;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private formattingSettingsService: FormattingSettingsService;

    private target: HTMLElement;
    private frameEl: HTMLElement;
    private titleWrapEl: HTMLElement;
    private titleEl: HTMLElement;
    private groupEl: HTMLElement;
    private childrenEl: HTMLElement;
    private messageEl: HTMLElement;
    private landingPageEl: HTMLElement;
    private landingHeadingEl: HTMLElement;
    private landingHintEl: HTMLElement;
    private landingCopyStatusEl: HTMLElement;

    private items: GroupItem[] = [];
    private rows: RowElements[] = [];
    // Whether titleSettings.text / groupSettings.masterLabel have ever been explicitly set by a
    // report author (checked against the raw dataView object, not the populated settings model,
    // which can't tell "never touched" apart from "explicitly cleared to blank") - computed once
    // per update() since render() needs them too.
    private hasCustomTitleText: boolean = false;
    private hasCustomMasterLabel: boolean = false;
    // The stale-filter set cleanUpStaleFilters() last tried to remove, so a host that doesn't echo
    // the cleaned-up jsonFilters back can't trap update() in a re-apply loop.
    private lastStaleCleanup: string = "";
    // Per-button pending "restore the Copy label" timers, so a second click during the ~1.5s
    // confirmation window replaces (rather than races) the first click's timer - see
    // copyToClipboard().
    private readonly copyResetTimers = new WeakMap<HTMLButtonElement, number>();

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.localizationManager = this.host.createLocalizationManager();
        this.tooltipService = this.host.tooltipService;
        // Passing the localization manager here is what makes settings.ts's displayNameKey/
        // descriptionKey fields actually resolve - without it, FormattingSettingsService falls
        // back to the (absent) literal displayName/description on those slices.
        this.formattingSettingsService = new FormattingSettingsService(this.localizationManager);

        this.target = options.element;
        this.target.classList.add("toggle-slicer-visual");

        // The bordered box (containerSettings) around everything the group renders - the title
        // included, like a fieldset around its legend.
        this.frameEl = document.createElement("div");
        this.frameEl.className = "toggle-group-frame";

        // A static heading this visual draws itself (separate from Power BI's own native visual
        // title, which this code has no control over) - wraps the group so it can sit above it
        // (Above) or beside it (Inline left/right).
        this.titleWrapEl = document.createElement("div");
        this.titleWrapEl.className = "toggle-slicer-wrap";

        this.titleEl = document.createElement("span");
        this.titleEl.className = "toggle-slicer__title";
        this.titleEl.id = `toggle-slicer-title-${++nextInstanceId}`;

        // Rows are added/removed by ensureRowPool() as fields are bound/unbound.
        this.groupEl = document.createElement("div");
        this.groupEl.className = "toggle-group";

        // The toggle rows proper, after any header rows (Group enable, master) that sit directly
        // in groupEl. display: contents, so they still share groupEl's grid; its own element only
        // exists so an exclusive radio list can be a radiogroup of radios alone, without the
        // checkbox-drawn headers inside it (see render()).
        this.childrenEl = document.createElement("div");
        this.childrenEl.className = "toggle-group__children";
        this.groupEl.appendChild(this.childrenEl);

        this.messageEl = document.createElement("div");
        this.messageEl.className = "toggle-slicer__message";

        this.landingPageEl = this.buildLandingPage();

        this.titleWrapEl.appendChild(this.titleEl);
        this.titleWrapEl.appendChild(this.groupEl);
        this.frameEl.appendChild(this.titleWrapEl);

        this.target.appendChild(this.frameEl);
        this.target.appendChild(this.messageEl);
        this.target.appendChild(this.landingPageEl);
    }

    /**
     * Builds one pooled row: a name cell plus the switch cell (the pre-group single toggle's own
     * off label / switch / on label trio, unchanged). Event handlers look the row's GroupItem up
     * by index at event time rather than capturing it, since the pool outlives any one update().
     */
    private buildRow(index: number): RowElements {
        const rowEl = document.createElement("div");
        rowEl.className = "toggle-group__row";

        const nameEl = document.createElement("span");
        nameEl.className = "toggle-group__name";

        const cellEl = document.createElement("div");
        cellEl.className = "toggle-slicer";

        const offLabelEl = document.createElement("span");
        offLabelEl.className = "toggle-slicer__label toggle-slicer__label--off";

        const switchEl = document.createElement("div");
        switchEl.className = "toggle-slicer__switch";

        const trackEl = document.createElement("div");
        trackEl.className = "toggle-slicer__track";

        // Toggle skin's sliding knob, and the radio skin's centre dot - see visual.less.
        const knobEl = document.createElement("div");
        knobEl.className = "toggle-slicer__knob";
        trackEl.appendChild(knobEl);

        // Checkbox skin's "on"/"mixed" mark - lives alongside the knob in the same track rather
        // than a separate DOM subtree, so every skin picks up the track's own colour/border/
        // depth-effect styling (applyColors()/is-depth) for free; visual.less shows only the parts
        // that match the row's skin (see renderSwitch()'s is-checkbox/is-radio classes).
        trackEl.appendChild(this.buildCheckmarkIcon());

        switchEl.appendChild(trackEl);

        // Label position "Inside switch": both states' text overlaid in one grid cell so the track
        // is sized to the wider of the two and doesn't change width when clicked - visual.less
        // shows only the current one. Decorative, since the switch's aria-label names both states.
        const innerEl = document.createElement("span");
        innerEl.className = "toggle-slicer__inner";
        innerEl.setAttribute("aria-hidden", "true");
        const innerOffEl = document.createElement("span");
        innerOffEl.className = "toggle-slicer__inner-label toggle-slicer__inner-label--off";
        const innerOnEl = document.createElement("span");
        innerOnEl.className = "toggle-slicer__inner-label toggle-slicer__inner-label--on";
        innerEl.appendChild(innerOffEl);
        innerEl.appendChild(innerOnEl);
        switchEl.appendChild(innerEl);

        const onLabelEl = document.createElement("span");
        onLabelEl.className = "toggle-slicer__label toggle-slicer__label--on";

        cellEl.appendChild(offLabelEl);
        cellEl.appendChild(switchEl);
        cellEl.appendChild(onLabelEl);

        rowEl.appendChild(nameEl);
        rowEl.appendChild(cellEl);

        switchEl.addEventListener("click", () => this.handleClick(index));
        // Clicking a row's name toggles it too, like a native <label> - a bigger hit target than
        // the switch alone, which matters most for the small checkbox/radio skins.
        nameEl.addEventListener("click", () => this.handleClick(index));
        switchEl.addEventListener("keydown", (event: KeyboardEvent) => this.handleKeyDown(event, index));
        switchEl.addEventListener("contextmenu", (event: MouseEvent) => this.handleContextMenu(event, index));
        switchEl.addEventListener("pointerenter", (event: PointerEvent) => this.showTooltip(event, index));
        switchEl.addEventListener("pointermove", (event: PointerEvent) => this.moveTooltip(event));
        switchEl.addEventListener("pointerleave", (event: PointerEvent) => this.hideTooltip(event));

        return { rowEl, nameEl, cellEl, offLabelEl, onLabelEl, innerOffEl, innerOnEl, switchEl };
    }

    /** Grows/shrinks the row pool to match this.items, reusing existing rows so focus survives a re-render. */
    private ensureRowPool(): void {
        while (this.rows.length < this.items.length) {
            const row = this.buildRow(this.rows.length);
            this.rows.push(row);
            this.childrenEl.appendChild(row.rowEl);
        }
        while (this.rows.length > this.items.length) {
            this.rows.pop().rowEl.remove();
        }
    }

    /**
     * Header rows go directly in groupEl, ahead of childrenEl; toggle rows go in childrenEl. Only
     * re-parents when the layout actually changed (a header added/removed from the Format pane or
     * well) - moving an element blurs it, so doing this on every render would drop keyboard focus
     * after each click.
     */
    private placeRows(): void {
        const headerEls = this.rows.filter((_row, index) => this.items[index].kind !== "toggle").map((row) => row.rowEl);
        const toggleEls = this.rows.filter((_row, index) => this.items[index].kind === "toggle").map((row) => row.rowEl);
        const expectedGroup = [...headerEls, this.childrenEl];
        const same = (actual: HTMLCollection, expected: Element[]) =>
            actual.length === expected.length && expected.every((el, i) => actual[i] === el);

        if (!same(this.groupEl.children, expectedGroup) || !same(this.childrenEl.children, toggleEls)) {
            expectedGroup.forEach((el) => this.groupEl.appendChild(el));
            toggleEls.forEach((el) => this.childrenEl.appendChild(el));
        }
    }

    /**
     * Builds the "no field bound yet" landing page: an info icon + instructional heading (matching
     * the host's own generic "Select or drag fields..." placeholder), a divider, a greyed-out
     * skeleton of a small toggle group so the placeholder previews what will render, a compact
     * hint about the one-field-per-toggle model, and (once the tile is big enough - see the
     * min-width/min-height container query in visual.less) a copyable starter DAX guide so a report
     * author can build the tables without leaving Power BI Desktop.
     */
    private buildLandingPage(): HTMLElement {
        const landingPageEl = document.createElement("div");
        landingPageEl.className = "toggle-slicer__landing";

        const headerEl = document.createElement("div");
        headerEl.className = "toggle-slicer__landing-header";
        headerEl.appendChild(this.buildInfoIcon());

        this.landingHeadingEl = document.createElement("span");
        this.landingHeadingEl.className = "toggle-slicer__landing-heading";
        headerEl.appendChild(this.landingHeadingEl);

        const dividerEl = document.createElement("div");
        dividerEl.className = "toggle-slicer__landing-divider";

        // Three skeleton rows - a name bar plus a track - with the lower two indented, previewing
        // a master switch over its children.
        const skeletonEl = document.createElement("div");
        skeletonEl.className = "toggle-slicer__landing-skeleton";
        for (let i = 0; i < 3; i++) {
            const skeletonRowEl = document.createElement("div");
            skeletonRowEl.className = "toggle-slicer__landing-skeleton-row";
            if (i > 0) {
                skeletonRowEl.classList.add("is-indented");
            }
            const skeletonNameEl = document.createElement("div");
            skeletonNameEl.className = "toggle-slicer__landing-skeleton-name";
            const skeletonTrackEl = document.createElement("div");
            skeletonTrackEl.className = "toggle-slicer__landing-skeleton-track";
            const skeletonKnobEl = document.createElement("div");
            skeletonKnobEl.className = "toggle-slicer__landing-skeleton-knob";
            skeletonTrackEl.appendChild(skeletonKnobEl);
            skeletonRowEl.appendChild(skeletonNameEl);
            skeletonRowEl.appendChild(skeletonTrackEl);
            skeletonEl.appendChild(skeletonRowEl);
        }

        this.landingHintEl = document.createElement("div");
        this.landingHintEl.className = "toggle-slicer__landing-hint";

        // Visually hidden, announced via aria-live - see copyToClipboard(). The Copy buttons' own
        // aria-label stays a stable action description ("Copy the ... DAX"), which is what's read
        // as their accessible name; a screen reader wouldn't otherwise notice the visible label
        // text changing to "Copied!"/"Copy failed" on its own, since that's not what gets announced.
        this.landingCopyStatusEl = document.createElement("div");
        this.landingCopyStatusEl.className = "toggle-slicer__visually-hidden";
        this.landingCopyStatusEl.setAttribute("role", "status");
        this.landingCopyStatusEl.setAttribute("aria-live", "polite");

        landingPageEl.appendChild(headerEl);
        landingPageEl.appendChild(dividerEl);
        landingPageEl.appendChild(skeletonEl);
        landingPageEl.appendChild(this.landingHintEl);
        landingPageEl.appendChild(this.buildLandingGuide());
        landingPageEl.appendChild(this.landingCopyStatusEl);

        return landingPageEl;
    }

    /** The copyable "one table per group, a measure per toggle, optional group gate" starter DAX guide - see buildLandingPage(). */
    private buildLandingGuide(): HTMLElement {
        const guideEl = document.createElement("div");
        guideEl.className = "toggle-slicer__landing-guide";

        const step = (key: string): HTMLElement => {
            const stepEl = document.createElement("div");
            stepEl.className = "toggle-slicer__landing-guide-step";
            stepEl.textContent = this.localizationManager.getDisplayName(key);
            return stepEl;
        };

        guideEl.appendChild(step("Visual_LandingPage_GuideTableIntro"));
        guideEl.appendChild(this.buildCodeBlock(TOGGLE_TABLE_DAX, "Visual_LandingPage_CopyTable_AriaLabel"));
        guideEl.appendChild(step("Visual_LandingPage_GuideMeasureIntro"));
        guideEl.appendChild(this.buildCodeBlock(TOGGLE_MEASURE_DAX, "Visual_LandingPage_CopyMeasure_AriaLabel"));
        guideEl.appendChild(step("Visual_LandingPage_GuideRepeat"));
        guideEl.appendChild(step("Visual_LandingPage_GuideEnableIntro"));
        guideEl.appendChild(this.buildCodeBlock(GROUP_GATE_DAX, "Visual_LandingPage_CopyGate_AriaLabel"));

        return guideEl;
    }

    /** A monospace DAX snippet plus a Copy button - see copyToClipboard() for the copy mechanics. */
    private buildCodeBlock(code: string, ariaLabelKey: string): HTMLElement {
        const wrapEl = document.createElement("div");
        wrapEl.className = "toggle-slicer__landing-code-wrap";

        const preEl = document.createElement("pre");
        preEl.className = "toggle-slicer__landing-code";
        const codeEl = document.createElement("code");
        codeEl.textContent = code;
        preEl.appendChild(codeEl);

        const copyButtonEl = document.createElement("button");
        copyButtonEl.type = "button";
        copyButtonEl.className = "toggle-slicer__landing-copy";
        copyButtonEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_CopyButton");
        copyButtonEl.setAttribute("aria-label", this.localizationManager.getDisplayName(ariaLabelKey));
        copyButtonEl.addEventListener("click", () => this.copyToClipboard(code, copyButtonEl));

        wrapEl.appendChild(preEl);
        wrapEl.appendChild(copyButtonEl);
        return wrapEl;
    }

    /**
     * Copies text to the clipboard from a click handler (a user gesture, needed by both approaches
     * below), trying the modern async Clipboard API first and falling back to the legacy
     * select-and-execCommand approach if it throws or is unavailable - some sandboxed iframe
     * contexts (which is how this visual always runs) allow one but not the other. Confirms the
     * outcome two ways: the button's own visible label briefly changes to "Copied!"/"Copy failed"
     * (its aria-label stays a stable action description throughout, so that's for sighted users),
     * and landingCopyStatusEl - a visually hidden aria-live region - announces the same outcome for
     * screen readers, who otherwise get no indication the visible text changed at all.
     */
    private async copyToClipboard(text: string, buttonEl: HTMLButtonElement): Promise<void> {
        let succeeded = false;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                succeeded = true;
            }
        }
        catch {
            succeeded = false;
        }

        if (!succeeded) {
            // finally (not the end of the try block) guarantees the textarea is always removed and
            // focus restored - even if execCommand throws, or succeeds but leaves focus stuck on an
            // element that's about to be removed - rather than only on the non-throwing path.
            const previouslyFocused = document.activeElement as HTMLElement | null;
            const textareaEl = document.createElement("textarea");
            try {
                textareaEl.value = text;
                textareaEl.style.position = "fixed";
                textareaEl.style.opacity = "0";
                document.body.appendChild(textareaEl);
                textareaEl.focus();
                textareaEl.select();
                succeeded = document.execCommand("copy");
            }
            catch {
                succeeded = false;
            }
            finally {
                textareaEl.remove();
                previouslyFocused?.focus();
            }
        }

        // Cancels a still-pending restore from an earlier click on this same button - without this,
        // clicking again inside the ~1.5s confirmation window lets the first click's timer fire
        // *after* the second's, permanently freezing the label on "Copied!"/"Copy failed" instead of
        // eventually restoring "Copy". Always resolves the label fresh from the resjson key, rather
        // than capturing/restoring buttonEl.textContent, for the same reason.
        const existingTimer = this.copyResetTimers.get(buttonEl);
        if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
        }

        const outcomeKey = succeeded ? "Visual_LandingPage_CopyButton_Copied" : "Visual_LandingPage_CopyButton_Failed";
        buttonEl.textContent = this.localizationManager.getDisplayName(outcomeKey);

        // An aria-live region only announces when its text content actually changes - assigning the
        // same string twice in a row (e.g. two successful copies, from the same button or the
        // other one sharing this region) is not a DOM mutation, so the second announcement would
        // otherwise be silently dropped. Clearing it first, then setting the real text on a short
        // delay, guarantees a distinct mutation every time regardless of what it said last.
        this.landingCopyStatusEl.textContent = "";
        window.setTimeout(() => {
            this.landingCopyStatusEl.textContent = this.localizationManager.getDisplayName(outcomeKey);
        }, 50);

        const timerId = window.setTimeout(() => {
            buttonEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_CopyButton");
            this.copyResetTimers.delete(buttonEl);
        }, 1500);
        this.copyResetTimers.set(buttonEl, timerId);
    }

    private buildInfoIcon(): SVGElement {
        const svgNS = "http://www.w3.org/2000/svg";
        const icon = document.createElementNS(svgNS, "svg");
        icon.setAttribute("class", "toggle-slicer__landing-icon");
        icon.setAttribute("viewBox", "0 0 16 16");
        icon.setAttribute("aria-hidden", "true");

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "8");
        circle.setAttribute("cy", "8");
        circle.setAttribute("r", "7");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", "currentColor");
        circle.setAttribute("stroke-width", "1.2");

        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", "8");
        dot.setAttribute("cy", "4.6");
        dot.setAttribute("r", "0.9");
        dot.setAttribute("fill", "currentColor");

        const stem = document.createElementNS(svgNS, "line");
        stem.setAttribute("x1", "8");
        stem.setAttribute("y1", "7");
        stem.setAttribute("x2", "8");
        stem.setAttribute("y2", "11.5");
        stem.setAttribute("stroke", "currentColor");
        stem.setAttribute("stroke-width", "1.3");
        stem.setAttribute("stroke-linecap", "round");

        icon.appendChild(circle);
        icon.appendChild(dot);
        icon.appendChild(stem);

        return icon;
    }

    /**
     * The checkbox skin's mark - hand-built like buildInfoIcon() rather than an image asset. Holds
     * both a tick (shown when On) and a dash (shown when a master row is Mixed); visual.less picks
     * which one is visible. Its colour comes from --toggle-knob-color-on, the same variable the
     * toggle skin's knob uses once "on", since the mark is only ever shown in an on/mixed state.
     */
    private buildCheckmarkIcon(): SVGElement {
        const svgNS = "http://www.w3.org/2000/svg";
        const icon = document.createElementNS(svgNS, "svg");
        icon.setAttribute("class", "toggle-slicer__checkmark");
        icon.setAttribute("viewBox", "0 0 16 16");
        icon.setAttribute("aria-hidden", "true");

        const check = document.createElementNS(svgNS, "path");
        check.setAttribute("class", "toggle-slicer__checkmark-tick");
        check.setAttribute("d", "M3.5 8.5L6.5 11.5L12.5 4.5");

        const dash = document.createElementNS(svgNS, "path");
        dash.setAttribute("class", "toggle-slicer__checkmark-dash");
        dash.setAttribute("d", "M4 8H12");

        for (const path of [check, dash]) {
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "currentColor");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            icon.appendChild(path);
        }

        return icon;
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);

        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const objects = dataView && dataView.metadata && dataView.metadata.objects;
            const titleSettingsObjects = objects && objects["titleSettings"];
            const groupSettingsObjects = objects && objects["groupSettings"];
            this.hasCustomTitleText = !!titleSettingsObjects && titleSettingsObjects["text"] !== undefined;
            this.hasCustomMasterLabel = !!groupSettingsObjects && groupSettingsObjects["masterLabel"] !== undefined;

            this.applyColors(dataView);
            this.applySize();
            this.applyFonts();
            this.applyContainer();

            const { enableColumn, toggleColumns } = this.getColumns(dataView);

            // The Toggles well is what makes this a toggle group - a Group enable field on its own
            // has nothing to enable, so it still shows the landing page.
            if (toggleColumns.length === 0) {
                this.items = [];
                // Removing the last field would otherwise leave its filter filtering the report
                // invisibly behind the landing page.
                this.cleanUpStaleFilters(options.jsonFilters);
                this.showLandingPage();
                this.events.renderingFinished(options);
                return;
            }

            const enableItem = enableColumn ? this.parseColumn(enableColumn, "enable") : undefined;
            const toggleItems = toggleColumns.map((column) => this.parseColumn(column, "toggle"));
            const invalidColumn = [enableColumn, ...toggleColumns].find((column, index) =>
                column && !(index === 0 ? enableItem : toggleItems[index - 1]));

            if (invalidColumn) {
                this.items = [];
                // Names the offending field, since with a dozen fields bound "one of them is wrong"
                // isn't actionable. Function replacer, since a field's display name is arbitrary
                // report-author text that could contain "$&"-style replacement patterns.
                this.showMessage(this.localizationManager.getDisplayName("Visual_Validation_OnOffRequired")
                    .replace(/\{0\}/g, () => invalidColumn.source.displayName));
                this.events.renderingFinished(options);
                return;
            }

            const groupCard = this.formattingSettings.groupSettingsCard;
            const items: GroupItem[] = [];
            let level = 0;
            if (enableItem) {
                enableItem.level = level++;
                items.push(enableItem);
            }
            if (groupCard.masterSwitch.value) {
                const masterLabel = this.hasCustomMasterLabel
                    ? groupCard.masterLabel.value
                    : this.localizationManager.getDisplayName("Visual_MasterLabel_Default");
                items.push({ kind: "master", name: masterLabel, level: level++, isOn: false, isMixed: false });
            }
            for (const item of toggleItems) {
                item.level = level;
                items.push(item);
            }
            this.items = items;

            // State comes from the persisted filters, so bookmarks, sync slicers and reopening the
            // report all restore it.
            this.readStatesFromFilters(options.jsonFilters);
            this.updateMasterState();
            this.cleanUpStaleFilters(options.jsonFilters);

            this.showSection("group");
            this.render();

            this.events.renderingFinished(options);
        }
        catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        // The tooltip is host-rendered outside this visual's own element, so it won't disappear
        // on its own when the visual is removed - hide it explicitly.
        this.tooltipService.hide({ isTouchEvent: false, immediately: true });
    }

    /**
     * Splits the categorical columns by data role. Several columns reach the visual as one set of
     * rows holding every combination of their values - the group table's own CROSSJOIN rows when
     * they share a table (the recommended pattern), or a query-time cross join when they come from
     * unrelated tables - so each column is deduped independently later in parseColumn() rather
     * than read row-by-row. Toggles are sorted by their position in the field well (rolesIndex,
     * when the host provides it - it's not in the API typings) so the rows render in the order the
     * report author dropped them.
     */
    private getColumns(dataView: powerbi.DataView | undefined): { enableColumn?: DataViewCategoryColumn; toggleColumns: DataViewCategoryColumn[] } {
        const categories = (dataView && dataView.categorical && dataView.categorical.categories) || [];
        const wellIndex = (column: DataViewCategoryColumn): number => {
            const rolesIndex = (column.source as any).rolesIndex;
            const index = rolesIndex && rolesIndex.toggle && rolesIndex.toggle[0];
            return typeof index === "number" ? index : Number.MAX_SAFE_INTEGER;
        };

        const enableColumn = categories.find((column) => column.source.roles && column.source.roles["groupEnable"]);
        // Keyed by filter target (table + column), since that's what two rows would fight over:
        // the same field dropped into Toggles twice, or into both Group enable and Toggles, would
        // otherwise write conflicting filters for one column that readStatesFromFilters() then
        // collapses back into a single state. Group enable wins - it's seeded first - whether the
        // host sends that field as one column carrying both roles or as two separate columns.
        const targetKey = (column: DataViewCategoryColumn) => this.filterKey(this.getFilterTarget(column.source));
        const seen = new Set<string>(enableColumn ? [targetKey(enableColumn)] : []);
        const toggleColumns = categories
            .filter((column) => column.source.roles && column.source.roles["toggle"])
            .filter((column) => {
                const key = targetKey(column);
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            })
            .map((column, order) => ({ column, order }))
            .sort((a, b) => (wellIndex(a.column) - wellIndex(b.column)) || (a.order - b.order))
            .map(({ column }) => column);

        return { enableColumn, toggleColumns };
    }

    /**
     * Validates one bound field - it must have exactly two distinct values, one matching an On
     * alias and one an Off alias - and returns its GroupItem, or undefined if it doesn't. Keeps
     * the first row index where each value appears, for building that value's selection identity
     * (tooltips/context menu).
     */
    private parseColumn(column: DataViewCategoryColumn, kind: "enable" | "toggle"): GroupItem | undefined {
        const firstIndexByValue = new Map<string, number>();
        column.values.forEach((value, index) => {
            const normalized = this.normalize(value);
            if (!firstIndexByValue.has(normalized)) {
                firstIndexByValue.set(normalized, index);
            }
        });

        const distinct = Array.from(firstIndexByValue.keys());
        // Two *raw* values too, not just two after normalizing: a column holding "On", "ON" and
        // "Off" would otherwise pass, yet the filter can only name one raw On value, so rows
        // holding the other On variant would silently count as Off.
        const rawDistinctCount = new Set(column.values.map((value) => String(value))).size;
        const onKey = distinct.find((value) => ON_VALUES.has(value));
        const offKey = distinct.find((value) => OFF_VALUES.has(value));
        const target = this.getFilterTarget(column.source);
        if (distinct.length !== 2 || rawDistinctCount !== 2 || onKey === undefined || offKey === undefined || !target.table || !target.column) {
            return undefined;
        }

        const onRowIndex = firstIndexByValue.get(onKey);
        const offRowIndex = firstIndexByValue.get(offKey);
        return {
            kind,
            name: column.source.displayName,
            level: 0,
            isOn: false,
            isMixed: false,
            category: column,
            target,
            onValue: column.values[onRowIndex],
            offValue: column.values[offRowIndex],
            onRowIndex,
            offRowIndex
        };
    }

    private normalize(value: powerbi.PrimitiveValue): string {
        return String(value).trim().toLowerCase();
    }

    /**
     * toggleSettings.labelPosition and titleSettings.position both used to offer only a single
     * "inline" value (both On/Off labels flanking the switch, or the title before it) before it was
     * split into "inline-left"/"inline-right". A report saved with the old visual can still have
     * "inline" persisted in its dataView object - FormattingSettingsService doesn't reset a persisted
     * value just because it no longer appears in the property's current `items` list, so
     * card.labelPosition.value.value/titleCard.position.value.value can still read back "inline"
     * verbatim. Left unhandled, that value matches none of render()'s three classList checks, so no
     * order override applies at all - for the label specifically, that degrades to "whichever label
     * is next to the switch in DOM order" (Off before it, On after), i.e. the visible label silently
     * changes sides depending on state instead of consistently sitting on one side. Treating it as
     * "inline-left" (both properties' old "inline" behaviour put the relevant text before the switch)
     * keeps such a report's rendered position unchanged after upgrading.
     */
    private normalizeLegacyInlinePosition(value: string | number): string {
        return value === "inline" ? "inline-left" : String(value);
    }

    /** hostCapabilities.allowInteractions is undefined (not restricted) in the common case, so only an explicit false disables interaction. */
    private interactionsAllowed(): boolean {
        return this.host.hostCapabilities.allowInteractions !== false;
    }

    private get enableItem(): GroupItem | undefined {
        return this.items.find((item) => item.kind === "enable");
    }

    private get masterItem(): GroupItem | undefined {
        return this.items.find((item) => item.kind === "master");
    }

    private get childItems(): GroupItem[] {
        return this.items.filter((item) => item.kind === "toggle");
    }

    /** Every row below a Group enable header is disabled (greyed out, inert - but keeps its state) while that header is Off. */
    private isDisabled(item: GroupItem): boolean {
        const enableItem = this.enableItem;
        return !!enableItem && item !== enableItem && !enableItem.isOn;
    }

    private filterKey(target: FilterTarget): string {
        return `${target.table}\u0000${target.column}`;
    }

    /**
     * general.filter holds one basic filter per bound field (see applyStates()). A field with no
     * filter yet (first load, or a toggle newly added to the well) renders Off, matching the
     * starter DAX's `SELECTEDVALUE(...) = "On"` test on an unfiltered column - except Group
     * enable, which renders On so a freshly built group isn't born disabled; its starter DAX
     * tests `<> "Off"` to match.
     */
    private readStatesFromFilters(filters: powerbi.IFilter[] | undefined): void {
        const states = new Map<string, boolean>();
        for (const filter of (filters || []) as any[]) {
            const target = filter && filter.target;
            if (target && target.table && target.column && Array.isArray(filter.values)) {
                states.set(this.filterKey(target), filter.values.some((value) => ON_VALUES.has(this.normalize(value))));
            }
        }

        for (const item of this.items) {
            if (item.target) {
                const key = this.filterKey(item.target);
                item.isOn = states.has(key) ? states.get(key) : item.kind === "enable";
            }
        }
    }

    /**
     * The master row mirrors its children: On when all are On, Mixed when only some are. Under
     * Only one active, "all On" is impossible with more than one child, so there it's On whenever
     * any child is - i.e. it reads as "is anything in this group selected".
     */
    private updateMasterState(): void {
        const masterItem = this.masterItem;
        if (!masterItem) {
            return;
        }
        const children = this.childItems;
        const onCount = children.filter((item) => item.isOn).length;
        if (this.formattingSettings.groupSettingsCard.onlyOneActive.value) {
            masterItem.isOn = onCount > 0;
            masterItem.isMixed = false;
        } else {
            masterItem.isOn = children.length > 0 && onCount === children.length;
            masterItem.isMixed = onCount > 0 && onCount < children.length;
        }
    }

    /**
     * A field removed from the well leaves its filter behind in general.filter, silently filtering
     * the report with no visible control left to change it. Rewriting the filter set for the
     * fields that *are* bound drops it (or, with none bound, removing the property entirely). Only attempted once per distinct stale set (see
     * lastStaleCleanup), and never where interactions are disallowed.
     */
    private cleanUpStaleFilters(filters: powerbi.IFilter[] | undefined): void {
        const boundKeys = new Set(this.items.filter((item) => item.target).map((item) => this.filterKey(item.target)));
        const staleKeys = ((filters || []) as any[])
            .map((filter) => filter && filter.target && filter.target.table ? this.filterKey(filter.target) : "")
            .filter((key) => key && !boundKeys.has(key))
            .sort()
            .join("\u0001");

        if (!staleKeys) {
            // Nothing stale any more - forget the last attempt, so the same filter coming back
            // later (a bookmark, Sync slicers, or the same field removed again) is cleaned too.
            this.lastStaleCleanup = "";
            return;
        }
        // Keyed on the bound set too: if the group itself changes (a field added or removed)
        // while the same stale filter lingers, that's a different write, so it's retried.
        const attemptKey = `${staleKeys}\u0002${Array.from(boundKeys).sort().join("\u0001")}`;
        if (attemptKey === this.lastStaleCleanup || !this.interactionsAllowed()) {
            return;
        }
        this.lastStaleCleanup = attemptKey;
        if (this.items.length === 0) {
            // Nothing bound to write a replacement set for - clear the property outright.
            this.host.applyJsonFilter(null, "general", "filter", powerbi.FilterAction.remove);
            return;
        }
        this.applyStates(new Map());
    }

    /**
     * Writes one real slicer-style basic filter per bound field (persisted in general.filter, not a
     * selection) - so state survives save/reopen, works with bookmarks and sync slicers, is readable
     * by DAX, and propagates through model relationships (the bridge pattern). An Off toggle
     * applies its Off value rather than no filter at all, since the bridge pattern maps the Off row
     * to every member. Always writes the *whole* group's set, since general.filter holds exactly
     * one filter array for this visual.
     */
    private applyStates(changes: Map<GroupItem, boolean>): void {
        const filters = [];
        for (const item of this.items) {
            if (!item.target) {
                continue;
            }
            const isOn = changes.has(item) ? changes.get(item) : item.isOn;
            item.isOn = isOn;
            filters.push({
                $schema: "https://powerbi.com/product/schema#basic",
                target: item.target,
                operator: "In",
                values: [isOn ? item.onValue : item.offValue],
                filterType: 1 // Basic
            });
        }

        this.host.applyJsonFilter(filters as any, "general", "filter", powerbi.FilterAction.merge);
        this.updateMasterState();
        this.render();
    }

    /**
     * Applies the group's rules to a click on row `index`:
     * - Master: Off (or Mixed) -> every child On; On -> every child Off. Under Only one active,
     *   "every child On" isn't allowed, so turning the master On selects just the first child.
     * - Group enable: flips only itself - its children keep their own state while disabled.
     * - Toggle: flips itself; under Only one active, turning one On turns every other child Off
     *   and turning one Off clears the group. A radio-skinned toggle under Only one active can't be
     *   clicked Off again, matching a native radio group (use the master switch to clear the group).
     */
    private handleClick(index: number): void {
        const item = this.items[index];
        if (!item || !this.interactionsAllowed() || this.isDisabled(item)) {
            return;
        }

        const onlyOneActive = this.formattingSettings.groupSettingsCard.onlyOneActive.value;
        const changes = new Map<GroupItem, boolean>();
        const children = this.childItems;

        if (item.kind === "master") {
            const turnOn = !item.isOn;
            children.forEach((child, childIndex) => changes.set(child, turnOn && (!onlyOneActive || childIndex === 0)));
        } else if (item.kind === "enable") {
            changes.set(item, !item.isOn);
        } else if (!onlyOneActive) {
            changes.set(item, !item.isOn);
        } else {
            // Every click under Only one active leaves at most one child On, even if the group
            // arrived with several On (e.g. the rule was switched on after they were set): turning
            // one On keeps just it, and turning one Off clears the group. A radio can't be clicked
            // Off, so clicking an On radio only clears any others still On - or does nothing.
            const isRadio = this.skinFor(item) === "radio";
            if (item.isOn && isRadio && children.every((child) => child === item || !child.isOn)) {
                return;
            }
            const keepOn = !item.isOn || isRadio ? item : undefined;
            children.forEach((child) => changes.set(child, child === keepOn));
        }

        this.applyStates(changes);
    }

    /**
     * Space/Enter activate, like a native checkbox/switch. Arrow keys and Home/End move focus
     * between the group's enabled rows (focus only - activating still takes Space/Enter, so
     * browsing a radio group with the keyboard never silently rewrites the report's filters).
     */
    private handleKeyDown(event: KeyboardEvent, index: number): void {
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            this.handleClick(index);
            return;
        }

        // Inside a radiogroup, arrows stay among the radios (and among the headers, from a header),
        // rather than stepping across the radiogroup's boundary into controls outside it.
        const current = this.items[index];
        const isRadioGroup = this.formattingSettings.groupSettingsCard.onlyOneActive.value
            && this.formattingSettings.toggleSettingsCard.controlStyle.value.value === "radio";
        const sameZone = (item: GroupItem) => !isRadioGroup || (item.kind === "toggle") === (current.kind === "toggle");
        const focusable = this.items
            .map((item, itemIndex) => ({ item, itemIndex }))
            .filter(({ item }) => !this.isDisabled(item) && sameZone(item))
            .map(({ itemIndex }) => itemIndex);
        const position = focusable.indexOf(index);
        let nextIndex: number | undefined;

        switch (event.key) {
            case "ArrowDown":
            case "ArrowRight":
                nextIndex = focusable[Math.min(position + 1, focusable.length - 1)];
                break;
            case "ArrowUp":
            case "ArrowLeft":
                nextIndex = focusable[Math.max(position - 1, 0)];
                break;
            case "Home":
                nextIndex = focusable[0];
                break;
            case "End":
                nextIndex = focusable[focusable.length - 1];
                break;
            default:
                return;
        }

        event.preventDefault();
        if (nextIndex !== undefined && this.rows[nextIndex]) {
            this.rows[nextIndex].switchEl.focus();
        }
    }

    /** The selection identity of the row currently representing `item`'s state, for tooltips and the context menu. */
    private identityFor(item: GroupItem): ISelectionId | undefined {
        if (!item.category) {
            return undefined;
        }
        const rowIndex = item.isOn ? item.onRowIndex : item.offRowIndex;
        return this.host.createSelectionIdBuilder().withCategory(item.category, rowIndex).createSelectionId();
    }

    private handleContextMenu(event: MouseEvent, index: number): void {
        event.preventDefault();

        const item = this.items[index];
        // A disabled row is inert - the host menu's filter/drill actions would otherwise bypass
        // Group enable just as a click would.
        if (!item || !this.interactionsAllowed() || this.isDisabled(item)) {
            return;
        }

        // The master row has no field of its own - an empty identity still gives the host's
        // general visual-level menu, matching the SDK's own context-menu sample.
        const identity = this.identityFor(item) || ({} as ISelectionId);
        this.selectionManager.showContextMenu(identity, { x: event.clientX, y: event.clientY });
    }

    /**
     * Applies track/knob/label colours, substituting the theme's high-contrast palette when active.
     * Outside high contrast, the On colour itself follows the report theme's first data colour
     * until a report author picks their own - detected by checking the raw dataView object rather
     * than the populated settings model, since the latter always has *some* value (the settings.ts
     * default) and can't tell "never touched" apart from "explicitly set to the same value as the
     * default".
     */
    private applyColors(dataView: powerbi.DataView | undefined): void {
        const card = this.formattingSettings.toggleSettingsCard;
        const palette = this.host.colorPalette;

        if (palette.isHighContrast) {
            this.target.style.setProperty("--toggle-off-color", palette.background.value);
            this.target.style.setProperty("--toggle-on-color", palette.background.value);
            this.target.style.setProperty("--toggle-track-border-color", palette.foreground.value);
            this.target.style.setProperty("--toggle-track-border-color-on", palette.foregroundSelected.value);
            this.target.style.setProperty("--toggle-knob-color", palette.foreground.value);
            this.target.style.setProperty("--toggle-knob-color-on", palette.foregroundSelected.value);
            this.target.style.setProperty("--toggle-label-color", palette.foreground.value);
            this.target.style.setProperty("--toggle-border-width", `${card.borderWidth.value}px`);
        } else {
            const toggleSettingsObjects = dataView && dataView.metadata && dataView.metadata.objects && dataView.metadata.objects["toggleSettings"];
            const hasCustomOnColor = !!(toggleSettingsObjects && toggleSettingsObjects["onColor"]);
            const onColor = hasCustomOnColor ? card.onColor.value.value : palette.getColor("toggleOnColor").value;
            const borderColor = card.showBorder.value ? card.borderColor.value.value : "transparent";

            this.target.style.setProperty("--toggle-off-color", card.offColor.value.value);
            this.target.style.setProperty("--toggle-on-color", onColor);
            this.target.style.setProperty("--toggle-track-border-color", borderColor);
            this.target.style.setProperty("--toggle-track-border-color-on", borderColor);
            this.target.style.setProperty("--toggle-border-width", `${card.borderWidth.value}px`);
            this.target.style.setProperty("--toggle-knob-color", "#ffffff");
            this.target.style.setProperty("--toggle-knob-color-on", "#ffffff");
            this.target.style.setProperty("--toggle-label-color", "#605e5c");
        }
    }

    /**
     * Applies every toggle's height (width always follows at a fixed ratio - see the
     * --toggle-track-width calc() in visual.less) via CSS custom properties consumed by
     * .toggle-slicer__switch. "Fixed" mode is a class switch to a literal height (see
     * renderSwitch()); "Responsive" mode's actual scaling (clamp() + cqh container query units,
     * shared out across --toggle-row-count rows) all lives in the stylesheet - this only ever
     * supplies the three bounds, never a computed size itself.
     */
    private applySize(): void {
        const card = this.formattingSettings.sizeSettingsCard;

        // minHeight/maxHeight are independent NumUpDowns (each just its own 8-200 bound), so a
        // report author can freely set Min above Max - clamp() gives the minimum precedence when its
        // own bounds are reversed, silently ignoring whichever was meant to be the ceiling. Sorting
        // them here guarantees the smaller of the two is always the effective floor, regardless of
        // which field a report author calls "min" or "max".
        const minHeight = Math.min(card.minHeight.value, card.maxHeight.value);
        const maxHeight = Math.max(card.minHeight.value, card.maxHeight.value);

        this.target.style.setProperty("--toggle-min-height", `${minHeight}px`);
        this.target.style.setProperty("--toggle-max-height", `${maxHeight}px`);
        this.target.style.setProperty("--toggle-fixed-height", `${card.fixedHeight.value}px`);
    }

    /**
     * Applies the title's, toggle names' and on/off labels' font family/size/weight/style/decoration/
     * colour as CSS custom properties, each independently customizable from their own FontControl in
     * the Format pane. There's no host API for reading the report theme's actual typography (unlike
     * colour's host.colorPalette.getColor()), so these are static defaults, not a live theme readout.
     * Colour specifically is still forced to the high-contrast palette's foreground when active,
     * same as applyColors() already does for --toggle-label-color - a custom Format-pane colour
     * isn't guaranteed legible against a high-contrast theme's background.
     */
    private applyFonts(): void {
        const palette = this.host.colorPalette;
        const titleCard = this.formattingSettings.titleSettingsCard;
        const toggleCard = this.formattingSettings.toggleSettingsCard;
        const nameCard = this.formattingSettings.nameSettingsCard;

        const fonts: Array<[string, typeof titleCard.font, string]> = [
            ["title", titleCard.font, titleCard.fontColor.value.value],
            ["label", toggleCard.labelFont, toggleCard.labelFontColor.value.value],
            ["name", nameCard.font, nameCard.fontColor.value.value]
        ];

        for (const [prefix, font, color] of fonts) {
            this.target.style.setProperty(`--toggle-${prefix}-font-family`, font.fontFamily.value);
            this.target.style.setProperty(`--toggle-${prefix}-font-size`, `${font.fontSize.value}px`);
            this.target.style.setProperty(`--toggle-${prefix}-font-weight`, font.bold.value ? "bold" : "normal");
            this.target.style.setProperty(`--toggle-${prefix}-font-style`, font.italic.value ? "italic" : "normal");
            this.target.style.setProperty(`--toggle-${prefix}-text-decoration`, font.underline.value ? "underline" : "none");
            this.target.style.setProperty(`--toggle-${prefix}-font-color`, palette.isHighContrast ? palette.foreground.value : color);
        }
    }

    /**
     * The group's container box: one of a fixed set of border treatments (classes on frameEl -
     * see .toggle-group-frame in visual.less) over the report author's own colour/width/radius,
     * plus padding, vertical alignment and an optional fill. High contrast swaps the border to the
     * theme foreground and drops the fill, for the same legibility reason applyColors() does.
     */
    private applyContainer(): void {
        const card = this.formattingSettings.containerSettingsCard;
        const palette = this.host.colorPalette;
        const borderStyle = String(card.borderStyle.value.value);

        this.frameEl.classList.remove("is-border-none", "is-border-flat", "is-border-embossed", "is-border-gutter");
        this.frameEl.classList.add(`is-border-${borderStyle}`);
        this.frameEl.classList.remove("is-valign-top", "is-valign-middle", "is-valign-bottom");
        this.frameEl.classList.add(`is-valign-${card.verticalAlignment.value.value}`);

        this.frameEl.style.setProperty("--toggle-frame-border-color", palette.isHighContrast ? palette.foreground.value : card.borderColor.value.value);
        this.frameEl.style.setProperty("--toggle-frame-border-width", `${card.borderWidth.value}px`);
        this.frameEl.style.setProperty("--toggle-frame-radius", `${card.cornerRadius.value}px`);
        this.frameEl.style.setProperty("--toggle-frame-padding", `${card.padding.value}px`);
        this.frameEl.style.backgroundColor = card.showBackground.value && !palette.isHighContrast ? card.backgroundColor.value.value : "";
    }

    /**
     * The skin a row is drawn with. Header rows (master, Group enable) are never radios - they're
     * not one of the mutually exclusive options - so under the radio skin they're drawn as
     * checkboxes instead, the conventional "select all"/"enable" control above a radio list.
     */
    private skinFor(item: GroupItem): "toggle" | "checkbox" | "radio" {
        const skin = String(this.formattingSettings.toggleSettingsCard.controlStyle.value.value);
        if (skin === "radio") {
            return item.kind === "toggle" ? "radio" : "checkbox";
        }
        return skin === "checkbox" ? "checkbox" : "toggle";
    }

    private render(): void {
        this.ensureRowPool();
        this.placeRows();

        const groupCard = this.formattingSettings.groupSettingsCard;
        const nameCard = this.formattingSettings.nameSettingsCard;
        const titleCard = this.formattingSettings.titleSettingsCard;
        const toggleCard = this.formattingSettings.toggleSettingsCard;

        // Shows a real, localized default until a report author sets their own text - settings.ts's
        // own static default is deliberately blank so this doesn't fall back to fixed English UI
        // copy outside ILocalizationManager. Once hasCustomTitleText is true (the property has ANY
        // persisted value, including a deliberately-cleared blank one), the report-authored value
        // always wins, so clearing the field still shows no title.
        const titleText = this.hasCustomTitleText
            ? titleCard.text.value
            : this.localizationManager.getDisplayName("Visual_TitleText_Default");
        this.titleEl.textContent = titleText;
        this.titleEl.style.display = titleText ? "" : "none";

        // "Inline left" needs no order override - titleEl already comes before groupEl in DOM
        // order. "Inline right" flips that via CSS order; "Above" (the default) stacks them in a
        // column with the title always first/top.
        const titlePosition = this.normalizeLegacyInlinePosition(titleCard.position.value.value);
        this.titleWrapEl.classList.toggle("toggle-slicer-wrap--stacked", titlePosition === "above");
        this.titleWrapEl.classList.toggle("toggle-slicer-wrap--inline-right", titlePosition === "inline-right");
        this.titleWrapEl.style.setProperty("--toggle-title-gap", `${titleCard.spacing.value}px`);

        // Where the whole title+group assembly sits in the container - applied to titleWrapEl
        // itself via CSS auto margins (see visual.less), not the shared "target" root, since target
        // is also the parent of the unrelated landing-page/validation-message sections.
        this.titleWrapEl.classList.remove("is-title-align-left", "is-title-align-center", "is-title-align-right", "is-title-align-justify");
        this.titleWrapEl.classList.add(`is-title-align-${titleCard.alignment.value.value}`);

        // Every names alignment but Left (Center, Right, Justify) moves the rows within the group's
        // width, which only has room to happen once the group (and so titleWrapEl around it) fills
        // the container's width - a shrink-wrapped group has no spare space to center or push into.
        const namesShown = nameCard.show.value;
        const nameAlignment = String(nameCard.alignment.value.value);
        this.titleWrapEl.classList.toggle("is-group-stretched", nameAlignment !== "left");

        // Grid layout knobs - see .toggle-group in visual.less for how the name/switch columns,
        // indent and --toggle-max-level (names-right's hanging indent) fit together.
        const namesRight = namesShown && nameCard.position.value.value === "right";
        this.groupEl.classList.toggle("is-names-hidden", !namesShown);
        this.groupEl.classList.toggle("is-names-right", namesRight);
        this.groupEl.classList.toggle("is-readonly", !this.interactionsAllowed());
        this.groupEl.classList.remove("is-align-left", "is-align-center", "is-align-right", "is-align-justify");
        this.groupEl.classList.add(`is-align-${nameAlignment}`);
        this.groupEl.style.setProperty("--toggle-row-gap", `${groupCard.rowSpacing.value}px`);
        this.groupEl.style.setProperty("--toggle-name-gap", `${nameCard.spacing.value}px`);
        this.groupEl.style.setProperty("--toggle-indent", `${groupCard.indent.value}px`);
        this.groupEl.style.setProperty("--toggle-max-level", String(Math.max(0, ...this.items.map((item) => item.level))));
        // Responsive sizing shares the tile's height out across every row, rather than sizing
        // each toggle as if it had the whole tile to itself.
        this.target.style.setProperty("--toggle-row-count", String(Math.max(1, this.items.length)));

        // An exclusive radio list is announced as one radiogroup; anything else is a plain group.
        // Either way it's named by the title (when there is one), which is what tells several
        // toggle groups on one page apart for a screen reader user.
        // The radiogroup is childrenEl - the toggle rows alone - so the checkbox-drawn header rows
        // (Group enable, master) stay outside it as ordinary controls in the surrounding group.
        const isRadioGroup = groupCard.onlyOneActive.value && toggleCard.controlStyle.value.value === "radio";
        this.groupEl.setAttribute("role", "group");
        if (isRadioGroup) {
            this.childrenEl.setAttribute("role", "radiogroup");
        } else {
            this.childrenEl.removeAttribute("role");
        }
        for (const el of [this.groupEl, this.childrenEl]) {
            if (titleText) {
                el.setAttribute("aria-labelledby", this.titleEl.id);
            } else {
                el.removeAttribute("aria-labelledby");
            }
        }

        // Roving tabindex for a radiogroup (one Tab stop - the checked radio, or the first enabled
        // radio if none is checked - with arrow keys moving within it, per the ARIA radio group
        // pattern); header rows and every row outside a radiogroup are each their own Tab stop.
        const enabledRadioIndexes = this.items
            .map((item, index) => item.kind === "toggle" && !this.isDisabled(item) ? index : -1)
            .filter((index) => index !== -1);
        const checkedRadioIndex = enabledRadioIndexes.find((index) => this.items[index].isOn);
        const radioTabStop = checkedRadioIndex !== undefined ? checkedRadioIndex : enabledRadioIndexes[0];

        this.items.forEach((item, index) => {
            const row = this.rows[index];
            const isDisabled = this.isDisabled(item);

            // Name before or after the switch cell. DOM order (not CSS order) decides this, since
            // rows are display: contents inside one shared grid, where CSS order would reorder
            // every row's cells against each other rather than within the row.
            const firstEl = namesRight ? row.cellEl : row.nameEl;
            if (row.rowEl.firstElementChild !== firstEl) {
                row.rowEl.insertBefore(firstEl, row.rowEl.firstElementChild);
            }

            row.rowEl.style.setProperty("--toggle-level", String(item.level));
            row.nameEl.textContent = item.name;
            row.nameEl.style.display = namesShown ? "" : "none";
            row.nameEl.classList.toggle("is-disabled", isDisabled);
            row.cellEl.classList.toggle("is-disabled", isDisabled);

            const tabbable = !isDisabled && this.interactionsAllowed()
                && (!isRadioGroup || item.kind !== "toggle" || index === radioTabStop);
            this.renderSwitch(item, row, isDisabled, tabbable);
        });
    }

    /** Draws one row's switch cell - the pre-group single toggle's render(), applied per row. */
    private renderSwitch(item: GroupItem, row: RowElements, isDisabled: boolean, tabbable: boolean): void {
        const card = this.formattingSettings.toggleSettingsCard;
        const groupCard = this.formattingSettings.groupSettingsCard;
        const { switchEl, cellEl, onLabelEl, offLabelEl, innerOnEl, innerOffEl } = row;
        const isMixed = item.isMixed;
        const isOn = item.isOn && !isMixed;

        switchEl.classList.toggle("is-on", isOn);
        switchEl.classList.toggle("is-off", !isOn && !isMixed);
        switchEl.classList.toggle("is-mixed", isMixed);
        switchEl.classList.toggle("is-depth", card.depthEffect.value);
        switchEl.classList.toggle("is-size-fixed", this.formattingSettings.sizeSettingsCard.mode.value.value === "fixed");

        // Reflects hostCapabilities.allowInteractions (e.g. Focus mode thumbnails, some export/embed
        // contexts) visually and removes the switch from the tab order, matching handleClick's own
        // guard rather than leaving a focusable control that silently does nothing when clicked.
        switchEl.classList.toggle("is-readonly", !this.interactionsAllowed());
        switchEl.classList.toggle("is-disabled", isDisabled);
        switchEl.setAttribute("tabindex", tabbable ? "0" : "-1");
        if (isDisabled) {
            switchEl.setAttribute("aria-disabled", "true");
        } else {
            switchEl.removeAttribute("aria-disabled");
        }

        // Graphical skin only - filter behaviour doesn't change between shapes, so this only swaps
        // the shown shape and its role. A radio-skinned row is only announced as a radio inside an
        // exclusive (Only one active) group; in an independent group it behaves like a checkbox, so
        // it's announced as one rather than promising radio semantics it doesn't have.
        const skin = this.skinFor(item);
        switchEl.classList.toggle("is-checkbox", skin === "checkbox");
        switchEl.classList.toggle("is-radio", skin === "radio");
        const role = skin === "toggle" ? "switch" : skin === "radio" && groupCard.onlyOneActive.value ? "radio" : "checkbox";
        switchEl.setAttribute("role", role);
        // role="switch" has no "mixed" state in ARIA - its aria-label still says "Mixed" below.
        switchEl.setAttribute("aria-checked", isMixed ? (role === "switch" ? "false" : "mixed") : String(isOn));

        onLabelEl.textContent = card.onLabel.value;
        offLabelEl.textContent = card.offLabel.value;
        cellEl.style.setProperty("--toggle-label-gap", `${card.labelSpacing.value}px`);

        // All positions show only the label matching the current state - "inline-left"/
        // "inline-right" only differ in which side of the switch that single label sits on, via CSS
        // order (see visual.less), not in what's shown. "inside" puts it in the toggle skin's track
        // instead (is-inside); a checkbox or radio is too small to hold text, so it falls back to
        // Label right, the conventional side for a checkbox's text.
        let labelPosition = this.normalizeLegacyInlinePosition(card.labelPosition.value.value);
        if (labelPosition === "inside" && skin !== "toggle") {
            labelPosition = "inline-right";
        }
        cellEl.classList.toggle("toggle-slicer--stacked", labelPosition === "above");
        cellEl.classList.toggle("toggle-slicer--inline-left", labelPosition === "inline-left");
        cellEl.classList.toggle("toggle-slicer--inline-right", labelPosition === "inline-right");

        // showLabels false always wins over the stylesheet's container-query auto-hide, regardless
        // of size. A Mixed master shows neither, since it's neither On nor Off.
        const showLabels = card.showLabels.value;
        const inside = showLabels && labelPosition === "inside";
        switchEl.classList.toggle("is-inside", inside);
        innerOnEl.textContent = inside ? card.onLabel.value : "";
        innerOffEl.textContent = inside ? card.offLabel.value : "";
        onLabelEl.style.display = showLabels && !inside && isOn ? "" : "none";
        offLabelEl.style.display = showLabels && !inside && !isOn && !isMixed ? "" : "none";

        // The aria-label always names the row and both states regardless of showLabels/names, since
        // hidden visible text makes the accessible name more important, not less. Names and label
        // text are arbitrary report-author input, so every token is substituted in a single pass
        // (text inserted for one token is never re-scanned, so a name containing "{2}" stays
        // verbatim), through a function replacer rather than a replacement-string literal -
        // String.prototype.replace would otherwise interpret "$&" or "$1" in that text as patterns.
        const currentLabel = isMixed
            ? this.localizationManager.getDisplayName("Visual_State_Mixed")
            : isOn ? card.onLabel.value : card.offLabel.value;
        const tokens = [item.name, card.offLabel.value, card.onLabel.value, currentLabel];
        const ariaLabelKey = role === "switch" ? "Visual_Switch_AriaLabel" : role === "radio" ? "Visual_Radio_AriaLabel" : "Visual_Checkbox_AriaLabel";
        const ariaLabel = this.localizationManager.getDisplayName(ariaLabelKey)
            .replace(/\{([0-3])\}/g, (_token, n: string) => tokens[Number(n)]);
        switchEl.setAttribute("aria-label", ariaLabel);
    }

    /**
     * Builds the filter target from the column's model expression (entity + column) rather than
     * queryName, which is only a display/query alias and goes stale when a table or column is
     * renamed. Falls back to splitting queryName on its first dot only.
     */
    private getFilterTarget(source: powerbi.DataViewMetadataColumn): FilterTarget {
        const expr: any = (source as any).expr;
        if (expr?.source?.entity && expr?.ref) {
            return { table: expr.source.entity, column: expr.ref };
        }
        const q = source.queryName ?? "";
        const i = q.indexOf(".");
        return { table: q.substring(0, i), column: q.substring(i + 1) };
    }

    /** Shows exactly one of the group / validation message / landing page, hiding the other two. */
    private showSection(section: "group" | "message" | "landing"): void {
        this.frameEl.style.display = section === "group" ? "flex" : "none";
        this.messageEl.style.display = section === "message" ? "flex" : "none";
        this.landingPageEl.style.display = section === "landing" ? "flex" : "none";
    }

    /** "A field is bound but its values aren't a valid On/Off pair" - distinct from the landing page. */
    private showMessage(body: string): void {
        this.showSection("message");
        this.messageEl.textContent = body;
    }

    /** "No field bound yet" - an icon/heading plus a skeleton preview of a toggle group. */
    private showLandingPage(): void {
        this.showSection("landing");
        this.landingHeadingEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_Heading");
        this.landingHintEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_Hint");
    }

    private showTooltip(event: PointerEvent, index: number): void {
        const item = this.items[index];
        if (!this.tooltipService.enabled() || !item) {
            return;
        }

        const card = this.formattingSettings.toggleSettingsCard;
        const currentLabel = item.isMixed
            ? this.localizationManager.getDisplayName("Visual_State_Mixed")
            : item.isOn ? card.onLabel.value : card.offLabel.value;
        const identity = this.identityFor(item);

        this.tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: event.pointerType === "touch",
            dataItems: [{
                displayName: item.name,
                value: currentLabel
            }],
            identities: identity ? [identity] : []
        });
    }

    private moveTooltip(event: PointerEvent): void {
        if (!this.tooltipService.enabled()) {
            return;
        }

        this.tooltipService.move({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: event.pointerType === "touch",
            identities: []
        });
    }

    private hideTooltip(event: PointerEvent): void {
        this.tooltipService.hide({ isTouchEvent: event.pointerType === "touch", immediately: true });
    }
}
