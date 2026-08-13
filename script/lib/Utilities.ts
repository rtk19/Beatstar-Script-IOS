import http from "@frida/http";
import Logger from "../lib/Logger.js";
import Device from "./Device.js";
import ObjC from "frida-objc-bridge";
import SettingsReader from "./SettingsReader.js";

const NETWORK_TIMEOUT_MS = 8000;

export const networkRequest = (
  path: string,
  data: object = {}
): Promise<string> => {
  const configuredHost = SettingsReader.getSetting("ip");
  const configuredPort = SettingsReader.getSetting("port");
  const options = {
    hostname: configuredHost || "143.110.226.4",
    port: configuredPort || 5000,
    path: path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  return new Promise(function (resolve, reject) {
    let settled = false;
    let result = "";
    let timeout: ReturnType<typeof setTimeout>;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result);
    };

    try {
      const req = http.request(options, (res: any) => {
        res.on("data", (d: any) => {
          result += d;
        });

        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const body = result.trim().slice(0, 500);
            finish(
              new Error(
                `Server returned HTTP ${res.statusCode}${
                  body ? `: ${body}` : " with an empty response"
                }`
              )
            );
            return;
          }
          finish();
        });

        res.on("error", (error: Error) => finish(error));
      });

      req.on("error", (error: Error) => finish(error));

      timeout = setTimeout(() => {
        const error = new Error(
          `Request to ${path} timed out after ${NETWORK_TIMEOUT_MS}ms`
        );
        req.destroy(error);
        finish(error);
      }, NETWORK_TIMEOUT_MS);

      req.write(JSON.stringify(data));
      req.end();
    } catch (error) {
      finish(error as Error);
    }
  });
};

export const scoreToMedal = (score: number, difficulty: number) => {
  const normal = {
    star_1: 0,
    star_2: 10000,
    star_3: 17500,
    star_4: 35000,
    star_5: 47500,
    medal_gold: 48500,
    medal_platinum: 49000,
    medal_diamond: 49500,
  };
  const hard = {
    star_1: 0,
    star_2: 15000,
    star_3: 37500,
    star_4: 60000,
    star_5: 71250,
    medal_gold: 72750,
    medal_platinum: 73500,
    medal_diamond: 74250,
  };
  const extreme = {
    star_1: 0,
    star_2: 20000,
    star_3: 50000,
    star_4: 80000,
    star_5: 95000,
    medal_gold: 97000,
    medal_platinum: 98000,
    medal_diamond: 99000,
  };
  switch (difficulty) {
    case 1:
      return Object.entries(extreme)
        .reverse()
        .find((el) => el[1] <= score)![0];
    case 3:
      return Object.entries(hard)
        .reverse()
        .find((el) => el[1] <= score)![0];
    default:
      return Object.entries(normal)
        .reverse()
        .find((el) => el[1] <= score)![0];
  }
};

export const createDirectories = () => {
  try {
    const NSFileManager = ObjC.classes.NSFileManager;
    const fileManager = NSFileManager.defaultManager();

    const directories = ["songs/", "script/"];

    for (const dir of directories) {
      const dirPath = Device.documents(dir);
      const exists = fileManager.fileExistsAtPath_(dirPath);

      if (!exists) {
        Logger.log(`Creating ${dir} directory...`);

        const errorPtr = Memory.alloc(Process.pointerSize);
        errorPtr.writePointer(NULL);

        const success =
          fileManager.createDirectoryAtPath_withIntermediateDirectories_attributes_error_(
            dirPath,
            true,
            null,
            errorPtr
          );

        if (success) {
          Logger.log(`${dir} directory created successfully`);
        } else {
          const error = new ObjC.Object(errorPtr.readPointer());
          Logger.log(
            `Failed to create ${dir} directory: ${error.localizedDescription()}`
          );
        }
      }
    }
  } catch (e) {
    const error = e as Error;
    Logger.log(`Error handling directories: ${error.message}`);
  }
};
