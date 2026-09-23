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
 * Matches the disconnected ToggleTable[Toggle] category values this visual expects. Accepts a few
 * common conventions for the same two states, not just the "On"/"Off" text used in CLAUDE.md's
 * documented DATATABLE example, so a report author's own table doesn't have to match it exactly.
 */
const ON_VALUES = new Set(["on", "true", "1"]);
const OFF_VALUES = new Set(["off", "false", "0"]);

/**
 * Starter DAX shown (with a Copy button) on the landing page, matching CLAUDE.md/README's own
 * documented example exactly. DAX identifiers aren't localized - like the on/off label values
 * themselves, they're literal code to paste verbatim, not natural-language UI text.
 */
const TOGGLE_TABLE_DAX = `ToggleTable = DATATABLE(
    "Toggle", STRING,
    "Value", INTEGER,
    {
        {"On", 1},
        {"Off", 0}
    }
)`;
const TOGGLE_MEASURE_DAX = `ToggleState = SELECTEDVALUE(ToggleTable[Value], 0)`;

// Gives each Visual instance's title element a unique id (a report page can have more than one of
// these visuals), for the switch's aria-describedby - see render()'s title handling.
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
    private titleWrapEl: HTMLElement;
    private titleEl: HTMLElement;
    private container: HTMLElement;
    private offLabelEl: HTMLElement;
    private onLabelEl: HTMLElement;
    private switchEl: HTMLElement;
    private knobEl: HTMLElement;
    private checkmarkEl: SVGElement;
    private messageEl: HTMLElement;
    private landingPageEl: HTMLElement;
    private landingHeadingEl: HTMLElement;
    private landingHintEl: HTMLElement;
    private landingCopyStatusEl: HTMLElement;

    private categoryIdentities: ISelectionId[] = [];
    private filterTarget: { table: string; column: string } | null = null;
    private categoryValues: powerbi.PrimitiveValue[] = [];
    private onIndex: number = -1;
    private offIndex: number = -1;
    private isOn: boolean = false;
    // Whether titleSettings.text has ever been explicitly set by a report author (checked against
    // the raw dataView object, not the populated settings model, which can't tell "never touched"
    // apart from "explicitly cleared to blank") - computed once per update() since render() (called
    // from places with no dataView of their own, like the bookmark-sync callback) needs it too.
    private hasCustomTitleText: boolean = false;
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

        // A static heading this visual draws itself (separate from Power BI's own native visual
        // title, which this code has no control over) - wraps the switch/label container so it can
        // sit beside it (Inline) or above it (Above) via the same layout scheme as the on/off labels.
        this.titleWrapEl = document.createElement("div");
        this.titleWrapEl.className = "toggle-slicer-wrap";

        this.titleEl = document.createElement("span");
        this.titleEl.className = "toggle-slicer__title";
        this.titleEl.id = `toggle-slicer-title-${++nextInstanceId}`;

        this.container = document.createElement("div");
        this.container.className = "toggle-slicer";

        this.offLabelEl = document.createElement("span");
        this.offLabelEl.className = "toggle-slicer__label toggle-slicer__label--off";

        this.switchEl = document.createElement("div");
        this.switchEl.className = "toggle-slicer__switch";
        this.switchEl.setAttribute("role", "switch");
        this.switchEl.setAttribute("tabindex", "0");
        this.switchEl.setAttribute("aria-checked", "false");

        const trackEl = document.createElement("div");
        trackEl.className = "toggle-slicer__track";

        this.knobEl = document.createElement("div");
        this.knobEl.className = "toggle-slicer__knob";
        trackEl.appendChild(this.knobEl);

        // Checkbox skin's "on" mark - lives alongside the toggle skin's knob in the same track
        // rather than a separate DOM subtree, so both skins pick up the track's own colour/border/
        // depth-effect styling (applyColors()/is-depth) for free; visual.less shows only the one
        // that matches toggleSettings.controlStyle (see render()'s is-checkbox class).
        this.checkmarkEl = this.buildCheckmarkIcon();
        trackEl.appendChild(this.checkmarkEl);

        this.switchEl.appendChild(trackEl);

        this.onLabelEl = document.createElement("span");
        this.onLabelEl.className = "toggle-slicer__label toggle-slicer__label--on";

        this.container.appendChild(this.offLabelEl);
        this.container.appendChild(this.switchEl);
        this.container.appendChild(this.onLabelEl);

        this.messageEl = document.createElement("div");
        this.messageEl.className = "toggle-slicer__message";

        this.landingPageEl = this.buildLandingPage();

        this.titleWrapEl.appendChild(this.titleEl);
        this.titleWrapEl.appendChild(this.container);

        this.target.appendChild(this.titleWrapEl);
        this.target.appendChild(this.messageEl);
        this.target.appendChild(this.landingPageEl);

        this.switchEl.addEventListener("click", () => this.handleToggleClick());
        this.switchEl.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                this.handleToggleClick();
            }
        });
        this.switchEl.addEventListener("contextmenu", (event: MouseEvent) => this.handleContextMenu(event));

        this.switchEl.addEventListener("pointerenter", (event: PointerEvent) => this.showTooltip(event));
        this.switchEl.addEventListener("pointermove", (event: PointerEvent) => this.moveTooltip(event));
        this.switchEl.addEventListener("pointerleave", (event: PointerEvent) => this.hideTooltip(event));
    }

    /**
     * Builds the "no field bound yet" landing page: an info icon + instructional heading (matching
     * the host's own generic "Select or drag fields..." placeholder), a divider, a greyed-out
     * skeleton of the switch so the placeholder previews what will render, a compact hint about the
     * accepted On/Off value formats, and (once the tile is big enough - see the min-width/min-height
     * container query in visual.less) a copyable starter DAX guide so a report author can build the
     * disconnected ToggleTable pattern without leaving Power BI Desktop.
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

        const skeletonTrackEl = document.createElement("div");
        skeletonTrackEl.className = "toggle-slicer__landing-skeleton-track";
        const skeletonKnobEl = document.createElement("div");
        skeletonKnobEl.className = "toggle-slicer__landing-skeleton-knob";
        skeletonTrackEl.appendChild(skeletonKnobEl);

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
        landingPageEl.appendChild(skeletonTrackEl);
        landingPageEl.appendChild(this.landingHintEl);
        landingPageEl.appendChild(this.buildLandingGuide());
        landingPageEl.appendChild(this.landingCopyStatusEl);

        return landingPageEl;
    }

    /** The copyable "create the table, then the measure" starter DAX guide - see buildLandingPage(). */
    private buildLandingGuide(): HTMLElement {
        const guideEl = document.createElement("div");
        guideEl.className = "toggle-slicer__landing-guide";

        const tableStepEl = document.createElement("div");
        tableStepEl.className = "toggle-slicer__landing-guide-step";
        tableStepEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_GuideTableIntro");

        const measureStepEl = document.createElement("div");
        measureStepEl.className = "toggle-slicer__landing-guide-step";
        measureStepEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_GuideMeasureIntro");

        const outroEl = document.createElement("div");
        outroEl.className = "toggle-slicer__landing-guide-step";
        outroEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_GuideOutro");

        guideEl.appendChild(tableStepEl);
        guideEl.appendChild(this.buildCodeBlock(TOGGLE_TABLE_DAX, "Visual_LandingPage_CopyTable_AriaLabel"));
        guideEl.appendChild(measureStepEl);
        guideEl.appendChild(this.buildCodeBlock(TOGGLE_MEASURE_DAX, "Visual_LandingPage_CopyMeasure_AriaLabel"));
        guideEl.appendChild(outroEl);

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
     * The checkbox skin's checkmark - hand-built like buildInfoIcon() rather than an image asset.
     * Its colour comes from --toggle-knob-color-on (visual.less), the same variable the toggle
     * skin's knob uses once "on", since the checkmark is only ever shown in the "on" state.
     */
    private buildCheckmarkIcon(): SVGElement {
        const svgNS = "http://www.w3.org/2000/svg";
        const icon = document.createElementNS(svgNS, "svg");
        icon.setAttribute("class", "toggle-slicer__checkmark");
        icon.setAttribute("viewBox", "0 0 16 16");
        icon.setAttribute("aria-hidden", "true");

        const check = document.createElementNS(svgNS, "path");
        check.setAttribute("d", "M3.5 8.5L6.5 11.5L12.5 4.5");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");

        icon.appendChild(check);
        return icon;
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);

        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const titleSettingsObjects = dataView && dataView.metadata && dataView.metadata.objects && dataView.metadata.objects["titleSettings"];
            this.hasCustomTitleText = !!titleSettingsObjects && titleSettingsObjects["text"] !== undefined;

            this.applyColors(dataView);
            this.applySize();
            this.applyFonts();

            const category = this.getToggleCategory(dataView);

            if (!category) {
                this.categoryIdentities = [];
                this.onIndex = -1;
                this.offIndex = -1;
                this.showLandingPage();
                this.events.renderingFinished(options);
                return;
            }

            const normalizedValues = category.values.map((value) => this.normalize(value));
            const onCount = normalizedValues.filter((value) => ON_VALUES.has(value)).length;
            const offCount = normalizedValues.filter((value) => OFF_VALUES.has(value)).length;

            if (category.values.length !== 2 || onCount !== 1 || offCount !== 1) {
                this.categoryIdentities = [];
                this.onIndex = -1;
                this.offIndex = -1;
                this.showMessage(this.localizationManager.getDisplayName("Visual_Validation_OnOffRequired"));
                this.events.renderingFinished(options);
                return;
            }

            this.categoryIdentities = category.values.map((_value, index) =>
                this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId()
            );
            this.onIndex = normalizedValues.findIndex((value) => ON_VALUES.has(value));
            this.offIndex = normalizedValues.findIndex((value) => OFF_VALUES.has(value));

            this.showToggle();

            this.filterTarget = this.getFilterTarget(category.source);
            this.categoryValues = category.values;
            // State comes from the persisted filter, so bookmarks and reopening the report restore it.
            this.isOn = this.isOnFromFilters(options.jsonFilters);
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

    private getToggleCategory(dataView: powerbi.DataView | undefined): DataViewCategoryColumn | undefined {
        const categories = dataView && dataView.categorical && dataView.categorical.categories;
        return categories && categories.length > 0 ? categories[0] : undefined;
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

    private handleToggleClick(): void {
        if (this.onIndex === -1 || this.offIndex === -1 || !this.filterTarget || !this.interactionsAllowed()) {
            return;
        }

        const nextOn = !this.isOn;
        const value = this.categoryValues[nextOn ? this.onIndex : this.offIndex];

        // A real slicer-style filter (persisted in general.filter), not a selection - so it
        // survives save/reopen, works with bookmarks and sync slicers, and propagates through
        // model relationships. Off applies 'Off' rather than clearing, since the bridge pattern
        // maps the Off row to every group.
        const filter = {
            $schema: "https://powerbi.com/product/schema#basic",
            target: this.filterTarget,
            operator: "In",
            values: [value],
            filterType: 1 // Basic
        };

        this.host.applyJsonFilter(filter as any, "general", "filter", powerbi.FilterAction.merge);
        this.isOn = nextOn;
        this.render();
    }

    private handleContextMenu(event: MouseEvent): void {
        event.preventDefault();

        if (this.onIndex === -1 || this.offIndex === -1 || !this.interactionsAllowed()) {
            return;
        }

        const identity = this.categoryIdentities[this.isOn ? this.onIndex : this.offIndex];
        this.selectionManager.showContextMenu(identity, { x: event.clientX, y: event.clientY });
    }

    /**
     * Applies track/knob/label/background colours, substituting the theme's high-contrast palette
     * when active. Outside high contrast, the On colour itself follows the report theme's first
     * data colour until a report author picks their own - detected by checking the raw dataView
     * object rather than the populated settings model, since the latter always has *some* value
     * (the settings.ts default) and can't tell "never touched" apart from "explicitly set to the
     * same value as the default".
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
            this.target.style.backgroundColor = "";
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
            this.target.style.backgroundColor = card.showBackground.value ? card.backgroundColor.value.value : "";
        }
    }

    /**
     * Applies the switch's height (width always follows at a fixed 2:1 ratio - see the
     * --toggle-track-width calc() in visual.less) via CSS custom properties consumed by
     * .toggle-slicer__switch. "Fixed" mode is a class switch to a literal height; "Responsive"
     * mode's actual scaling (clamp() + cqh container query units) all lives in the stylesheet -
     * this only ever supplies the three bounds, never a computed size itself.
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

        this.switchEl.classList.toggle("is-size-fixed", card.mode.value.value === "fixed");
        this.target.style.setProperty("--toggle-min-height", `${minHeight}px`);
        this.target.style.setProperty("--toggle-max-height", `${maxHeight}px`);
        this.target.style.setProperty("--toggle-fixed-height", `${card.fixedHeight.value}px`);
    }

    /**
     * Applies the title's and on/off labels' font family/size/weight/style/decoration/colour as CSS
     * custom properties, each independently customizable from their own FontControl in the Format
     * pane. There's no host API for reading the report theme's actual typography (unlike colour's
     * host.colorPalette.getColor()), so these are static defaults approximating this visual's own
     * previous hardcoded look, not a live theme readout. Colour specifically is still forced to the
     * high-contrast palette's foreground when active, same as applyColors() already does for
     * --toggle-label-color - a custom Format-pane colour isn't guaranteed legible against a
     * high-contrast theme's background, regardless of which text it's painting.
     */
    private applyFonts(): void {
        const palette = this.host.colorPalette;
        const titleCard = this.formattingSettings.titleSettingsCard;
        const toggleCard = this.formattingSettings.toggleSettingsCard;

        this.target.style.setProperty("--toggle-title-font-family", titleCard.font.fontFamily.value);
        this.target.style.setProperty("--toggle-title-font-size", `${titleCard.font.fontSize.value}px`);
        this.target.style.setProperty("--toggle-title-font-weight", titleCard.font.bold.value ? "bold" : "normal");
        this.target.style.setProperty("--toggle-title-font-style", titleCard.font.italic.value ? "italic" : "normal");
        this.target.style.setProperty("--toggle-title-text-decoration", titleCard.font.underline.value ? "underline" : "none");

        this.target.style.setProperty("--toggle-label-font-family", toggleCard.labelFont.fontFamily.value);
        this.target.style.setProperty("--toggle-label-font-size", `${toggleCard.labelFont.fontSize.value}px`);
        this.target.style.setProperty("--toggle-label-font-weight", toggleCard.labelFont.bold.value ? "bold" : "normal");
        this.target.style.setProperty("--toggle-label-font-style", toggleCard.labelFont.italic.value ? "italic" : "normal");
        this.target.style.setProperty("--toggle-label-text-decoration", toggleCard.labelFont.underline.value ? "underline" : "none");

        if (palette.isHighContrast) {
            this.target.style.setProperty("--toggle-title-font-color", palette.foreground.value);
            this.target.style.setProperty("--toggle-label-font-color", palette.foreground.value);
        } else {
            this.target.style.setProperty("--toggle-title-font-color", titleCard.fontColor.value.value);
            this.target.style.setProperty("--toggle-label-font-color", toggleCard.labelFontColor.value.value);
        }
    }

    private render(): void {
        this.switchEl.classList.toggle("is-on", this.isOn);
        this.switchEl.classList.toggle("is-off", !this.isOn);
        this.switchEl.setAttribute("aria-checked", String(this.isOn));

        // Reflects hostCapabilities.allowInteractions (e.g. Focus mode thumbnails, some export/embed
        // contexts) visually and removes the switch from the tab order, matching handleToggleClick's
        // own guard rather than leaving a focusable control that silently does nothing when clicked.
        const interactionsAllowed = this.interactionsAllowed();
        this.switchEl.classList.toggle("is-readonly", !interactionsAllowed);
        this.switchEl.setAttribute("tabindex", interactionsAllowed ? "0" : "-1");

        const card = this.formattingSettings.toggleSettingsCard;
        this.switchEl.classList.toggle("is-depth", card.depthEffect.value);

        // Graphical skin only - selection/filter behaviour (handleToggleClick, isOnFromFilters,
        // etc.) doesn't change between shapes, so this only swaps the shown shape/role. role
        // follows the shape rather than staying "switch" for both, since a screen reader user
        // otherwise hears "switch" for a control drawn as a checkbox.
        const isCheckbox = card.controlStyle.value.value === "checkbox";
        this.switchEl.classList.toggle("is-checkbox", isCheckbox);
        this.switchEl.setAttribute("role", isCheckbox ? "checkbox" : "switch");

        const titleCard = this.formattingSettings.titleSettingsCard;
        // Shows a real, localized default ("Toggle label") until a report author sets their own
        // text - settings.ts's own static default is deliberately blank so this doesn't fall back to
        // fixed English UI copy outside ILocalizationManager. Once hasCustomTitleText is true (the
        // property has ANY persisted value, including a deliberately-cleared blank one), the
        // report-authored value always wins, so clearing the field still shows no title.
        const titleText = this.hasCustomTitleText
            ? titleCard.text.value
            : this.localizationManager.getDisplayName("Visual_TitleText_Default");
        this.titleEl.textContent = titleText;
        this.titleEl.style.display = titleText ? "" : "none";

        // "Inline left" (default) needs no order override - titleEl already comes before container
        // in DOM order. "Inline right" flips that via CSS order; "Above" stacks them in a column
        // (title always first/top, regardless of left/right - there's no horizontal axis to flip).
        // normalizeLegacyInlinePosition handles a report saved before "inline" was split into
        // "inline-left"/"inline-right" - see its own comment below.
        const titlePosition = this.normalizeLegacyInlinePosition(titleCard.position.value.value);
        this.titleWrapEl.classList.toggle("toggle-slicer-wrap--stacked", titlePosition === "above");
        this.titleWrapEl.classList.toggle("toggle-slicer-wrap--inline-right", titlePosition === "inline-right");
        this.titleWrapEl.style.setProperty("--toggle-title-gap", `${titleCard.spacing.value}px`);

        // Where the whole title+switch assembly sits in the tile - applied to titleWrapEl itself
        // (via CSS auto-margins, see visual.less), not to the shared "target" root, since target is
        // also the parent of the unrelated landing-page/validation-message sections and a class left
        // there from a previous render() would otherwise still be applied to whichever of those is
        // showing on a later update() that doesn't reach render() at all (unbound field, validation
        // failure) - see the CLAUDE.md note on titleSettings.alignment for the auto-margin mechanics.
        this.titleWrapEl.classList.remove("is-title-align-left", "is-title-align-right", "is-title-align-justify");
        this.titleWrapEl.classList.add(`is-title-align-${titleCard.alignment.value.value}`);

        // With multiple custom-titled toggles on a page, aria-label alone (which only ever names
        // the On/Off states) doesn't let keyboard/screen-reader users tell them apart - describedby
        // adds the title's own text to the switch's accessible description. Only when there's a
        // title to point to, since an id reference to a hidden/empty element is worse than none.
        if (titleText) {
            this.switchEl.setAttribute("aria-describedby", this.titleEl.id);
        } else {
            this.switchEl.removeAttribute("aria-describedby");
        }

        this.onLabelEl.textContent = card.onLabel.value;
        this.offLabelEl.textContent = card.offLabel.value;
        this.container.style.setProperty("--toggle-label-gap", `${card.labelSpacing.value}px`);

        const showLabels = card.showLabels.value;
        // All three positions ("above", "inline-left", "inline-right") now show only the label
        // matching the current state - "inline-left"/"inline-right" only differ in which side of the
        // switch that single label sits on, via CSS order (see visual.less), not in what's shown.
        const labelPosition = this.normalizeLegacyInlinePosition(card.labelPosition.value.value);
        this.container.classList.toggle("toggle-slicer--stacked", labelPosition === "above");
        this.container.classList.toggle("toggle-slicer--inline-left", labelPosition === "inline-left");
        this.container.classList.toggle("toggle-slicer--inline-right", labelPosition === "inline-right");

        // showLabels false always wins over the stylesheet's container-query auto-hide, regardless
        // of size. showLabels true still only shows whichever of on/off matches the current state.
        this.onLabelEl.style.display = showLabels && this.isOn ? "" : "none";
        this.offLabelEl.style.display = showLabels && !this.isOn ? "" : "none";

        // Where the switch+label row sits within its own box - see the CLAUDE.md note on
        // toggleSettings.alignment for when "justify" has a visible effect.
        this.container.classList.remove("is-align-left", "is-align-right", "is-align-justify");
        this.container.classList.add(`is-align-${card.alignment.value.value}`);

        // The aria-label always names both states regardless of showLabels, since a hidden label
        // makes the accessible name more important, not less. Label text is arbitrary user input
        // from the Format pane, so a function replacer is used instead of a replacement-string
        // literal - String.prototype.replace would otherwise interpret sequences like "$&" or "$1"
        // inside that text as special patterns rather than inserting it verbatim.
        const currentLabel = this.isOn ? card.onLabel.value : card.offLabel.value;
        // Matches the role set above - "... toggle, currently ..." would otherwise contradict
        // role="checkbox" for a screen reader user even though the switch/checkbox distinction is
        // purely graphical everywhere else.
        const ariaLabelKey = isCheckbox ? "Visual_Checkbox_AriaLabel" : "Visual_Switch_AriaLabel";
        const ariaLabel = this.localizationManager.getDisplayName(ariaLabelKey)
            .replace(/\{0\}/g, () => card.offLabel.value)
            .replace(/\{1\}/g, () => card.onLabel.value)
            .replace(/\{2\}/g, () => currentLabel);
        this.switchEl.setAttribute("aria-label", ariaLabel);
    }

    /**
     * Builds the filter target from the column's model expression (entity + column) rather than
     * queryName, which is only a display/query alias and goes stale when a table or column is
     * renamed. Falls back to splitting queryName on its first dot only.
     */
    private getFilterTarget(source: powerbi.DataViewMetadataColumn): { table: string; column: string } {
        const expr: any = (source as any).expr;
        if (expr?.source?.entity && expr?.ref) {
            return { table: expr.source.entity, column: expr.ref };
        }
        const q = source.queryName ?? "";
        const i = q.indexOf(".");
        return { table: q.substring(0, i), column: q.substring(i + 1) };
    }

    /** No persisted filter (first load) renders as Off, matching SELECTEDVALUE(ToggleTable[Value], 0)'s fallback. */
    private isOnFromFilters(filters: powerbi.IFilter[] | undefined): boolean {
        const f: any = filters && filters[0];
        const values: any[] = f && Array.isArray(f.values) ? f.values : [];
        return values.some((v) => ON_VALUES.has(this.normalize(v)));
    }

    /** Shows exactly one of the switch / validation message / landing page, hiding the other two. */
    private showSection(section: "toggle" | "message" | "landing"): void {
        this.titleWrapEl.style.display = section === "toggle" ? "flex" : "none";
        this.messageEl.style.display = section === "message" ? "flex" : "none";
        this.landingPageEl.style.display = section === "landing" ? "flex" : "none";
    }

    private showToggle(): void {
        this.showSection("toggle");
    }

    /** "A field is bound but its values aren't a valid On/Off pair" - distinct from the landing page. */
    private showMessage(body: string): void {
        this.showSection("message");
        this.messageEl.textContent = body;
    }

    /** "No field bound yet" - an icon/heading plus a skeleton preview of the switch. */
    private showLandingPage(): void {
        this.showSection("landing");
        this.landingHeadingEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_Heading");
        this.landingHintEl.textContent = this.localizationManager.getDisplayName("Visual_LandingPage_Hint");
    }

    private showTooltip(event: PointerEvent): void {
        if (!this.tooltipService.enabled() || this.onIndex === -1 || this.offIndex === -1) {
            return;
        }

        const card = this.formattingSettings.toggleSettingsCard;
        const currentLabel = this.isOn ? card.onLabel.value : card.offLabel.value;
        const identity = this.categoryIdentities[this.isOn ? this.onIndex : this.offIndex];

        this.tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: event.pointerType === "touch",
            dataItems: [{
                displayName: this.localizationManager.getDisplayName("Visual_Tooltip_Label"),
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