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
    // anything else's visibility the way showBorder does below. Radio pairs naturally with
    // groupSettings.onlyOneActive, but isn't tied to it - see render()'s role handling in visual.ts.
    controlStyle = new formattingSettings.ItemDropdown({
        name: "controlStyle",
        displayNameKey: "Visual_ControlStyle_DisplayName",
        descriptionKey: "Visual_ControlStyle_Description",
        items: [
            { value: "toggle", displayName: "Toggle" },
            { value: "checkbox", displayName: "Checkbox" },
            { value: "radio", displayName: "Radio" }
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
    // "inline"/"above" list's "inline" meaning (both On/Off labels always flanking the switch).
    // Where each whole row sits within the group is nameSettings.alignment's job, not this one's.
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
        this.showLabels, this.labelPosition, this.labelSpacing, this.labelFont, this.labelFontColor,
        this.showBorder, this.borderColor, this.borderWidth, this.depthEffect
    ];

    // borderColor/borderWidth only make sense once showBorder is on - hiding them otherwise
    // instead of leaving a swatch or number field that silently does nothing.
    onPreProcess(): void {
        this.borderColor.visible = this.showBorder.value;
        this.borderWidth.visible = this.showBorder.value;
    }
}

/**
 * Group Rules Card - how the toggles in the group behave together. None of these need their own
 * data field: they only decide which filters handleClick() in visual.ts writes for the bound
 * toggles. The one rule that *does* need a field - Group enable - comes from binding the separate
 * "Group enable" data role instead, so DAX can read it (see visual.ts's enableItem).
 */
class GroupSettingsCardSettings extends FormattingSettingsCard {
    onlyOneActive = new formattingSettings.ToggleSwitch({
        name: "onlyOneActive",
        displayNameKey: "Visual_OnlyOneActive_DisplayName",
        descriptionKey: "Visual_OnlyOneActive_Description",
        value: false
    });

    // A visual-only header row - it has no field or filter of its own, since its state is always
    // derivable from its children's (all On, all Off, or mixed).
    masterSwitch = new formattingSettings.ToggleSwitch({
        name: "masterSwitch",
        displayNameKey: "Visual_MasterSwitch_DisplayName",
        descriptionKey: "Visual_MasterSwitch_Description",
        value: false
    });

    // Blank for the same reason as titleSettings.text - render() shows the localized
    // Visual_MasterLabel_Default until the raw dataView object has a persisted value.
    masterLabel = new formattingSettings.TextInput({
        name: "masterLabel",
        displayNameKey: "Visual_MasterLabel_DisplayName",
        descriptionKey: "Visual_MasterLabel_Description",
        placeholder: "All",
        value: ""
    });

    indent = new formattingSettings.NumUpDown({
        name: "indent",
        displayNameKey: "Visual_Indent_DisplayName",
        descriptionKey: "Visual_Indent_Description",
        value: 16,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 64 }
        }
    });

    rowSpacing = new formattingSettings.NumUpDown({
        name: "rowSpacing",
        displayNameKey: "Visual_RowSpacing_DisplayName",
        descriptionKey: "Visual_RowSpacing_Description",
        value: 8,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 48 }
        }
    });

    name: string = "groupSettings";
    displayNameKey: string = "Visual_GroupSettingsCard_DisplayName";
    slices: Array<FormattingSettingsSlice> = [this.onlyOneActive, this.masterSwitch, this.masterLabel, this.indent, this.rowSpacing];

    // masterLabel only means anything while there's a master row to label. indent stays visible
    // regardless, since a bound Group enable field also indents the rows below it.
    onPreProcess(): void {
        this.masterLabel.visible = this.masterSwitch.value;
    }
}

/**
 * Toggle Names Card - each row's name, which is its bound field's display name (renamed per visual
 * from the field well, the same as any native visual's field labels). Separate from
 * toggleSettings' On/Off *state* labels, which describe a toggle's current value rather than
 * which toggle it is.
 */
class NameSettingsCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayNameKey: "Visual_ShowNames_DisplayName",
        descriptionKey: "Visual_ShowNames_Description",
        value: true
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayNameKey: "Visual_NamePosition_DisplayName",
        descriptionKey: "Visual_NamePosition_Description",
        items: [
            { value: "left", displayName: "Left" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "left", displayName: "Left" }
    });

    // Left/Right pack the name and toggle columns together against one edge; Justify spreads them
    // to opposite edges of the group (stretching the group to the container's full width to do it).
    alignment = new formattingSettings.ItemDropdown({
        name: "alignment",
        displayNameKey: "Visual_NameAlignment_DisplayName",
        descriptionKey: "Visual_NameAlignment_Description",
        items: [
            { value: "left", displayName: "Left" },
            { value: "right", displayName: "Right" },
            { value: "justify", displayName: "Justify" }
        ],
        value: { value: "left", displayName: "Left" }
    });

    spacing = new formattingSettings.NumUpDown({
        name: "spacing",
        displayNameKey: "Visual_NameSpacing_DisplayName",
        descriptionKey: "Visual_NameSpacing_Description",
        value: 8,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 64 }
        }
    });

    // Same "no live theme API" caveat as toggleSettings.labelFont.
    font = new formattingSettings.FontControl({
        name: "nameFont",
        displayNameKey: "Visual_NameFont_DisplayName",
        fontFamily: new formattingSettings.FontPicker({
            name: "nameFontFamily",
            value: "Segoe UI"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "nameFontSize",
            value: 12,
            options: {
                unitSymbol: "px",
                minValue: { type: ValidatorType.Min, value: 6 },
                maxValue: { type: ValidatorType.Max, value: 60 }
            }
        }),
        bold: new formattingSettings.ToggleSwitch({ name: "nameFontBold", value: false }),
        italic: new formattingSettings.ToggleSwitch({ name: "nameFontItalic", value: false }),
        underline: new formattingSettings.ToggleSwitch({ name: "nameFontUnderline", value: false })
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayNameKey: "Visual_NameFontColor_DisplayName",
        descriptionKey: "Visual_NameFontColor_Description",
        value: { value: "#252423" }
    });

    name: string = "nameSettings";
    displayNameKey: string = "Visual_NameSettingsCard_DisplayName";
    slices: Array<FormattingSettingsSlice> = [this.show, this.position, this.alignment, this.spacing, this.font, this.fontColor];

    onPreProcess(): void {
        this.position.visible = this.show.value;
        this.spacing.visible = this.show.value;
        this.font.visible = this.show.value;
        this.fontColor.visible = this.show.value;
    }
}

/**
 * Container Card - the box drawn around the whole group (title included). Border style is a fixed
 * set of treatments (see .toggle-group-frame in visual.less) layered over one user colour/width,
 * the same way toggleSettings.depthEffect layers rgba() shading over whatever solid colour a
 * toggle already has rather than needing to know its hue.
 */
class ContainerSettingsCardSettings extends FormattingSettingsCard {
    borderStyle = new formattingSettings.ItemDropdown({
        name: "borderStyle",
        displayNameKey: "Visual_ContainerBorderStyle_DisplayName",
        descriptionKey: "Visual_ContainerBorderStyle_Description",
        items: [
            { value: "none", displayName: "None" },
            { value: "flat", displayName: "Flat" },
            { value: "embossed", displayName: "Embossed" },
            { value: "gutter", displayName: "Gutter" }
        ],
        value: { value: "none", displayName: "None" }
    });

    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayNameKey: "Visual_ContainerBorderColor_DisplayName",
        descriptionKey: "Visual_ContainerBorderColor_Description",
        value: { value: "#C8C6C4" }
    });

    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayNameKey: "Visual_ContainerBorderWidth_DisplayName",
        descriptionKey: "Visual_ContainerBorderWidth_Description",
        value: 1,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 8 }
        }
    });

    cornerRadius = new formattingSettings.NumUpDown({
        name: "cornerRadius",
        displayNameKey: "Visual_ContainerCornerRadius_DisplayName",
        descriptionKey: "Visual_ContainerCornerRadius_Description",
        value: 4,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 32 }
        }
    });

    padding = new formattingSettings.NumUpDown({
        name: "padding",
        displayNameKey: "Visual_ContainerPadding_DisplayName",
        descriptionKey: "Visual_ContainerPadding_Description",
        value: 8,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: 0 },
            maxValue: { type: ValidatorType.Max, value: 48 }
        }
    });

    verticalAlignment = new formattingSettings.ItemDropdown({
        name: "verticalAlignment",
        displayNameKey: "Visual_ContainerVerticalAlignment_DisplayName",
        descriptionKey: "Visual_ContainerVerticalAlignment_Description",
        items: [
            { value: "top", displayName: "Top" },
            { value: "middle", displayName: "Middle" },
            { value: "bottom", displayName: "Bottom" }
        ],
        value: { value: "middle", displayName: "Middle" }
    });

    // Formerly toggleSettings.showBackground/backgroundColor ("Show switch background") - the fill
    // now belongs to the group's container rather than a single switch. The "group" qualifier in
    // their display names serves the same purpose "switch" used to: telling this apart from Power
    // BI's own native General -> Background, which every visual gets and this code can't touch.
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

    name: string = "containerSettings";
    displayNameKey: string = "Visual_ContainerSettingsCard_DisplayName";
    slices: Array<FormattingSettingsSlice> = [
        this.borderStyle, this.borderColor, this.borderWidth, this.cornerRadius,
        this.padding, this.verticalAlignment, this.showBackground, this.backgroundColor
    ];

    onPreProcess(): void {
        const hasBorder = this.borderStyle.value.value !== "none";
        this.borderColor.visible = hasBorder;
        this.borderWidth.visible = hasBorder;
        this.backgroundColor.visible = this.showBackground.value;
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
    // Left blank here rather than a static "Toggle group" default - unlike onLabel/offLabel's
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
        placeholder: "Toggle group",
        value: ""
    });

    // "Above" (default) heads the group like a fieldset legend - the natural layout for a list of
    // toggles. "Inline left"/"Inline right" place it before/after the group instead. Unlike
    // toggleSettings.labelPosition, there's no "show only one of two things" question here - the
    // title's text never depends on any toggle's state - so this is a straightforward swap of
    // render()'s DOM order via CSS order, not a behaviour change to what's shown.
    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayNameKey: "Visual_TitlePosition_DisplayName",
        descriptionKey: "Visual_TitlePosition_Description",
        items: [
            { value: "inline-left", displayName: "Inline left" },
            { value: "inline-right", displayName: "Inline right" },
            { value: "above", displayName: "Above" }
        ],
        value: { value: "above", displayName: "Above" }
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
 * Size Settings Card - every toggle's height (width follows at a fixed ratio - 2:1 for the toggle
 * skin, 1:1 for checkbox/radio - so only one dimension needs a control). "Responsive" fluidly
 * scales the toggles with the visual's own height *per row* between minHeight/maxHeight (CSS
 * clamp() + container query units in visual.less, divided by --toggle-row-count); "Fixed" locks
 * them to a single explicit height regardless of the tile's size.
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
    groupSettingsCard = new GroupSettingsCardSettings();
    toggleSettingsCard = new ToggleSettingsCardSettings();
    nameSettingsCard = new NameSettingsCardSettings();
    containerSettingsCard = new ContainerSettingsCardSettings();
    titleSettingsCard = new TitleSettingsCardSettings();
    sizeSettingsCard = new SizeSettingsCardSettings();

    cards = [
        this.groupSettingsCard, this.toggleSettingsCard, this.nameSettingsCard,
        this.containerSettingsCard, this.titleSettingsCard, this.sizeSettingsCard
    ];
}
