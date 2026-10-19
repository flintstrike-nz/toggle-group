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
 * The Format pane, outside in: Toggle Group (the box around everything), Toggle Group Label (its
 * heading), Toggle (the switch, checkbox or radio), Handle (what slides or sits inside the toggle),
 * Toggle Label (each row's name), State Label (the On/Off text) and Group Behavior (the rules).
 * Each card is one capabilities.json object with the same name, and every property name below is
 * unique within its card.
 *
 * Every layer but Group Behavior has the same box settings - Background, Border (None, Flat,
 * Embossed or Sunken), Corner radius and Padding - built by BoxSlices, so they read the same way
 * everywhere. Numeric limits are written once here (not in capabilities.json), and every user-facing
 * string is a localization key - dropdown item captions are the one exception (see CLAUDE.md).
 */

function pixels(value: number, min: number, max: number, name: string, key: string, unit: string = "px"): formattingSettings.NumUpDown {
    return new formattingSettings.NumUpDown({
        name,
        displayNameKey: `${key}_DisplayName`,
        descriptionKey: `${key}_Description`,
        value,
        options: {
            unitSymbol: unit,
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

export const BORDER_STYLE_ITEMS = [
    { value: "none", displayName: "None" },
    { value: "flat", displayName: "Flat" },
    { value: "embossed", displayName: "Embossed" },
    { value: "sunken", displayName: "Sunken" }
];

interface BoxDefaults {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    cornerRadius: number;
    padding: number;
}

/**
 * Background, Border, Corner radius and Padding for one layer. `background` says what the layer's
 * fill is: a "toggle" (a Background group with its own on/off header - off by default, so the layer
 * shows whatever is behind it), a plain "color" (always on, e.g. the handle), or "none" (the layer's
 * fill is set elsewhere, e.g. the toggle's On/Off colors). Corner radius is px for text and box
 * layers and a percentage (50 = fully round) for the toggle and handle, whose size follows the
 * toggle's height.
 */
export class BoxSlices {
    showBackground = toggleSwitch("showBackground", "Visual_Box_ShowBackground", false);
    backgroundColor: formattingSettings.ColorPicker;
    borderStyle = dropdown("borderStyle", "Visual_Box_BorderStyle", BORDER_STYLE_ITEMS, "none");
    borderColor: formattingSettings.ColorPicker;
    borderWidth: formattingSettings.NumUpDown;
    cornerRadius: formattingSettings.NumUpDown;
    padding: formattingSettings.NumUpDown;

    backgroundGroup?: FormattingSettingsGroup;
    borderGroup: FormattingSettingsGroup;
    shapeGroup: FormattingSettingsGroup;

    constructor(key: string, readonly background: "toggle" | "color" | "none", defaults: BoxDefaults, radiusUnit: "px" | "%" = "px", paddingUnit: "px" | "%" = "px") {
        this.backgroundColor = colorPicker("backgroundColor", "Visual_Box_BackgroundColor", defaults.backgroundColor || "#F3F2F1");
        this.borderColor = colorPicker("borderColor", "Visual_Box_BorderColor", defaults.borderColor || "#C8C6C4");
        this.borderWidth = pixels(defaults.borderWidth ?? 1, 0, 8, "borderWidth", "Visual_Box_BorderWidth");
        this.cornerRadius = pixels(defaults.cornerRadius, 0, radiusUnit === "%" ? 50 : 32, "cornerRadius", "Visual_Box_CornerRadius", radiusUnit);
        this.padding = pixels(defaults.padding, 0, paddingUnit === "%" ? 40 : 48, "padding", "Visual_Box_Padding", paddingUnit);

        if (background !== "none") {
            this.backgroundGroup = new FormattingSettingsGroup({
                name: `${key}Background`,
                displayNameKey: background === "color" ? "Visual_Group_Color" : "Visual_Group_Background",
                topLevelSlice: background === "toggle" ? this.showBackground : undefined,
                slices: [this.backgroundColor]
            });
        }
        this.borderGroup = new FormattingSettingsGroup({
            name: `${key}Border`,
            displayNameKey: "Visual_Group_Border",
            slices: [this.borderStyle, this.borderColor, this.borderWidth]
        });
        this.shapeGroup = new FormattingSettingsGroup({
            name: `${key}Shape`,
            displayNameKey: "Visual_Group_CornersPadding",
            slices: [this.cornerRadius, this.padding]
        });
    }

    /** Background (if any), Border, then Corners & padding. */
    get groups(): Array<FormattingSettingsGroup> {
        return this.backgroundGroup
            ? [this.backgroundGroup, this.borderGroup, this.shapeGroup]
            : [this.borderGroup, this.shapeGroup];
    }

    /** Border color and width only mean something once a border style is chosen. */
    preProcess(): void {
        const hasBorder = this.borderStyle.value.value !== "none";
        this.borderColor.visible = hasBorder;
        this.borderWidth.visible = hasBorder;
    }
}

// The toggle's corner radius is a percentage of its height. 50 is a pill (toggle) or circle (radio);
// a checkbox is a rounded square. Until a report author sets their own, the pane shows the default for
// the chosen style (see ToggleCardSettings.onPreProcess() and effectiveToggleRadius() in visual.ts).
export const TOGGLE_RADIUS_DEFAULTS: { [skin: string]: number } = { toggle: 50, checkbox: 20, radio: 50 };

/** Toggle Group: the box around the title and every row, and how the rows are laid out inside it. */
class ToggleGroupCardSettings extends FormattingSettingsCompositeCard {
    // Left/Center/Right pack the name and toggle columns together; Justify spreads them to
    // opposite edges. Everything but Left stretches the group to the full width first.
    rowAlignment = dropdown("rowAlignment", "Visual_ToggleGroup_RowAlignment", ALIGNMENT_ITEMS, "left");
    rowSpacing = pixels(8, 0, 48, "rowSpacing", "Visual_ToggleGroup_RowSpacing");
    indent = pixels(16, 0, 64, "indent", "Visual_ToggleGroup_Indent");
    verticalAlignment = dropdown("verticalAlignment", "Visual_ToggleGroup_VerticalAlignment", [
        { value: "top", displayName: "Top" },
        { value: "middle", displayName: "Middle" },
        { value: "bottom", displayName: "Bottom" }
    ], "middle");

    // Separate from Power BI's own General -> Background, which every visual gets and this code
    // can't touch; the Background group's description says so.
    box = new BoxSlices("toggleGroup", "toggle", { backgroundColor: "#FFFFFF", cornerRadius: 4, padding: 8 });

    name: string = "toggleGroup";
    displayNameKey: string = "Visual_Card_ToggleGroup";

    layoutGroup = new FormattingSettingsGroup({
        name: "toggleGroupLayout",
        displayNameKey: "Visual_Group_Layout",
        slices: [this.rowAlignment, this.rowSpacing, this.indent, this.verticalAlignment]
    });
    groups: Array<FormattingSettingsGroup> = [this.layoutGroup, ...this.box.groups];

    onPreProcess(): void {
        this.box.preProcess();
    }
}

/** Toggle Group Label: a heading this visual draws itself (not Power BI's own General -> Title). */
class GroupLabelCardSettings extends FormattingSettingsCompositeCard {
    show = toggleSwitch("show", "Visual_GroupLabel_Show", true);
    // Blank so render() can show the localized default until a report author sets their own text.
    text = new formattingSettings.TextInput({
        name: "text",
        displayNameKey: "Visual_GroupLabel_Text_DisplayName",
        descriptionKey: "Visual_GroupLabel_Text_Description",
        placeholder: "Toggle group",
        value: ""
    });
    position = dropdown("position", "Visual_GroupLabel_Position", [
        { value: "above", displayName: "Above" },
        { value: "inline-left", displayName: "Left" },
        { value: "inline-right", displayName: "Right" }
    ], "above");
    alignment = dropdown("alignment", "Visual_GroupLabel_Alignment", ALIGNMENT_ITEMS, "left");
    spacing = pixels(8, 0, 64, "spacing", "Visual_GroupLabel_Spacing");
    font = fontControl("Visual_GroupLabel_Font", "Segoe UI", 14, true);
    fontColor = colorPicker("fontColor", "Visual_GroupLabel_FontColor", "#605E5C");

    box = new BoxSlices("groupLabel", "toggle", { cornerRadius: 4, padding: 0 });

    name: string = "groupLabel";
    displayNameKey: string = "Visual_Card_GroupLabel";
    topLevelSlice = this.show;

    textGroup = new FormattingSettingsGroup({
        name: "groupLabelText",
        displayNameKey: "Visual_Group_Text",
        slices: [this.text, this.position, this.alignment, this.spacing, this.font, this.fontColor]
    });
    groups: Array<FormattingSettingsGroup> = [this.textGroup, ...this.box.groups];

    onPreProcess(): void {
        this.box.preProcess();
    }
}

/** Toggle: the switch, checkbox or radio itself - its style, colors, size, border, corners and padding. */
class ToggleCardSettings extends FormattingSettingsCompositeCard {
    // Graphical skin only: behaviour is identical for all three. Radio pairs naturally with
    // Group Behavior -> Only one active, but isn't tied to it.
    controlStyle = dropdown("controlStyle", "Visual_Toggle_Style", [
        { value: "toggle", displayName: "Toggle" },
        { value: "checkbox", displayName: "Checkbox" },
        { value: "radio", displayName: "Radio" }
    ], "toggle");
    depthEffect = toggleSwitch("depthEffect", "Visual_Toggle_Depth", false);

    // The static value is only the fallback before a report author touches the swatch -
    // applyColors() in visual.ts uses the report theme's first data colour until then.
    onColor = colorPicker("onColor", "Visual_Toggle_OnColor", "#2ECC71");
    offColor = colorPicker("offColor", "Visual_Toggle_OffColor", "#B0B3B8");

    sizeMode = dropdown("sizeMode", "Visual_Toggle_SizeMode", [
        { value: "responsive", displayName: "Responsive" },
        { value: "fixed", displayName: "Fixed" }
    ], "responsive");
    // 16/22 reproduce the two sizes the visual first shipped with, now the floor/ceiling of a fluid scale.
    minHeight = pixels(16, 8, 200, "minHeight", "Visual_Toggle_MinHeight");
    maxHeight = pixels(22, 8, 200, "maxHeight", "Visual_Toggle_MaxHeight");
    fixedHeight = pixels(22, 8, 200, "fixedHeight", "Visual_Toggle_FixedHeight");

    // Border color/width default to the dark grey and 2px the old outline used; Padding is the gap
    // between the toggle's edge and its handle (2px, as before).
    box = new BoxSlices("toggle", "none", { borderColor: "#605E5C", borderWidth: 2, cornerRadius: TOGGLE_RADIUS_DEFAULTS.toggle, padding: 2 }, "%");

    // Set by update() from the raw dataView object: true once a report author has chosen a radius.
    radiusIsCustom: boolean = false;

    name: string = "toggleControl";
    displayNameKey: string = "Visual_Card_Toggle";

    styleGroup = new FormattingSettingsGroup({
        name: "toggleStyle",
        displayNameKey: "Visual_Group_Style",
        slices: [this.controlStyle, this.depthEffect]
    });
    colorsGroup = new FormattingSettingsGroup({
        name: "toggleColors",
        displayNameKey: "Visual_Group_Colors",
        slices: [this.onColor, this.offColor]
    });
    sizeGroup = new FormattingSettingsGroup({
        name: "toggleSize",
        displayNameKey: "Visual_Group_Size",
        slices: [this.sizeMode, this.minHeight, this.maxHeight, this.fixedHeight]
    });
    groups: Array<FormattingSettingsGroup> = [this.styleGroup, this.colorsGroup, this.sizeGroup, ...this.box.groups];

    onPreProcess(): void {
        const skin = String(this.controlStyle.value.value);
        const isFixed = this.sizeMode.value.value === "fixed";
        this.minHeight.visible = !isFixed;
        this.maxHeight.visible = !isFixed;
        this.fixedHeight.visible = isFixed;

        // A radio is always a circle, so its radius is hidden; otherwise show the style's own default
        // until the report author sets one.
        this.box.cornerRadius.visible = skin !== "radio";
        if (!this.radiusIsCustom) {
            this.box.cornerRadius.value = TOGGLE_RADIUS_DEFAULTS[skin] ?? 50;
        }
        this.box.preProcess();
    }
}

/**
 * Handle: whatever sits inside the toggle - the sliding knob of a toggle, the dot of a radio, the
 * tick of a checkbox. Its Background is that element's color. Border and Corner radius shape the
 * knob or dot (a tick has no outline), and Padding - a percentage of the toggle's height, so the dot
 * or tick scales with it - insets the dot or tick inside the toggle, so it only applies to the
 * checkbox and radio styles.
 */
class HandleCardSettings extends FormattingSettingsCompositeCard {
    box = new BoxSlices("handle", "color", { backgroundColor: "#FFFFFF", borderColor: "#605E5C", borderWidth: 1, cornerRadius: 50, padding: 18 }, "%", "%");

    // Wired up by the model: which control style is chosen decides which settings apply.
    skin: () => string = () => "toggle";

    name: string = "handle";
    displayNameKey: string = "Visual_Card_Handle";
    groups: Array<FormattingSettingsGroup> = this.box.groups;

    onPreProcess(): void {
        const skin = this.skin();
        this.box.borderGroup.visible = skin !== "checkbox";
        this.box.cornerRadius.visible = skin !== "checkbox";
        this.box.padding.visible = skin !== "toggle";
        this.box.preProcess();
    }
}

/** Toggle Label: each row's name, which is its bound field's display name. */
class ToggleLabelCardSettings extends FormattingSettingsCompositeCard {
    show = toggleSwitch("show", "Visual_ToggleLabel_Show", true);
    position = dropdown("position", "Visual_ToggleLabel_Position", [
        { value: "left", displayName: "Left" },
        { value: "right", displayName: "Right" }
    ], "left");
    spacing = pixels(8, 0, 64, "spacing", "Visual_ToggleLabel_Spacing");
    font = fontControl("Visual_ToggleLabel_Font", "Segoe UI", 12, false);
    fontColor = colorPicker("fontColor", "Visual_ToggleLabel_FontColor", "#252423");

    box = new BoxSlices("toggleLabel", "toggle", { cornerRadius: 4, padding: 0 });

    name: string = "toggleLabel";
    displayNameKey: string = "Visual_Card_ToggleLabel";
    topLevelSlice = this.show;

    textGroup = new FormattingSettingsGroup({
        name: "toggleLabelText",
        displayNameKey: "Visual_Group_Text",
        slices: [this.position, this.spacing, this.font, this.fontColor]
    });
    groups: Array<FormattingSettingsGroup> = [this.textGroup, ...this.box.groups];

    onPreProcess(): void {
        this.box.preProcess();
    }
}

/** State Label: the On/Off text drawn beside (or inside) each toggle. */
class StateLabelCardSettings extends FormattingSettingsCompositeCard {
    show = toggleSwitch("show", "Visual_StateLabel_Show", false);
    onText = new formattingSettings.TextInput({
        name: "onText",
        displayNameKey: "Visual_StateLabel_OnText_DisplayName",
        descriptionKey: "Visual_StateLabel_OnText_Description",
        placeholder: "On",
        value: "On"
    });
    offText = new formattingSettings.TextInput({
        name: "offText",
        displayNameKey: "Visual_StateLabel_OffText_DisplayName",
        descriptionKey: "Visual_StateLabel_OffText_Description",
        placeholder: "Off",
        value: "Off"
    });
    // Every position shows only the label for the current state; the value just decides where.
    // "Inside switch" needs the toggle style - checkbox and radio fall back to Right.
    position = dropdown("position", "Visual_StateLabel_Position", [
        { value: "inside", displayName: "Inside switch" },
        { value: "inline-left", displayName: "Left" },
        { value: "inline-right", displayName: "Right" },
        { value: "above", displayName: "Above" }
    ], "inside");
    spacing = pixels(8, 0, 64, "spacing", "Visual_StateLabel_Spacing");
    font = fontControl("Visual_StateLabel_Font", "Arial", 10, false);
    fontColor = colorPicker("fontColor", "Visual_StateLabel_FontColor", "#15284C");

    // 4px of padding gives inside text room to breathe next to the handle and the toggle's end.
    box = new BoxSlices("stateLabel", "toggle", { cornerRadius: 4, padding: 4 });

    // Wired up by the model: Spacing is meaningless while the text sits inside a toggle-style switch.
    isToggleStyle: () => boolean = () => true;

    name: string = "stateLabel";
    displayNameKey: string = "Visual_Card_StateLabel";
    topLevelSlice = this.show;

    textGroup = new FormattingSettingsGroup({
        name: "stateLabelText",
        displayNameKey: "Visual_Group_Text",
        slices: [this.onText, this.offText, this.position, this.spacing, this.font, this.fontColor]
    });
    groups: Array<FormattingSettingsGroup> = [this.textGroup, ...this.box.groups];

    onPreProcess(): void {
        this.spacing.visible = !(this.position.value.value === "inside" && this.isToggleStyle());
        this.box.preProcess();
    }
}

/**
 * Group Behavior: how the toggles act together. These only change which filters handleClick()
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

/** Visual settings model class */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    toggleGroupCard = new ToggleGroupCardSettings();
    groupLabelCard = new GroupLabelCardSettings();
    toggleCard = new ToggleCardSettings();
    handleCard = new HandleCardSettings();
    toggleLabelCard = new ToggleLabelCardSettings();
    stateLabelCard = new StateLabelCardSettings();
    behaviorCard = new BehaviorCardSettings();

    cards = [
        this.toggleGroupCard, this.groupLabelCard, this.toggleCard, this.handleCard,
        this.toggleLabelCard, this.stateLabelCard, this.behaviorCard
    ];

    constructor() {
        super();
        const skin = (): string => String(this.toggleCard.controlStyle.value.value);
        this.handleCard.skin = skin;
        this.stateLabelCard.isToggleStyle = () => skin() === "toggle";
    }
}
