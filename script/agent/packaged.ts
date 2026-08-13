/// <reference path="../types/frida-http.d.ts" />

import "frida-il2cpp-bridge";
import Logger from "../lib/Logger.js";
import { createDirectories } from "../lib/Utilities.js";

// Frida Gadget calls this during its early blocking stage. Keep this bootstrap
// synchronous and local: account and score network work belongs to the main
// payload after the game's protective hooks have been installed.
rpc.exports = {
  init(stage) {
    Logger.log(`Packaged bootstrap running at ${stage} stage`);
    try {
      const modules = Process.enumerateModules()
        .filter(
          (module) =>
            module.name.includes("Unity") || module.name.includes("Beatstar")
        )
        .map((module) => `${module.name}@${module.base}`)
        .join(", ");
      Logger.log(`Relevant modules at bootstrap: ${modules || "none"}`);
    } catch (error) {
      Logger.log(`Failed to enumerate bootstrap modules: ${error}`);
    }
    createDirectories();
    Logger.log("Packaged bootstrap ready");
  },
};

// Build the bootstrap and game payload into one JavaScript bundle. This keeps a
// single frida-il2cpp-bridge instance alive from the early stage through Unity
// initialization, avoiding a second late bridge missing il2cpp_init.
import "../device/device.js";
