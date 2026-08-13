import Logger from "../lib/Logger.js";
import { refreshCustomSongs } from "../customs/loadCustomSongs.js";

export const hookSupportButton = async () => {
  Logger.log("[unlockCustomSongs] Setting up custom songs hook...");

  const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  assembly
    .class("OptionsDialog")
    .method("SupportButtonPressed").implementation = function () {
    Logger.log("[SupportButtonPressed] Support button pressed");
    void refreshCustomSongs("support");
  };
};
