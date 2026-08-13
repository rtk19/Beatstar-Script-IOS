import http from "http";
import fs from "frida-fs";
import CustomSongReader from "../lib/CustomSongReader.js";
import DataCache from "../lib/DataCache.js";
import Device from "../lib/Device.js";
import {
  customSongs,
  dataCache,
  setCustomSongs,
  setDataCache,
} from "../lib/Globals.js";
import { scoreToMedal } from "../lib/Utilities.js";
import { songNameHack } from "../hacks/songName.js";
import { hookOnDeviceBundles } from "./hookOnDeviceBundles.js";
import { hookRemoteBundles } from "./hookRemoteBundles.js";
import { ignoreBundleHash } from "./ignoreBundleHash.js";
import Translation from "../lib/Translation.js";
import Logger from "../lib/Logger.js";

interface SavedScore {
  beatmapId: number;
  absoluteScore: number;
}

let loading = false;
let startupTriggered = false;
let bundleHooksInstalled = false;
let appendedTranslationCount = 0;
let lastAssignedTranslationLength = 0;
let successfulLoadCount = 0;

const STARTUP_DELAY_MS = 1500;
const STARTUP_RETRY_DELAY_MS = 1000;
const STARTUP_MAX_ATTEMPTS = 8;
const SCORE_REQUEST_TIMEOUT_MS = 10000;

const requireManagedObject = (
  objects: Il2Cpp.Object[],
  name: string
): Il2Cpp.Object => {
  const object = objects[0];
  if (!object || object.toString() === "null") {
    throw new Error(`${name} is not ready`);
  }
  return object;
};

const refreshSongSearchCaches = (assembly: Il2Cpp.Image) => {
  try {
    const searches = Il2Cpp.gc.choose(
      assembly.class("ClientSongListSearch")
    );
    for (const search of searches) {
      search.method("CacheSongs").invoke();
    }
    Logger.log(
      `[CustomSongs] refreshed ${searches.length} song search cache${
        searches.length === 1 ? "" : "s"
      }`
    );
  } catch (error) {
    // Search indexing should never invalidate an otherwise successful song
    // refresh. A later-created ClientSongListSearch will cache the current list
    // in its normal constructor path.
    Logger.log(`[CustomSongs] song search cache refresh failed: ${error}`);
  }
};

const fetchScores = (cinta: string): Promise<SavedScore[]> => {
  const options = {
    hostname: "beatstarmod.app",
    port: 4000,
    path: "/scores",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };

  return new Promise((resolve) => {
    let response = "";
    let finished = false;
    let request: any;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (scores: SavedScore[]) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(scores);
    };
    timeout = setTimeout(() => {
      Logger.log("[CustomSongs] score request timed out");
      try {
        request?.destroy();
      } catch (_) {}
      finish([]);
    }, SCORE_REQUEST_TIMEOUT_MS);

    try {
      request = http.request(options, (result) => {
        result.on("data", (data) => {
          response += data;
        });
        result.on("end", () => {
          try {
            const parsed = JSON.parse(response);
            finish(Array.isArray(parsed) ? parsed : []);
          } catch (error) {
            Logger.log(`[CustomSongs] invalid score response: ${error}`);
            finish([]);
          }
        });
      });

      request.on("error", (error) => {
        Logger.log(`[CustomSongs] score request failed: ${error}`);
        finish([]);
      });
      request.write(JSON.stringify({ cinta }));
      request.end();
    } catch (error) {
      Logger.log(`[CustomSongs] could not start score request: ${error}`);
      finish([]);
    }
  });
};

const applySavedScores = async () => {
  try {
    const cinta = fs.readFileSync(Device.documents("user")).toString().trim();
    if (!cinta) {
      Logger.log("[CustomSongs] score restore skipped: user file is empty");
      return;
    }

    Logger.log("[CustomSongs] fetching scores for the current Cinta account");
    const scores = await fetchScores(cinta);
    const scoreById = new Map<number, number>();
    for (const saved of scores) {
      const beatmapId = Number(saved.beatmapId);
      const absoluteScore = Number(saved.absoluteScore);
      if (!Number.isFinite(beatmapId) || !Number.isFinite(absoluteScore)) {
        continue;
      }
      scoreById.set(
        beatmapId,
        Math.max(scoreById.get(beatmapId) || 0, absoluteScore)
      );
    }

    await Il2Cpp.perform(() => {
      const RakshaModel = Il2Cpp.domain.assembly("RakshaModel").image;
      const metalogic = Il2Cpp.domain.assembly("MetaLogic").image;
      const gradingSystem = requireManagedObject(
        Il2Cpp.gc.choose(metalogic.class("GradingSystem")),
        "GradingSystem"
      );
      const gameConfig = gradingSystem.field("gameConfig")
        .value as Il2Cpp.Object;
      const grades = gameConfig.field("Grades").value as Il2Cpp.Array;
      const createScoreFromAbsolute = metalogic
        .class("BeatmapScoreExtensions")
        .method("CreateFromAbsoluteScore");
      const beatmaps = Il2Cpp.gc
        .choose(RakshaModel.class("com.spaceape.flamingo.model.BeatmapTO"))
        .filter((beatmap) => {
          const template = beatmap.field("_template").value as Il2Cpp.Object;
          return (
            template.toString() !== "null" &&
            template.field("idLabel").value.toString().includes("file://")
          );
        });

      let applied = 0;
      for (const beatmap of beatmaps) {
        const template = beatmap.field("_template").value as Il2Cpp.Object;
        const beatmapId = Number(template.field("id").value);
        const absoluteScore = scoreById.get(beatmapId);
        if (absoluteScore === undefined) continue;

        // The song list displays absoluteScore, but its score sorter compares
        // normalizedScore. Let Beatstar create the complete score object so all
        // score consumers see the same restored result.
        const beatmapScore = createScoreFromAbsolute.invoke(
          absoluteScore,
          template,
          gameConfig
        ) as Il2Cpp.Object;
        beatmap.field("HighestScore").value = beatmapScore;

        // Unlocking a custom song creates it with PlayedCount == 0, which the
        // collection UI treats as new. A saved score proves it was played at
        // least once; retain a larger count if this session already has one.
        beatmap.field("PlayedCount").value = Math.max(
          Number(beatmap.field("PlayedCount").value),
          1
        );

        const variant = template.field("_BeatmapVariantReference")
          .value as Il2Cpp.Object;
        const difficulty = variant
          .method("get_Difficulty")
          .invoke() as Il2Cpp.Object;
        let medal = scoreToMedal(
          absoluteScore,
          Number(difficulty.field("id").value)
        );
        if (
          variant.field("BeatmapType").value.toString() === "Promode" &&
          medal.includes("medal")
        ) {
          medal = `deluxe_${medal}`;
        }

        for (let index = 0; index < grades.length; index++) {
          const grade = grades.get(index) as Il2Cpp.Object;
          if (grade.field("idLabel").value.toString().slice(1, -1) === medal) {
            beatmap.method("set_HighestGrade").invoke(grade);
            break;
          }
        }

        applied++;
        Logger.log(
          `[CustomSongs] restored ${beatmapId} score ${absoluteScore}`
        );
      }

      const totalStars = gradingSystem
        .method("CalculateTotalStarsFromSongs")
        .invoke();
      const currencies = requireManagedObject(
        Il2Cpp.gc.choose(metalogic.class("UserCurrencies")),
        "UserCurrencies"
      );
      const starDefinition = currencies
        .method("get_StarCurrencyDefinition")
        .invoke() as Il2Cpp.Object;
      currencies
        .method("Set")
        .overload("com.spaceape.config.CurrencyDefinition", "System.Int32")
        .invoke(starDefinition, totalStars);

      Logger.log(
        `[CustomSongs] score restore complete: ${applied}/${scoreById.size}`
      );
    }, "main");
  } catch (error) {
    Logger.log(`[CustomSongs] score restore failed: ${error}`);
  }
};

export const refreshCustomSongs = async (
  source: "startup" | "support"
): Promise<boolean> => {
  if (loading) {
    Logger.log(`[CustomSongs] ${source} refresh skipped: load already active`);
    return false;
  }

  loading = true;
  const startedAt = Date.now();
  Logger.log(`[CustomSongs] ${source} load started`);

  try {
    const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const RakshaModel = Il2Cpp.domain.assembly("RakshaModel").image;
    const lang = Il2Cpp.domain.assembly("SpaceApe.Lang").image;
    const metalogic = Il2Cpp.domain.assembly("MetaLogic").image;

    const languageConfig = requireManagedObject(
      Il2Cpp.gc.choose(lang.class("com.spaceape.sharedlang.LangConfig")),
      "LangConfig"
    );
    const unlockSongProcess = requireManagedObject(
      Il2Cpp.gc.choose(metalogic.class("UnlockSongProcess")),
      "UnlockSongProcess"
    );
    const userBeatmaps = requireManagedObject(
      Il2Cpp.gc.choose(
        metalogic.class("com.spaceape.flamingo.model.UserBeatmaps")
      ),
      "UserBeatmaps"
    );
    const currentTranslations = languageConfig.field("translations")
      .value as Il2Cpp.Array;
    if (!currentTranslations || currentTranslations.length === 0) {
      throw new Error("LangConfig translations are not ready");
    }
    if (
      appendedTranslationCount > 0 &&
      currentTranslations.length !== lastAssignedTranslationLength
    ) {
      Logger.log(
        "[CustomSongs] language config was replaced; using its full current translation set"
      );
      appendedTranslationCount = 0;
    }
    const baseTranslationCount =
      currentTranslations.length - appendedTranslationCount;
    const locale = (
      (
        (currentTranslations.get(0) as Il2Cpp.Object).field("translations")
          .value as Il2Cpp.Array
      ).get(0) as Il2Cpp.Object
    )
      .field("key")
      .value.toString()
      .slice(1, -1);

    const nextDataCache = new DataCache(RakshaModel);
    setDataCache(nextDataCache);
    const reader = new CustomSongReader(nextDataCache);
    // This reader intentionally stays synchronous. All IL2CPP file access and
    // template creation must finish while this callback is on Unity's thread.
    const nextSongs = reader.readCustomSongsOnDevice();

    if (!bundleHooksInstalled) {
      songNameHack();
      hookOnDeviceBundles();
      hookRemoteBundles();
      ignoreBundleHash();
      bundleHooksInstalled = true;
    }

    setCustomSongs(nextSongs);
    const translations = Il2Cpp.array(
      lang.class("com.spaceape.sharedlang.Translation"),
      baseTranslationCount + customSongs.length * 2
    ) as Il2Cpp.Array;
    for (let index = 0; index < baseTranslationCount; index++) {
      translations.set(index, currentTranslations.get(index));
    }

    let translationIndex = baseTranslationCount;
    const rewardSource = RakshaModel.class(
      "com.spaceape.flamingo.model.BeatmapRewardSource"
    ).field("CardCase").value;
    const transaction = userBeatmaps
      .method("CreateTransaction")
      .invoke(rewardSource) as Il2Cpp.Object;

    for (const song of customSongs) {
      try {
        unlockSongProcess
          .method("Cmd_UnlockSong")
          .invoke(song.template, rewardSource, transaction, transaction);
        const songTemplate = song.template.field("_Song")
          .value as Il2Cpp.Object;
        translations.set(
          translationIndex++,
          new Translation(
            songTemplate
              .field("SongTitleLoc_id")
              .value.toString()
              .slice(1, -1),
            song.title,
            locale
          ).build()
        );
        translations.set(
          translationIndex++,
          new Translation(
            songTemplate
              .field("SongArtistLoc_id")
              .value.toString()
              .slice(1, -1),
            song.artist,
            locale
          ).build()
        );
      } catch (error) {
        Logger.log(`[CustomSongs] failed to add ${song.title}: ${error}`);
      }
    }

    languageConfig.field("translations").value = translations;
    appendedTranslationCount = customSongs.length * 2;
    lastAssignedTranslationLength = translations.length;
    // ClientSongListSearch is constructed before custom songs are registered.
    // Rebuild its native title/artist dictionaries now that both the beatmaps
    // and their translations are available.
    refreshSongSearchCaches(assembly);
    successfulLoadCount++;
    Logger.log(
      `[CustomSongs] ${source} songs loaded: ${customSongs.length} (${Date.now() - startedAt} ms)`
    );
    if (customSongs.length > 0) {
      await applySavedScores();
    } else {
      Logger.log("[CustomSongs] score restore skipped: no custom songs loaded");
    }
    return true;
  } catch (error) {
    Logger.log(
      `[CustomSongs] ${source} load failed after ${Date.now() - startedAt} ms: ${error}`
    );
    return false;
  } finally {
    loading = false;
  }
};

const runStartupLoad = async (attempt: number) => {
  if (successfulLoadCount > 0) {
    Logger.log("[CustomSongs] startup load skipped: songs already refreshed");
    return;
  }

  Logger.log(
    `[CustomSongs] startup readiness attempt ${attempt}/${STARTUP_MAX_ATTEMPTS}`
  );
  let loaded = false;
  try {
    loaded = await Il2Cpp.perform(
      () => refreshCustomSongs("startup"),
      "main"
    );
  } catch (error) {
    Logger.log(`[CustomSongs] startup thread scheduling failed: ${error}`);
  }
  if (loaded || successfulLoadCount > 0) return;

  if (attempt < STARTUP_MAX_ATTEMPTS) {
    Logger.log("[CustomSongs] startup not ready; retry scheduled");
    setTimeout(
      () => void runStartupLoad(attempt + 1),
      STARTUP_RETRY_DELAY_MS
    );
  } else {
    Logger.log(
      "[CustomSongs] startup retries exhausted; Support can retry safely"
    );
  }
};

export const handleCustomSongStartupLog = (message: string) => {
  if (
    startupTriggered ||
    !message.startsWith("Dispatching OnMainMenuActive event")
  ) {
    return;
  }
  startupTriggered = true;
  Logger.log("[CustomSongs] main menu event received; scheduling startup load");
  setTimeout(() => void runStartupLoad(1), STARTUP_DELAY_MS);
};
