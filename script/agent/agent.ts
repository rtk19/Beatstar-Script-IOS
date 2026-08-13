/// <reference path="../types/frida-http.d.ts" />

import "frida-il2cpp-bridge";
import Logger from "../lib/Logger.js";
import SettingsReader from "../lib/SettingsReader.js";
import Device from "../lib/Device.js";
import fs from "frida-fs";
import { decrypt } from "../lib/Encrypter.js";
import { Buffer } from "buffer";
import { isUndefined } from "../utilities/isUndefined.js";
import { createDirectories, networkRequest } from "../lib/Utilities.js";

type RPCStatus = "NO_ACTION" | "EXECUTE_LOCAL" | "EXECUTE_BUNDLED";

let done: RPCStatus;

//this runs before the entry point so we can do our network requests here
rpc.exports = {
  async init(stage, parameters) {
    Logger.log(`Running RPC at ${stage} stage`);
    try {
      done = await run();
    } catch (e) {
      const error = e as Error;
      Logger.log(`Bootstrap failed: ${error.message}`);
      done = "EXECUTE_BUNDLED";
    }
    Logger.log(`Finished RPC with status ${done}`);

    if (done === "NO_ACTION") return;

    createNewUser();

    if (SettingsReader.getSetting("forceLogin") === "true") {
      Il2Cpp.perform(() => showLoginScreen(), "main");
    }

    await executeScript();
  },
};

const showLoginScreen = () => {
  const loginRuntime = Il2Cpp.domain.assembly("SpaceApe.Login.Runtime").image;

  loginRuntime.class("LoginPicker").method(".ctor").implementation = function (
    a,
    b,
    c,
    d
  ) {
    this.method(".ctor").invoke(a, b, c, d);
    this.method("ShowPlayerLogin").invoke();
  };
};

const createNewUser = () => {
  Logger.log("Checking if it's our first time using the mod...");
  networkRequest("/createAccount", { deviceId: Device.getDeviceID() }).catch(
    (error: Error) => Logger.log(`Account check failed: ${error.message}`)
  );
};

const shouldLoadScript = () => {
  return SettingsReader.getSetting("loadScript") !== "false";
};

const isServerModified = () => {
  return (
    !isUndefined(SettingsReader.getSetting("ip")) ||
    !isUndefined(SettingsReader.getSetting("port"))
  );
};

const hasLocalScript = () => {
  try {
    fs.readFileSync(Device.documents("script/override.js"));
    return true;
  } catch (e) {
    return false;
  }
};

const executeScript = async () => {
  if (done === "EXECUTE_LOCAL") Device.alert("Running local script.");
  else Logger.log("Running bundled fallback script.");

  const path =
    done === "EXECUTE_LOCAL"
      ? Device.documents("script/override.js")
      : done === "EXECUTE_BUNDLED"
      ? Device.frameworks("fallback.js")
      : Device.documents("script/script.js");

  const script: any = fs.readFileSync(path);
  const code = Buffer.from(script.toString(), "base64").toString();
  const decrypted = decrypt(code);

  //the script should be responsible for showing "Mod loaded." so we don't get false positives

  try {
    eval(decrypted);
  } catch (e) {
    const error = e as Error;
    Logger.log(`Error running script: ${error.message}`);
  }
};

async function run(): Promise<RPCStatus> {
  createDirectories();
  if (!shouldLoadScript()) {
    Logger.log("Not loading script due to settings file.");
    Device.alert("Not loading script due to settings file");
    return "NO_ACTION";
  }
  if (isServerModified()) {
    Logger.log("Server is modified.");
    Device.alert(
      "Modified server configuration detected. Do not report bugs that occur from this."
    );
  }

  if (hasLocalScript()) {
    Logger.log("Found a local script. Loading that instead.");
    return "EXECUTE_LOCAL";
  }

  // This IPA carries its matching script. Prefer it over a cached or remotely
  // downloaded payload so installs are reproducible and fixes take effect
  // immediately. A Documents/script/override.js remains available for testing.
  Logger.log("Loading the script bundled with this Beatclone build.");
  return "EXECUTE_BUNDLED";
}
