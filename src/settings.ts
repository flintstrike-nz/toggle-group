/*
 *  Power BI Visualizations
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
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
import ValidatorType = powerbi.visuals.ValidatorType;

/**
 * Toggle Settings Card - mirrors the "toggleSettings" object in capabilities.json.
 * Keeps colours and labels editable from the Format pane instead of hardcoded in visual.ts.
 */
class ToggleSettingsCardSettings extends FormattingSettingsCard {
    // Graphical skin only - every other toggleSettings property (colours, border, depth effect,
    // labels) keeps meaning the same thing regardless of which shape is drawn, so this doesn't gate
    // anything else's visibility the way showBorder/showBackground do below.
    controlStyle = new formattingSettings.ItemDropdown({
        name: "controlStyle",
        displayNameKey: "Visual_ControlStyle_DisplayName",
        descriptionKey: "Visual_ControlStyle_Description",
        items: [
            { value: "toggle", displayName: "Toggle" },
            { value: "checkbox", displayName: "Checkbox" }
            // TODO: Add { value: "radio", displayName: "Radio" }
        ],
        value: { value: "toggle", displayName: "Toggle" }
    });

    // This static value is only the fallback used before a report author has ever touched the
    // swatch - applyColors() in visual.ts substitutes the report theme's first data colour instead
    // whenever dataView.metadata.objects.toggleSettings.onColor is absent, so the switch matches
    // the theme until someone picks their own colour.
    onColor = new formattingSettings.ColorPicker({
        name: "onColor",
        displayNameKey: "Visual_OnColor_DisplayName",
        descriptionKey: "Visual_OnColor_Description",
        value: { value: "#2ECC71" }
    });

    offColor = new formattingSettings.ColorPicker({
        name: "offColor",
        displayNameKey: "Visual_OffColor_DisplayName",
        descriptionKey: "Visual_OffColor_Description",
        value: { value: "#B0B3B8" }
    });

    // The onLabel/offLabel *values* (and placeholders) are intentionally plain English defaults,
    // not localization keys - they're user-configurable per-report text, already customizable per
    // locale from the Format pane. Only the property names/descriptions shown in that pane are
    // localized here. See CLAUDE.md's Localization scope note.
    onLabel = new formattingSettings.TextInput({
        name: "onLabel",
        displayNameKey: "Visual_OnLabel_DisplayName",
        descriptionKey: "Visual_OnLabel_Description",
        placeholder: "On",
        value: "On"
    });

    offLabel = new formattingSettings.TextInput({
        name: "offLabel",
        displayNameKey: "Visual_OffLabel_DisplayName",
        descriptionKey: "Visual_OffLabel_Description",
        placeholder: "Off",
        value: "Off"
    });

    showLabels = new formattingSettings.ToggleSwitch({
        name: "showLabels",
        displayNameKey: "Visual_ShowLabels_DisplayName",
        descriptionKey: "Visual_ShowLabels_Description",
        value: false
    });

    // "Inline left"/"Inline right" both show only the label matching the current On/Off state (the
    // same single-label behaviour "Above" already used, just horizontal instead of vertical) - the
    // value only decides which side of the switch it sits on. This replaces the old two-item
    // "inline"/"above" list's "inline" meaning (both On/Off labels always flanking the switch) - the
    // former above-left/above-right idea is superseded by the separate alignment control below,
    // which covers left/right/justify positioning without needing dedicated dropdown items for it.
    labelPosition = new formattingSettings.ItemDropdown({
        name: "labelPosition",
        displayNameKey: "Visual_LabelPosition_DisplayName",
        descriptionKey: "Visual_LabelPosition_Description",
        items: [
            { value: "inline-left", displayName: "Label left" },
            { value: "inline-right", displayName: "Label right" },
            { value: "above", displayName: "Above" }
        ],
        value: { value: "inline-left", displayName: "Label left" }
    });

    // Independent of labelPosition - controls how the switch+label row itself sits within the tile
    // (or, when titleSettings.alignment also stretches the shared row to fill the tile, within the
    // remaining space next to the title). "Justify" spaces the row's own children (the switch and
    // whichever label is visible) to opposite ends of that row rather than leaving them shrink-wrapped
    // together, giving a "label at one edge, switch at the other" layout.
    alignment = new formattingSettings.ItemDropdown({
        name: "alignment",
        displayNameKey: "Visual_ToggleAlignment_DisplayName",
        descriptionKey: "Visual_ToggleAlignment_Description",
        items: [
            { value: "left", displayName: "Left" },
            { value: "right", displayName: "Right" },
            { value: "justify", displayName: "Justify" }
        ],
        value: { value: "left", displayName: "Left" }
    });

    labelSpacing = new formattingSettings.NumUpDown({
        name: "labelSpacing",
        displayNameKey: "Visual_LabelSpacing_DisplayName",
        descriptionKey: "Visual_LabelSpacing_Description",
        value: 8,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 64 }
        }
    });

    showBackground = new formattingSettings.ToggleSwitch({
        name: "showBackground",
        displayNameKey: "Visual_ShowBackground_DisplayName",
        descriptionKey: "Visual_ShowBackground_Description",
        value: false
    });

    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayNameKey: "Visual_BackgroundColor_DisplayName",
        descriptionKey: "Visual_BackgroundColor_Description",
        value: { value: "#FFFFFF" }
    });

    showBorder = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayNameKey: "Visual_ShowBorder_DisplayName",
        descriptionKey: "Visual_ShowBorder_Description",
        value: false
    });

    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayNameKey: "Visual_BorderColor_DisplayName",
        descriptionKey: "Visual_BorderColor_Description",
        value: { value: "#605E5C" }
    });

    // Default 2px reproduces the track's original fixed border exactly (see the knob-centring note
    // in visual.less) - the knob's size is derived from this via CSS calc() so it stays centred
    // whatever width a report author picks.
    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayNameKey: "Visual_BorderWidth_DisplayName",
        descriptionKey: "Visual_BorderWidth_Description",
        value: 2,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 6 }
        }
    });

    depthEffect = new formattingSettings.ToggleSwitch({
        name: "depthEffect",
        displayNameKey: "Visual_DepthEffect_DisplayName",
        descriptionKey: "Visual_DepthEffect_Description",
        value: false
    });

    // Defaults match this visual's own base font stack (see .toggle-slicer-visual in visual.less)
    // and the 12px/#605E5C the labels have always rendered at - there's no live API for reading the
    // report theme's actual typography (unlike colour's host.colorPalette.getColor()), so this is a
    // static approximation, not a dynamic theme readout. bold/italic/underline are plain false/off
    // to match the labels' existing normal weight/style.
    labelFont = new formattingSettings.FontControl({
        name: "labelFont",
        displayNameKey: "Visual_LabelFont_DisplayName",
        fontFamily: new formattingSettings.FontPicker({
            name: "labelFontFamily",
            value: "Arial"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "labelFontSize",
            value: 12,
            options: {
                unitSymbol: "px",
                minValue: { type: ValidatorType.Min, value: 6 },
                maxValue: { type: ValidatorType.Max, value: 60 }
            }
        }),
        bold: new formattingSettings.ToggleSwitch({ name: "labelFontBold", value: true }),
        italic: new formattingSettings.ToggleSwitch({ name: "labelFontItalic", value: false }),
        underline: new formattingSettings.ToggleSwitch({ name: "labelFontUnderline", value: false })
    });

    labelFontColor = new formattingSettings.ColorPicker({
        name: "labelFontColor",
        displayNameKey: "Visual_LabelFontColor_DisplayName",
        descriptionKey: "Visual_LabelFontColor_Description",
        value: { value: "#15284C" }
    });

    name: string = "toggleSettings";
    displayNameKey: string = "Visual_ToggleSettingsCard_DisplayName";
    slices: Array<FormattingSettingsSlice> = [
        this.controlStyle,
        this.onColor, this.offColor, this.onLabel, this.offLabel,
        this.showLabels, this.labelPosition, this.alignment, this.labelSpacing, this.labelFont, this.labelFontColor,
        this.showBackground, this.backgroundColor,
        this.showBorder, this.borderColor, this.borderWidth, this.depthEffect
    ];

    // backgroundColor/borderColor/borderWidth only make sense once their own toggle is on - hiding
    // them otherwise instead of leaving a swatch or number field that silently does nothing.
    //
    // alignment's Left/Right only have a visible effect when labelPosition is "above" - outside that,
    // this row shares titleWrapEl's own row with the title (labelPosition inline-left/inline-right),
    // where an auto margin on it would consume free space *before* titleSettings.alignment: justify's
    // own space-between gets a chance to use it (see visual.less's is-align-left/right comment), so
    // Left/Right are scoped out there entirely rather than left in as a control that visibly does
    // nothing. Hiding the whole property (not just those two choices) when it wouldn't do anything is
    // simpler than a dropdown that silently drops an item depending on another property's value, and
    // Justify alone isn't worth keeping visible on its own.
    onPreProcess(): void {
        this.backgroundColor.visible = this.showBackground.value;
        this.borderColor.visible = this.showBorder.value;
        this.borderWidth.visible = this.showBorder.value;
        this.alignment.visible = this.labelPosition.value.value === "above";
    }
}

/**
 * Title Settings Card - a static heading this visual renders itself, positioned the same way as
 * the on/off labels (Inline/Above). Distinct from Power BI's own native visual title (Format ->
 * General -> Title), which is host-rendered chrome this visual has no control over and can't
 * vertically centre or place beside the switch - report authors who want that should turn the
 * native title off and use this one instead.
 */
class TitleSettingsCardSettings extends FormattingSettingsCard {
    // Left blank here rather than a static "Toggle label" default - unlike onLabel/offLabel's
    // placeholders (plain English by established convention, since a report author is expected to
    // retype them immediately), a title many report authors may never touch would otherwise show
    // fixed, unlocalized English text in production reports. render() instead resolves the *shown*
    // default through Visual_TitleText_Default (a real localization key) whenever the raw dataView
    // object has no persisted value yet - see hasCustomTitleText in visual.ts - so this stays "" and
    // the placeholder documents the same text for the Format pane's own (English-only, like
    // onLabel/offLabel's) input hint.
    text = new formattingSettings.TextInput({
        name: "text",
        displayNameKey: "Visual_TitleText_DisplayName",
        descriptionKey: "Visual_TitleText_Description",
        placeholder: "Toggle label",
        value: ""
    });

    // "Inline left" (default) keeps the title before the switch, as "Inline" always has; "Inline
    // right" places it after instead. Unlike toggleSettings.labelPosition, there's no "show only one
    // of two things" question here - the title's text never depends on the switch's state - so this
    // is a straightforward left/right swap of render()'s DOM order via CSS order, not a behaviour
    // change to what's shown.
    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayNameKey: "Visual_TitlePosition_DisplayName",
        descriptionKey: "Visual_TitlePosition_Description",
        items: [
            { value: "inline-left", displayName: "Inline left" },
            { value: "inline-right", displayName: "Inline right" },
            { value: "above", displayName: "Above" }
        ],
        value: { value: "inline-left", displayName: "Inline left" }
    });

    // Governs where the whole title+switch assembly (titleWrapEl) sits within the visual's tile,
    // replacing the previous always-centred layout. "Justify" stretches titleWrapEl to fill the tile
    // and spaces its own two children (the title, and the switch+label group) to opposite ends along
    // whichever axis position currently uses - horizontally when Inline, vertically when Above -
    // rather than leaving them shrink-wrapped together in the middle.
    alignment = new formattingSettings.ItemDropdown({
        name: "alignment",
        displayNameKey: "Visual_TitleAlignment_DisplayName",
        descriptionKey: "Visual_TitleAlignment_Description",
        items: [
            { value: "left", displayName: "Left" },
            { value: "right", displayName: "Right" },
            { value: "justify", displayName: "Justify" }
        ],
        value: { value: "left", displayName: "Left" }
    });

    spacing = new formattingSettings.NumUpDown({
        name: "spacing",
        displayNameKey: "Visual_TitleSpacing_DisplayName",
        descriptionKey: "Visual_TitleSpacing_Description",
        value: 8,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 64 }
        }
    });

    // Same "no live theme API" caveat as labelFont above - fontSize defaults a touch larger (14 vs
    // the labels' 12) and bold defaults on, since this is meant to read as a heading rather than a
    // small state label, matching its previous hardcoded font-weight: 600.
    font = new formattingSettings.FontControl({
        name: "titleFont",
        displayNameKey: "Visual_TitleFont_DisplayName",
        fontFamily: new formattingSettings.FontPicker({
            name: "titleFontFamily",
            value: "Segoe UI"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "titleFontSize",
            value: 14,
            options: {
                unitSymbol: "px",
                minValue: { type: ValidatorType.Min, value: 6 },
                maxValue: { type: ValidatorType.Max, value: 60 }
            }
        }),
        bold: new formattingSettings.ToggleSwitch({ name: "titleFontBold", value: true }),
        italic: new formattingSettings.ToggleSwitch({ name: "titleFontItalic", value: false }),
        underline: new formattingSettings.ToggleSwitch({ name: "titleFontUnderline", value: false })
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayNameKey: "Visual_TitleFontColor_DisplayName",
        descriptionKey: "Visual_TitleFontColor_Description",
        value: { value: "#605E5C" }
    });

    name: string = "titleSettings";
    displayNameKey: string = "Visual_TitleSettingsCard_DisplayName";
    slices: Array<FormattingSettingsSlice> = [this.text, this.position, this.alignment, this.spacing, this.font, this.fontColor];
}

/**
 * Size Settings Card - the switch's height (width follows at a fixed 2:1 ratio, so only one
 * dimension needs a control). "Responsive" fluidly scales the switch with the visual's own height
 * between minHeight/maxHeight (CSS clamp() + container query units in visual.less); "Fixed" locks
 * it to a single explicit height regardless of the tile's size.
 */
class SizeSettingsCardSettings extends FormattingSettingsCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayNameKey: "Visual_SizeMode_DisplayName",
        descriptionKey: "Visual_SizeMode_Description",
        items: [
            { value: "responsive", displayName: "Responsive" },
            { value: "fixed", displayName: "Fixed" }
        ],
        value: { value: "responsive", displayName: "Responsive" }
    });

    // Defaults (16/22) reproduce the two discrete sizes this visual used to hard-switch between at
    // a single container-height breakpoint, now as the floor/ceiling of a fluid scale instead.
    minHeight = new formattingSettings.NumUpDown({
        name: "minHeight",
        displayNameKey: "Visual_MinHeight_DisplayName",
        descriptionKey: "Visual_MinHeight_Description",
        value: 16,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 8 },
            maxValue: { type: ValidatorType.Max, value: 200 }
        }
    });

    maxHeight = new formattingSettings.NumUpDown({
        name: "maxHeight",
        displayNameKey: "Visual_MaxHeight_DisplayName",
        descriptionKey: "Visual_MaxHeight_Description",
        value: 22,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 8 },
            maxValue: { type: ValidatorType.Max, value: 200 }
        }
    });

    fixedHeight = new formattingSettings.NumUpDown({
        name: "fixedHeight",
        displayNameKey: "Visual_FixedHeight_DisplayName",
        descriptionKey: "Visual_FixedHeight_Description",
        value: 22,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 8 },
            maxValue: { type: ValidatorType.Max, value: 200 }
        }
    });

    name: string = "sizeSettings";
    displayNameKey: string = "Visual_SizeSettingsCard_DisplayName";
    slices: Array<FormattingSettingsSlice> = [this.mode, this.minHeight, this.maxHeight, this.fixedHeight];

    // minHeight/maxHeight only apply in Responsive mode, fixedHeight only in Fixed mode - hide
    // whichever pair doesn't apply instead of leaving number fields that silently do nothing.
    onPreProcess(): void {
        const isFixed = this.mode.value.value === "fixed";
        this.minHeight.visible = !isFixed;
        this.maxHeight.visible = !isFixed;
        this.fixedHeight.visible = isFixed;
    }
}

/**
* Visual settings model class
*
*/
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    // Create formatting settings model formatting cards
    toggleSettingsCard = new ToggleSettingsCardSettings();
    titleSettingsCard = new TitleSettingsCardSettings();
    sizeSettingsCard = new SizeSettingsCardSettings();

    cards = [this.toggleSettingsCard, this.titleSettingsCard, this.sizeSettingsCard];
}
