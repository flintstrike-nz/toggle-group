/*
 *  Copyright (c) 2026 Hayden Flintoft
 *  MIT License - see the LICENSE file in the repository root.
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
import ValidatorType = powerbi.visuals.ValidatorType;

/**
 * The Format pane, top to bottom: Controls (what each toggle looks like), State labels (On/Off
 * text), Toggle names (row names), Group behavior (the rules), Layout (where rows sit), Title and
 * Border & background (the box around everything). Each card is one capabilities.json object with
 * the same name, and every property name below is unique within its card.
 *
 * Numeric limits are written once here (not in capabilities.json), and every user-facing string
 * is a localization key - dropdown item captions are the one exception (see CLAUDE.md).
 */

function pixels(value: number, min: number, max: number, name: string, key: string): formattingSettings.NumUpDown {
    return new formattingSettings.NumUpDown({
        name,
        displayNameKey: `${key}_DisplayName`,
        descriptionKey: `${key}_Description`,
        value,
        options: {
            unitSymbol: "px",
            minValue: { type: ValidatorType.Min, value: min },
            maxValue: { type: ValidatorType.Max, value: max }
        }
    });
}

function toggleSwitch(name: string, key: string, value: boolean): formattingSettings.ToggleSwitch {
    return new formattingSettings.ToggleSwitch({
        name,
        displayNameKey: `${key}_DisplayName`,
        descriptionKey: `${key}_Description`,
        value
    });
}

function colorPicker(name: string, key: string, value: string): formattingSettings.ColorPicker {
    return new formattingSettings.ColorPicker({
        name,
        displayNameKey: `${key}_DisplayName`,
        descriptionKey: `${key}_Description`,
        value: { value }
    });
}

function dropdown(name: string, key: string, items: Array<{ value: string; displayName: string }>, selected: string): formattingSettings.ItemDropdown {
    return new formattingSettings.ItemDropdown({
        name,
        displayNameKey: `${key}_DisplayName`,
        descriptionKey: `${key}_Description`,
        items,
        value: items.find((item) => item.value === selected)
    });
}

// There is no host API for the report theme's typography (unlike colour's
// host.colorPalette.getColor()), so these defaults are a static approximation of the look the
// visual has always had, not a live theme readout.
function fontControl(key: string, family: string, size: number, bold: boolean): formattingSettings.FontControl {
    return new formattingSettings.FontControl({
        name: "font",
        displayNameKey: `${key}_DisplayName`,
        fontFamily: new formattingSettings.FontPicker({ name: "fontFamily", value: family }),
        fontSize: new formattingSettings.NumUpDown({
            name: "fontSize",
            value: size,
            options: {
                unitSymbol: "px",
                minValue: { type: ValidatorType.Min, value: 6 },
                maxValue: { type: ValidatorType.Max, value: 60 }
            }
        }),
        bold: new formattingSettings.ToggleSwitch({ name: "fontBold", value: bold }),
        italic: new formattingSettings.ToggleSwitch({ name: "fontItalic", value: false }),
        underline: new formattingSettings.ToggleSwitch({ name: "fontUnderline", value: false })
    });
}

const ALIGNMENT_ITEMS = [
    { value: "left", displayName: "Left" },
    { value: "center", displayName: "Center" },
    { value: "right", displayName: "Right" },
    { value: "justify", displayName: "Justify" }
];

/** Controls: the shape, colours, size and outline of every toggle. */
class ControlsCardSettings extends FormattingSettingsCompositeCard {
    // Graphical skin only: behaviour is identical for all three. Radio pairs naturally with
    // Group behavior -> Only one active, but isn't tied to it.
    controlStyle = dropdown("controlStyle", "Visual_Controls_Style", [
        { value: "toggle", displayName: "Toggle" },
        { value: "checkbox", displayName: "Checkbox" },
        { value: "radio", displayName: "Radio" }
    ], "toggle");
    depthEffect = toggleSwitch("depthEffect", "Visual_Controls_Depth", false);

    // The static value is only the fallback before a report author touches the swatch -
    // applyColors() in visual.ts uses the report theme's first data colour until then.
    onColor = colorPicker("onColor", "Visual_Controls_OnColor", "#2ECC71");
    offColor = colorPicker("offColor", "Visual_Controls_OffColor", "#B0B3B8");

    sizeMode = dropdown("sizeMode", "Visual_Controls_SizeMode", [
        { value: "responsive", displayName: "Responsive" },
        { value: "fixed", displayName: "Fixed" }
    ], "responsive");
    // 16/22 reproduce the two sizes the visual first shipped with, now the floor/ceiling of a fluid scale.
    minHeight = pixels(16, 8, 200, "minHeight", "Visual_Controls_MinHeight");
    maxHeight = pixels(22, 8, 200, "maxHeight", "Visual_Controls_MaxHeight");
    fixedHeight = pixels(22, 8, 200, "fixedHeight", "Visual_Controls_FixedHeight");

    // The width is load-bearing for knob centring even while the outline is off (it is applied to
    // a transparent border), so applyColors() always reads it.
    showOutline = toggleSwitch("showOutline", "Visual_Controls_Outline", false);
    outlineColor = colorPicker("outlineColor", "Visual_Controls_OutlineColor", "#605E5C");
    outlineWidth = pixels(2, 0, 6, "outlineWidth", "Visual_Controls_OutlineWidth");

    name: string = "controls";
    displayNameKey: string = "Visual_Card_Controls";

    styleGroup = new FormattingSettingsGroup({
        name: "controlsStyle",
        displayNameKey: "Visual_Group_Style",
        slices: [this.controlStyle, this.depthEffect]
    });
    colorsGroup = new FormattingSettingsGroup({
        name: "controlsColors",
        displayNameKey: "Visual_Group_Colors",
        slices: [this.onColor, this.offColor]
    });
    sizeGroup = new FormattingSettingsGroup({
        name: "controlsSize",
        displayNameKey: "Visual_Group_Size",
        slices: [this.sizeMode, this.minHeight, this.maxHeight, this.fixedHeight]
    });
    outlineGroup = new FormattingSettingsGroup({
        name: "controlsOutline",
        displayNameKey: "Visual_Group_Outline",
        topLevelSlice: this.showOutline,
        slices: [this.outlineColor, this.outlineWidth]
    });
    groups: Array<FormattingSettingsGroup> = [this.styleGroup, this.colorsGroup, this.sizeGroup, this.outlineGroup];

    // Min/Max only apply in Responsive mode, Fixed height only in Fixed mode.
    onPreProcess(): void {
        const isFixed = this.sizeMode.value.value === "fixed";
        this.minHeight.visible = !isFixed;
        this.maxHeight.visible = !isFixed;
        this.fixedHeight.visible = isFixed;
    }
}

/** State labels: the On/Off text drawn beside (or inside) each toggle. */
class StateLabelsCardSettings extends FormattingSettingsCard {
    show = toggleSwitch("show", "Visual_StateLabels_Show", false);
    onText = new formattingSettings.TextInput({
        name: "onText",
        displayNameKey: "Visual_StateLabels_OnText_DisplayName",
        descriptionKey: "Visual_StateLabels_OnText_Description",
        placeholder: "On",
        value: "On"
    });
    offText = new formattingSettings.TextInput({
        name: "offText",
        displayNameKey: "Visual_StateLabels_OffText_DisplayName",
        descriptionKey: "Visual_StateLabels_OffText_Description",
        placeholder: "Off",
        value: "Off"
    });
    // Every position shows only the label for the current state; the value just decides where.
    // "Inside switch" needs the toggle style - checkbox and radio fall back to Right.
    position = dropdown("position", "Visual_StateLabels_Position", [
        { value: "inline-left", displayName: "Left" },
        { value: "inline-right", displayName: "Right" },
        { value: "above", displayName: "Above" },
        { value: "inside", displayName: "Inside switch" }
    ], "inline-left");
    spacing = pixels(8, 0, 64, "spacing", "Visual_StateLabels_Spacing");
    font = fontControl("Visual_StateLabels_Font", "Arial", 12, true);
    fontColor = colorPicker("fontColor", "Visual_StateLabels_FontColor", "#15284C");

    name: string = "stateLabels";
    displayNameKey: string = "Visual_Card_StateLabels";
    topLevelSlice = this.show;
    slices: Array<FormattingSettingsSlice> = [this.onText, this.offText, this.position, this.spacing, this.font, this.fontColor];

    // Wired up by the model: the spacing is meaningless while text sits inside a toggle-style switch.
    isToggleStyle: () => boolean = () => true;

    onPreProcess(): void {
        this.spacing.visible = !(this.position.value.value === "inside" && this.isToggleStyle());
    }
}

/** Toggle names: each row's name, taken from its field's display name. */
class NamesCardSettings extends FormattingSettingsCard {
    show = toggleSwitch("show", "Visual_Names_Show", true);
    position = dropdown("position", "Visual_Names_Position", [
        { value: "left", displayName: "Left" },
        { value: "right", displayName: "Right" }
    ], "left");
    spacing = pixels(8, 0, 64, "spacing", "Visual_Names_Spacing");
    font = fontControl("Visual_Names_Font", "Segoe UI", 12, false);
    fontColor = colorPicker("fontColor", "Visual_Names_FontColor", "#252423");

    name: string = "names";
    displayNameKey: string = "Visual_Card_Names";
    topLevelSlice = this.show;
    slices: Array<FormattingSettingsSlice> = [this.position, this.spacing, this.font, this.fontColor];
}

/**
 * Group behavior: how the toggles act together. These only change which filters handleClick()
 * writes. The one rule that needs a field - Group enable - comes from the Group enable data role.
 */
class BehaviorCardSettings extends FormattingSettingsCard {
    onlyOneActive = toggleSwitch("onlyOneActive", "Visual_Behavior_OnlyOneActive", false);
    // A visual-only header row with no field or filter of its own.
    masterSwitch = toggleSwitch("masterSwitch", "Visual_Behavior_MasterSwitch", false);
    // Blank so render() can show the localized default until a report author sets their own.
    masterLabel = new formattingSettings.TextInput({
        name: "masterLabel",
        displayNameKey: "Visual_Behavior_MasterLabel_DisplayName",
        descriptionKey: "Visual_Behavior_MasterLabel_Description",
        placeholder: "All",
        value: ""
    });

    name: string = "behavior";
    displayNameKey: string = "Visual_Card_Behavior";
    slices: Array<FormattingSettingsSlice> = [this.onlyOneActive, this.masterSwitch, this.masterLabel];

    onPreProcess(): void {
        this.masterLabel.visible = this.masterSwitch.value;
    }
}

/** Layout: where the rows sit and how they are spaced inside the visual. */
class LayoutCardSettings extends FormattingSettingsCompositeCard {
    // Left/Center/Right pack the name and toggle columns together; Justify spreads them to
    // opposite edges. Everything but Left stretches the group to the full width first.
    rowAlignment = dropdown("rowAlignment", "Visual_Layout_RowAlignment", ALIGNMENT_ITEMS, "left");
    rowSpacing = pixels(8, 0, 48, "rowSpacing", "Visual_Layout_RowSpacing");
    indent = pixels(16, 0, 64, "indent", "Visual_Layout_Indent");
    verticalAlignment = dropdown("verticalAlignment", "Visual_Layout_VerticalAlignment", [
        { value: "top", displayName: "Top" },
        { value: "middle", displayName: "Middle" },
        { value: "bottom", displayName: "Bottom" }
    ], "middle");
    padding = pixels(8, 0, 48, "padding", "Visual_Layout_Padding");

    name: string = "layout";
    displayNameKey: string = "Visual_Card_Layout";

    rowsGroup = new FormattingSettingsGroup({
        name: "layoutRows",
        displayNameKey: "Visual_Group_Rows",
        slices: [this.rowAlignment, this.rowSpacing, this.indent]
    });
    placementGroup = new FormattingSettingsGroup({
        name: "layoutPlacement",
        displayNameKey: "Visual_Group_Placement",
        slices: [this.verticalAlignment, this.padding]
    });
    groups: Array<FormattingSettingsGroup> = [this.rowsGroup, this.placementGroup];
}

/** Title: a heading this visual draws itself (not Power BI's own General -> Title). */
class TitleCardSettings extends FormattingSettingsCard {
    show = toggleSwitch("show", "Visual_Title_Show", true);
    // Blank so render() can show the localized default until a report author sets their own text.
    text = new formattingSettings.TextInput({
        name: "text",
        displayNameKey: "Visual_Title_Text_DisplayName",
        descriptionKey: "Visual_Title_Text_Description",
        placeholder: "Toggle group",
        value: ""
    });
    position = dropdown("position", "Visual_Title_Position", [
        { value: "above", displayName: "Above" },
        { value: "inline-left", displayName: "Left" },
        { value: "inline-right", displayName: "Right" }
    ], "above");
    alignment = dropdown("alignment", "Visual_Title_Alignment", ALIGNMENT_ITEMS, "left");
    spacing = pixels(8, 0, 64, "spacing", "Visual_Title_Spacing");
    font = fontControl("Visual_Title_Font", "Segoe UI", 14, true);
    fontColor = colorPicker("fontColor", "Visual_Title_FontColor", "#605E5C");

    name: string = "title";
    displayNameKey: string = "Visual_Card_Title";
    topLevelSlice = this.show;
    slices: Array<FormattingSettingsSlice> = [this.text, this.position, this.alignment, this.spacing, this.font, this.fontColor];
}

/**
 * Border & background: the box drawn around the whole group, title included. The border styles
 * are fixed treatments layered over one colour and width, the way the 3D effect layers shading
 * over whatever solid colour a toggle already has.
 */
class FrameCardSettings extends FormattingSettingsCompositeCard {
    borderStyle = dropdown("borderStyle", "Visual_Frame_BorderStyle", [
        { value: "none", displayName: "None" },
        { value: "flat", displayName: "Flat" },
        { value: "embossed", displayName: "Embossed" },
        { value: "gutter", displayName: "Gutter" }
    ], "none");
    borderColor = colorPicker("borderColor", "Visual_Frame_BorderColor", "#C8C6C4");
    borderWidth = pixels(1, 0, 8, "borderWidth", "Visual_Frame_BorderWidth");
    cornerRadius = pixels(4, 0, 32, "cornerRadius", "Visual_Frame_CornerRadius");

    // Separate from Power BI's own General -> Background, which every visual gets and this code
    // can't touch; the descriptions say so.
    showBackground = toggleSwitch("showBackground", "Visual_Frame_Background", false);
    backgroundColor = colorPicker("backgroundColor", "Visual_Frame_BackgroundColor", "#FFFFFF");

    name: string = "frame";
    displayNameKey: string = "Visual_Card_Frame";

    borderGroup = new FormattingSettingsGroup({
        name: "frameBorder",
        displayNameKey: "Visual_Group_Border",
        slices: [this.borderStyle, this.borderColor, this.borderWidth, this.cornerRadius]
    });
    backgroundGroup = new FormattingSettingsGroup({
        name: "frameBackground",
        displayNameKey: "Visual_Group_Background",
        topLevelSlice: this.showBackground,
        slices: [this.backgroundColor]
    });
    groups: Array<FormattingSettingsGroup> = [this.borderGroup, this.backgroundGroup];

    onPreProcess(): void {
        const hasBorder = this.borderStyle.value.value !== "none";
        this.borderColor.visible = hasBorder;
        this.borderWidth.visible = hasBorder;
    }
}

/** Visual settings model class */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    controlsCard = new ControlsCardSettings();
    stateLabelsCard = new StateLabelsCardSettings();
    namesCard = new NamesCardSettings();
    behaviorCard = new BehaviorCardSettings();
    layoutCard = new LayoutCardSettings();
    titleCard = new TitleCardSettings();
    frameCard = new FrameCardSettings();

    cards = [
        this.controlsCard, this.stateLabelsCard, this.namesCard, this.behaviorCard,
        this.layoutCard, this.titleCard, this.frameCard
    ];

    constructor() {
        super();
        this.stateLabelsCard.isToggleStyle = () => this.controlsCard.controlStyle.value.value === "toggle";
    }
}
