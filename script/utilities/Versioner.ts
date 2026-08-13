import fs from "frida-fs";
import { networkRequest } from "../lib/Utilities.js";
import Logger from "../lib/Logger.js";
import Device from "../lib/Device.js";

const getLocalVersion = () => {
  try {
    return fs.readFileSync(Device.documents("script/version")).toString();
  } catch (e) {
    return "0.0.0.0";
  }
};

const getLiveVersion = async (): Promise<string | null> => {
  try {
    return await networkRequest("/versionios", {
      version: getLocalVersion(),
    });
  } catch (e) {
    const error = e as Error;
    Logger.log(`Got an error contacting the server: ${error.message}`);
    return null;
  }
};

export { getLocalVersion, getLiveVersion };
