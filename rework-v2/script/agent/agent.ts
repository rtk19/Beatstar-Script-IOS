import "frida-il2cpp-bridge";
import Logger from "../lib/Logger.js";
import SettingsReader from "../lib/SettingsReader.js";
import Device from "../lib/Device.js";
import fs from "frida-fs";
import { decrypt } from "../lib/Encrypter.js";
import { Buffer } from "buffer";
import { createDirectories } from "../lib/Utilities.js";

type RPCStatus = "NO_ACTION" | "EXECUTE" | "EXECUTE_LOCAL";

let publishDecision!: (status: RPCStatus) => void;
const decision = new Promise<RPCStatus>((resolve) => {
  publishDecision = resolve;
});

// Frida Gadget calls this during its early stage. Publish one deterministic
// local decision for the IL2CPP loader below; the old bootstrap started these
// two paths independently, so the loader could observe an undefined status and
// silently exit forever.
rpc.exports = {
  init(stage) {
    Logger.log(`Running RPC at ${stage} stage`);
    let status: RPCStatus;
    try {
      status = run();
    } catch (error) {
      Logger.log(`Bootstrap decision failed; using bundled payload: ${error}`);
      status = "EXECUTE";
    }
    publishDecision(status);
    Logger.log(`Finished RPC with status ${status}`);
  },
};

Il2Cpp.perform(async () => {
  const status = await decision;
  Logger.log(`Inside perform block with ${status}`);

  switch (status) {
    case "EXECUTE":
      await executeScript(status);
      break;
    case "EXECUTE_LOCAL":
      Device.alert("Running local script.");
      await executeScript(status);
      break;
  }
}, "main");

const shouldLoadScript = () => {
  return SettingsReader.getSetting("loadScript") !== "false";
};

const hasLocalScript = () => {
  try {
    fs.readFileSync(Device.documents("script/override.js"));
    return true;
  } catch (e) {
    return false;
  }
};

const executeScript = async (status: RPCStatus) => {
  const downloadedPath = Device.documents("script/script.js");
  const bundledPath =
    ObjC.classes.NSBundle.mainBundle().bundlePath().toString() +
    "/Frameworks/beatclone-device.payload";
  const path =
    status === "EXECUTE"
      ? bundledPath
      : Device.documents("script/override.js");

  let script: any;
  try {
    script = fs.readFileSync(path);
    if (status === "EXECUTE") Logger.log("Loading bundled Beatclone payload.");
  } catch (e) {
    Logger.log("Bundled payload unavailable. Loading downloaded script.");
    script = fs.readFileSync(downloadedPath);
  }
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

function run(): RPCStatus {
  createDirectories();
  if (!shouldLoadScript()) {
    Logger.log("Not loading script due to settings file.");
    Device.alert("Not loading script due to settings file");
    return "NO_ACTION";
  }

  if (hasLocalScript()) {
    Logger.log("Found a local script. Loading that instead.");
    return "EXECUTE_LOCAL";
  }

  // The IPA contains the payload built and validated with this bootstrap.
  // Loading it must not depend on the availability or timing of a remote
  // version service. Updates are delivered by installing a newly built IPA.
  Logger.log("Using the payload bundled with this Beatclone build.");
  return "EXECUTE";
}
