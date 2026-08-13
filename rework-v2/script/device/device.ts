import "frida-il2cpp-bridge";
import { lengthFixer } from "../functions/lengthFixer.js";
import { hookGraphics } from "../hacks/graphics.js";
import Logger from "../lib/Logger.js";
import Device from "../lib/Device.js";
import { ignoreNotificationErrors } from "../utilities/ignoreNotificationErrors.js";
import { activateMod } from "../utilities/activateMod.js";
import { logErrors } from "../utilities/logErrors.js";
import { hookCintaId } from "../private-server/hookCintaId.js";
import { customServer } from "../private-server/customServer.js";

Logger.log("Starting mod...");
logErrors();

hookCintaId();
Logger.log("Hooked cinta");
customServer();
Logger.log("Hooked custom server IP's");
try {
  activateMod();
  ignoreNotificationErrors();
  lengthFixer();
  Logger.log("Fixed length");
  hookGraphics();
  Logger.log("Hooked graphics");
  Device.toast("Mod Loaded", 3000);
} catch (error) {
  Logger.log(`Main initialization error: ${error}`);
  setTimeout(() => {
    Device.alert(`Main initialization error: ${error}`);
  }, 3000);
}
