import "frida-il2cpp-bridge";
import { lengthFixer } from "../functions/lengthFixer.js";
import { unlockAllSongs } from "../hacks/unlockAllSongs.js";
import {
  prepareCustomSongs,
  unlockCustomSongs,
} from "../hacks/unlockCustomSongs.js";
import { getScores } from "../utilities/getScores.js";
import { hookGraphics } from "../hacks/graphics.js";
import Logger from "../lib/Logger.js";
import Device from "../lib/Device.js";
import { ignoreNotificationErrors } from "../utilities/ignoreNotificationErrors.js";
import { saveProfile } from "../utilities/saveProfile.js";

Logger.log("Starting mod...");

let enteredIl2Cpp = false;
let diagnosticTicks = 0;
Logger.log("Requesting IL2CPP initialization callback");

const diagnosticTimer = setInterval(() => {
  if (enteredIl2Cpp || diagnosticTicks++ >= 20) {
    clearInterval(diagnosticTimer);
    return;
  }

  try {
    const unity = Process.findModuleByName("UnityFramework");
    Logger.log(
      `[IL2CPP wait ${diagnosticTicks}] UnityFramework=${
        unity ? `${unity.base}/${unity.size}` : "not loaded"
      } currentThread=${Process.getCurrentThreadId()}`
    );
  } catch (error) {
    Logger.log(`[IL2CPP wait ${diagnosticTicks}] diagnostic error: ${error}`);
  }
}, 1000);

let initialization: Promise<void>;
try {
  initialization = Il2Cpp.perform(async () => {
  enteredIl2Cpp = true;
  clearInterval(diagnosticTimer);
  Logger.log("Entered IL2CPP initialization");
  try {
    saveProfile();

    // Error 110 can be raised while score/account requests are still pending,
    // so every protective hook must be active before the first network wait.
    ignoreNotificationErrors();
    Logger.log("Ignored notification errors");

    // This legacy Settings-button hook is not present in the native graft
    // allowlist shipped with the working IPA. It is unrelated to custom songs.
    try {
      unlockAllSongs();
      Logger.log("Installed legacy unlock-all hook");
    } catch (error: any) {
      Logger.log(
        `Skipped legacy unlock-all hook: ${error?.stack || error?.message || error}`
      );
    }

    try {
      lengthFixer();
      Logger.log("Installed length fixer");
    } catch (error: any) {
      Logger.log(`Skipped length fixer: ${error?.stack || error}`);
    }
    try {
      hookGraphics();
      Logger.log("Installed graphics options");
    } catch (error: any) {
      Logger.log(`Skipped graphics options: ${error?.stack || error}`);
    }

    prepareCustomSongs();
    Logger.log("Prepared custom-song hooks");

    // Match the working Beatclone startup: confirm the mod immediately and do
    // not hold game initialization open while waiting for frontend-only models.
    Logger.log("mod loaded");
    Device.alert("mod loaded");

    void (async () => {
      let dismissLoading = () => {};
      try {
        Logger.log("Background custom-song initialization started");
        const scores = await getScores();
        Logger.log(`Downloaded ${scores.length} saved scores in background`);

        const customSongCount = await unlockCustomSongs(() => {
          Logger.log("Showing custom-song loading overlay");
          dismissLoading = Device.showLoading(
            "Loading custom songs and restoring best scores…"
          );
        });

        Logger.log(
          `Background custom-song initialization completed with ${customSongCount} songs`
        );
      } catch (error: any) {
        Logger.log(
          `Background custom-song initialization failed: ${
            error?.stack || error?.message || error
          }`
        );
      } finally {
        dismissLoading();
        Logger.log("Custom-song loading overlay dismissed");
      }
    })();
  } catch (error: any) {
    Logger.log(
      `Main initialization error: ${error?.stack || error?.message || error}`
    );
    setTimeout(() => {
      Device.alert(`Main initialization error: ${error}`);
    }, 3000);
  }
  });

  initialization
    .then(() => Logger.log("IL2CPP initialization task completed"))
    .catch((error) =>
      Logger.log(
        `IL2CPP initialization promise rejected: ${error?.stack || error}`
      )
    );
} catch (error: any) {
  Logger.log(`IL2CPP initialization call threw: ${error?.stack || error}`);
}
