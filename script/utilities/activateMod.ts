import { killErrorHandler } from "../utilities/killErrorHandler.js";
import { disableChecksum } from "../hacks/disableChecksum.js";
import { customColors } from "../functions/customColors.js";
import { freeUnlimitedPlay } from "../hacks/freeUnlimitedPlay.js";
import { freeRestarts } from "../hacks/freeRestarts.js";
import { saveScores } from "../server/saveScores.js";
import { unlockAllSkins } from "../hacks/unlockAllSkins.js";
import { noFail } from "../functions/noFail.js";
import { autoplay } from "../functions/autoplay.js";
import { search } from "../functions/search.js";
import { forcePlayableSongs } from "../hacks/forcePlayableSongs.js";
import { disableTutorial } from "../functions/disableTutorial.js";
import { disableNews } from "../functions/disableNews.js";
import Logger from "../lib/Logger.js";

let activated = false;

const installFeature = (name: string, install: () => void) => {
  try {
    install();
    Logger.log(`[activateMod] Installed ${name}`);
    return true;
  } catch (error: any) {
    Logger.log(
      `[activateMod] Skipped ${name}: ${error?.stack || error?.message || error}`
    );
    return false;
  }
};

export const activateMod = () => {
  if (activated) {
    Logger.log("Mod already activated");
    return;
  }
  activated = true;
  Logger.log("Activating mod...");
  installFeature("error handler", killErrorHandler);
  installFeature("checksum bypass", disableChecksum);
  installFeature("custom colors", customColors);
  installFeature("unlimited play", freeUnlimitedPlay);
  installFeature("free restarts", freeRestarts);
  installFeature("score saving", saveScores);
  installFeature("all skins", unlockAllSkins);
  installFeature("no fail", noFail);
  installFeature("autoplay", autoplay);
  installFeature("search", search);
  installFeature("playable-song override", forcePlayableSongs);
  installFeature("tutorial bypass", disableTutorial);
  installFeature("news suppression", disableNews);
  Logger.log("Mod activated");
};
