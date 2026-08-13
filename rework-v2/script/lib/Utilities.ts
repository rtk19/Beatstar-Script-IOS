import http from "http";
import Logger from "../lib/Logger.js";
import Device from "./Device.js";

export const networkRequest = (path: string, data: object = {}): any => {
  const options = {
    hostname: "143.110.226.4",
    port: 5000,
    path: path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      data: JSON.stringify(data),
    },
  };

  let result = "";

  return new Promise(function (resolve) {
    try {
      const req = http.request(options, (res) => {
        res.on("data", (d) => {
          result += d;
        });

        res.on("end", (d: any) => {
          resolve(result);
        });
      });

      req.write(JSON.stringify(data));
      req.end();
    } catch (e) {}
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
        Memory.writePointer(errorPtr, NULL);

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
          const error = new ObjC.Object(Memory.readPointer(errorPtr));
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
