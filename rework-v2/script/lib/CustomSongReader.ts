//@ts-nocheck

import BeatmapTemplate from "./BeatmapTemplate.js";
import DataCache from "./DataCache.js";
import Logger from "./Logger.js";
import Device from "./Device.js";

const openWritableStream = (path: string) => {
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
  return stream;
};

const hasAsciiAt = (stream: Il2Cpp.Object, offset: number, value: string) => {
  stream.method("set_Position").invoke(new Int64(offset));
  for (let index = 0; index < value.length; index++) {
    if (stream.method("ReadByte").invoke() !== value.charCodeAt(index)) {
      return false;
    }
  }
  return true;
};

const writeBytesAt = (
  stream: Il2Cpp.Object,
  offset: number,
  bytes: number[]
) => {
  stream.method("set_Position").invoke(new Int64(offset));
  for (const byte of bytes) stream.method("WriteByte").invoke(byte);
};

const writeAsciiAt = (
  stream: Il2Cpp.Object,
  offset: number,
  value: string
) => {
  writeBytesAt(
    stream,
    offset,
    Array.from(value).map((character) => character.charCodeAt(0))
  );
};

const writeUInt32At = (
  stream: Il2Cpp.Object,
  offset: number,
  value: number
) => {
  writeBytesAt(stream, offset, [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
};

const restoreAudioIdentity = (path: string) => {
  const stream = openWritableStream(path);
  try {
    // All supported Beatclone custom audio bundles are generated from the same
    // fixed Unity/Wwise template. Validate its anchors before touching it.
    if (
      !hasAsciiAt(stream, 4255, "77_audiobank_") ||
      !hasAsciiAt(stream, 4303, "assets/audio/banks/") ||
      !hasAsciiAt(stream, 4387, "77_audiobank_") ||
      !hasAsciiAt(stream, 4451, "BKHD") ||
      !hasAsciiAt(stream, 4487, "DIDX")
    ) {
      throw new Error("unsupported audio bundle metadata layout");
    }

    writeAsciiAt(stream, 4268, "tst00026");
    writeAsciiAt(stream, 4322, "tst00026");
    writeAsciiAt(stream, 4400, "tst00026");
    writeAsciiAt(stream, 4439, "TST00026");
    writeUInt32At(stream, 4463, 542719590);
    writeUInt32At(stream, 4495, 20676623);
    stream.method("Flush").invoke();
  } finally {
    stream.method("Dispose").invoke(false);
  }

  Logger.log("[CustomSongIdentity] Restored original audio identity");
};

const restoreChartIdentity = (path: string) => {
  const stream = openWritableStream(path);
  try {
    if (
      !hasAsciiAt(stream, 4255, "interactions_") ||
      !hasAsciiAt(stream, 4295, "assets/beatmapinteractions/") ||
      !hasAsciiAt(stream, 4379, "interactions_")
    ) {
      throw new Error("unsupported chart bundle metadata layout");
    }

    writeAsciiAt(stream, 4268, "508");
    writeAsciiAt(stream, 4322, "508");
    writeAsciiAt(stream, 4392, "508");
    stream.method("Flush").invoke();
  } finally {
    stream.method("Dispose").invoke(false);
  }

  Logger.log("[CustomSongIdentity] Restored original chart identity");
};

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

  readCustomSongsOnDevice() {
    Logger.log("[readCustomSongsOnDevice] Starting to read custom songs");
    try {
      const mscorlib = Il2Cpp.domain.assembly("mscorlib").image;
      const directory = Device.documents("songs/");
      const moddedFiles = [];
      const brokenSongs = [];

      Logger.log("[readCustomSongsOnDevice] Getting directory listing");

      const directoryExists = mscorlib
        .class("System.IO.Directory")
        .method("Exists")
        .invoke(Il2Cpp.string(directory));
      if (!directoryExists) {
        Logger.log(
          `[readCustomSongsOnDevice] Songs directory does not exist: ${directory}`
        );
        return [];
      }

      const directoryInfo = mscorlib.class("System.IO.DirectoryInfo").alloc();

      directoryInfo.method(".ctor").invoke(Il2Cpp.string(directory));

      const files = directoryInfo.method("GetDirectories").invoke();
      Logger.log(`[readCustomSongsOnDevice] Found ${files.length} directories`);

      for (const file of files) {
        const path = file.toString();
        Logger.log(`[readCustomSongsOnDevice] Processing directory: ${path}`);

        try {
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

              Logger.log(
                `[readCustomSongsOnDevice] Patching bundles for: ${path}`
              );
              patchFile(path + "/artwork.bundle", 249);
              patchFile(path + "/audio.bundle", 187);
              patchFile(path + "/chart.bundle", 187);
              restoreAudioIdentity(path + "/audio.bundle");
              restoreChartIdentity(path + "/chart.bundle");

              data.path = `file:///${path}/`;
              let t = new BeatmapTemplate(parseInt(data.id), data.path);

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
                continue;
              }

              let variantReference = template.field("_BeatmapVariantReference")
                .value as Il2Cpp.Object;
              variantReference.field("_Difficulty").value =
                this.dataCache.getDifficultyById(difficultyId);

              moddedFiles.push({
                id: data.id,
                title: data.title,
                artist: data.artist,
                template: template,
              });
              Logger.log(
                `[readCustomSongsOnDevice] Successfully processed: ${data.title}`
              );
        } catch (e) {
          Logger.log(
            `[readCustomSongsOnDevice] Error processing ${path}: ${e.message}`
          );
        }
      }

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
      throw e;
    }
  }
}
