//@ts-nocheck

import BeatmapTemplate from "./BeatmapTemplate.js";
import DataCache from "./DataCache.js";
import Logger from "./Logger.js";
import Device from "./Device.js";
import { normalizeCustomSongId } from "./CustomSongIdentity.js";

const patchFile = (path: string, offset: number) => {
  const mscorlib = Il2Cpp.domain.assembly("mscorlib").image;

  const stream = mscorlib.class("System.IO.FileStream").alloc();
  stream
    .method(".ctor")
    .overload("System.String", "System.IO.FileMode", "System.IO.FileAccess")
    .invoke(
      Il2Cpp.string(path),
      mscorlib.class("System.IO.FileMode").field("Open").value,
      mscorlib.class("System.IO.FileAccess").field("ReadWrite").value
    );

  stream.method("set_Position").invoke(new Int64(offset));
  const deviceByte = stream.method("ReadByte").invoke();
  if (deviceByte === 9) {
    // already patched
    stream.method("Dispose").invoke(false);
    return;
  }

  if (deviceByte !== 13) {
    Logger.log("Failed to patch bundle: ", path);
    stream.method("Dispose").invoke(false);
    return;
  }

  stream.method("set_Position").invoke(new Int64(offset));
  stream.method("WriteByte").invoke(9);
  stream.method("Flush").invoke();
  stream.method("Dispose").invoke(false);
};

export default class CustomSongReader {
  dataCache: DataCache;
  constructor(dataCache: DataCache) {
    this.dataCache = dataCache;
    Logger.log("[CustomSongReader] Initialized with DataCache");
  }

  async readCustomSongsOnDevice() {
    Logger.log("[readCustomSongsOnDevice] Starting to read custom songs");
    try {
      const mscorlib = Il2Cpp.domain.assembly("mscorlib").image;
      const directory = Device.documents("songs/");
      const moddedFiles = [];
      const promises = [];
      const brokenSongs = [];
      const seenSongIds = new Set<number>();

      Logger.log("[readCustomSongsOnDevice] Getting directory listing");
      const files = mscorlib
        .class("System.IO.Directory")
        .method("GetDirectories")
        .invoke(Il2Cpp.string(directory));
      Logger.log(`[readCustomSongsOnDevice] Found ${files.length} directories`);

      for (const file of files) {
        const path = file.toString().slice(1, -1);
        Logger.log(`[readCustomSongsOnDevice] Processing directory: ${path}`);

        promises.push(
          new Promise((resolve) => {
            try {
              Logger.log(
                `[readCustomSongsOnDevice] Patching bundles for: ${path}`
              );
              patchFile(path + "/artwork.bundle", 249);
              patchFile(path + "/audio.bundle", 187);
              patchFile(path + "/chart.bundle", 187);

              Logger.log(
                `[readCustomSongsOnDevice] Reading info.json from: ${path}`
              );
              let data = mscorlib
                .class("System.IO.File")
                .method("ReadAllText")
                .invoke(Il2Cpp.string(`${path}/info.json`));
              data = JSON.parse(data.toString().slice(1, -1));
              Logger.log(
                `[readCustomSongsOnDevice] Parsed song data: ${data.title}`
              );

              const songId = normalizeCustomSongId(data.id);
              if (seenSongIds.has(songId)) {
                throw new Error(`Duplicate custom song id ${songId}`);
              }
              seenSongIds.add(songId);

              data.path = `file:///${path}/`;
              let t = new BeatmapTemplate(songId, data.path);

              let score = data.maxScore ? parseInt(data.maxScore) : 500000;
              let difficultyId = data.difficulty;

              Logger.log(
                `[readCustomSongsOnDevice] Processing difficulty for: ${data.title}`
              );
              if (data.difficulty) {
                difficultyId = difficultyId.toString();
                if (difficultyId == "extreme") {
                  difficultyId = 1;
                } else if (difficultyId == "hard") {
                  difficultyId = 3;
                } else if (difficultyId == "normal") {
                  difficultyId = 4;
                } else {
                  difficultyId = parseInt(difficultyId);
                }
              } else {
                difficultyId = 1;
              }

              t.test();

              //apply custom if there is
              let config;

              // check if config.json exists
              if (
                mscorlib
                  .class("System.IO.File")
                  .method("Exists")
                  .invoke(Il2Cpp.string(`${path}/config.json`))
              ) {
                try {
                  config = mscorlib
                    .class("System.IO.File")
                    .method("ReadAllText")
                    .invoke(Il2Cpp.string(`${path}/config.json`));

                  if (config) {
                    config = JSON.parse(config.toString().slice(1, -1));
                    const keys = Object.keys(config);
                    for (const key of keys) {
                      //SongTemplate
                      let subKeys = Object.keys(config[key]);
                      for (const subKey of subKeys) {
                        t._Song[subKey] = config[key][subKey];
                        t._BeatmapVariantReference._Song[subKey] =
                          config[key][subKey];
                      }
                    }
                  }
                } catch (e) {}
              }

              Logger.log(
                `[readCustomSongsOnDevice] Building template for: ${data.title}`
              );
              t.changeDetails(
                data.title,
                data.artist,
                parseFloat(data.bpm),
                parseInt(data.sections),
                score,
                data.numLanes,
                data.type
              );

              let template;
              try {
                template = t.build();
                Logger.log(
                  `[readCustomSongsOnDevice] Template built successfully for: ${data.title}`
                );
              } catch (e) {
                Logger.log(
                  `[readCustomSongsOnDevice] Failed to build template for: ${data.title}`
                );
                brokenSongs.push(data.title);
                return resolve();
              }

              let variantReference = template.field("_BeatmapVariantReference")
                .value as Il2Cpp.Object;
              variantReference.field("_Difficulty").value =
                this.dataCache.getDifficultyById(difficultyId);

              moddedFiles.push({
                id: songId,
                title: data.title,
                artist: data.artist,
                template: template,
              });
              Logger.log(
                `[readCustomSongsOnDevice] Successfully processed: ${data.title}`
              );
              resolve();
            } catch (e) {
              Logger.log(
                `[readCustomSongsOnDevice] Error processing ${path}: ${e.message}`
              );
              resolve();
            }
          })
        );
      }

      await Promise.all(promises);

      if (brokenSongs.length) {
        Logger.log(
          `[readCustomSongsOnDevice] Broken songs detected: ${brokenSongs.join(
            ", "
          )}`
        );
        Device.alert(
          `${brokenSongs.length} broken song${
            brokenSongs.length === 1 ? "" : "s"
          } detected. See log for names.`
        );
      }

      Logger.log(
        `[readCustomSongsOnDevice] Successfully processed ${moddedFiles.length} songs`
      );
      return moddedFiles;
    } catch (e) {
      Logger.log(`[readCustomSongsOnDevice] Critical error: ${e.message}`);
      Logger.log(`[readCustomSongsOnDevice] Stack trace: ${e.stack}`);
      return [];
    }
  }
}
