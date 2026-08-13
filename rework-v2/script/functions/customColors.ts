import SettingsReader, { Color } from "../lib/SettingsReader.js";

const convertColor = (color: Color) => {
  const a = Math.round(color.a * 255);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  let finalColor = (r << 24) | (g << 16) | (b << 8) | a;

  if (finalColor > 0x7fffffff) {
    finalColor = finalColor - 0x100000000;
  }

  return finalColor;
};

export const customColors = () => {
  const raksha = Il2Cpp.domain.assembly("RakshaModel").image;

  const colors = Il2Cpp.gc.choose(
    raksha.class("com.spaceape.config.RhythmGameScoreColourCollection")
  );

  for (const color of colors) {
    let newColor: Color | null = null;

    const idLabel = color.field("idLabel").value.toString().slice(1, -1);

    if (idLabel === "APLUS") {
      newColor = (SettingsReader.getSetting("aPlusColor") as Color) ?? {
        r: 1,
        g: 0,
        b: 1,
        a: 1,
      };
    }
    if (idLabel === "A") {
      newColor = SettingsReader.getSetting("aColor") as Color;
    }
    if (idLabel === "B") {
      newColor = SettingsReader.getSetting("bColor") as Color;
    }

    if (newColor) {
      color.field("LaneFeedbackColour").value = convertColor(newColor);
      color.field("FeedbackTextColour").value = convertColor(newColor);
    }
  }
};
