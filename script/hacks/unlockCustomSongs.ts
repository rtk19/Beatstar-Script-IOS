import CustomSongReader from "../lib/CustomSongReader.js";
import DataCache from "../lib/DataCache.js";
import {
  customSongs,
  dataCache,
  scores,
  setCustomSongs,
  setDataCache,
} from "../lib/Globals.js";
import Translation from "../lib/Translation.js";
import Device from "../lib/Device.js";
import Logger from "../lib/Logger.js";
import { activateMod } from "../utilities/activateMod.js";
import { songNameHack } from "./songName.js";
import { hookOnDeviceBundles } from "../customs/hookOnDeviceBundles.js";
import { ignoreBundleHash } from "../customs/ignoreBundleHash.js";
import { hookRemoteBundles } from "../customs/hookRemoteBundles.js";
import { scoreToMedal } from "../lib/Utilities.js";

let hooksInstalled = false;
let loadInProgress: Promise<number> | null = null;
let originalTranslations: Il2Cpp.Object[] | null = null;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const isNull = (value: Il2Cpp.Object | undefined) =>
  !value || value.toString() === "null";

const waitForObject = async (
  image: Il2Cpp.Image,
  className: string,
  timeoutMilliseconds = 300000
) => {
  const deadline = Date.now() + timeoutMilliseconds;
  let attempts = 0;
  while (Date.now() < deadline) {
    const instance = Il2Cpp.gc.choose(image.class(className))[0];
    if (!isNull(instance)) return instance;
    if (++attempts % 20 === 0) {
      Logger.log(`[CustomSongs] Still waiting for ${className}`);
    }
    await sleep(500);
  }
  throw new Error(`${className} was not ready after startup`);
};

const installHooks = () => {
  if (hooksInstalled) return;

  const installHook = (name: string, install: () => void) => {
    try {
      install();
      Logger.log(`[CustomSongs] Installed ${name}`);
      return true;
    } catch (error: any) {
      Logger.log(
        `[CustomSongs] Could not install ${name}: ${
          error?.stack || error?.message || error
        }`
      );
      return false;
    }
  };

  activateMod();
  installHook("song-name fallback", songNameHack);
  installHook("on-device bundle overrides", hookOnDeviceBundles);
  installHook("bundle-hash bypass", ignoreBundleHash);
  installHook("local bundle downloader", hookRemoteBundles);

  const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  installHook("Support-button refresh", () => {
    assembly
      .class("OptionsDialog")
      .method("SupportButtonPressed").implementation = async function () {
      Logger.log("[CustomSongs] Manual refresh requested from Support");
      try {
        const count = await refreshCustomSongs("support button");
        Device.alert(
          `Custom songs refreshed: ${count} song${count === 1 ? "" : "s"}`
        );
      } catch (error) {
        Logger.log(`[CustomSongs] Manual refresh failed: ${error}`);
        Device.alert(`Custom-song refresh failed: ${error}`);
      }
    };
  });

  hooksInstalled = true;
  Logger.log("[CustomSongs] Runtime hooks installed");
};

const getLocale = (translations: Il2Cpp.Array) => {
  try {
    const firstTranslation = translations.get(0) as Il2Cpp.Object;
    const strings = firstTranslation.field("translations").value as Il2Cpp.Array;
    return (strings.get(0) as Il2Cpp.Object)
      .field("key")
      .value.toString()
      .slice(1, -1);
  } catch (_) {
    return "en";
  }
};

const updateTranslations = (
  lang: Il2Cpp.Image,
  langConfig: Il2Cpp.Object,
  locale: string
) => {
  const current = langConfig.field("translations").value as Il2Cpp.Array;
  if (!originalTranslations) {
    originalTranslations = [];
    for (let index = 0; index < current.length; index++) {
      originalTranslations.push(current.get(index) as Il2Cpp.Object);
    }
  }

  const next = Il2Cpp.array(
    lang.class("com.spaceape.sharedlang.Translation"),
    originalTranslations.length + customSongs.length * 2
  ) as Il2Cpp.Array;

  let index = 0;
  for (const translation of originalTranslations) next.set(index++, translation);

  for (const song of customSongs) {
    const songObject = song.template.field("_Song").value as Il2Cpp.Object;
    const titleId = songObject
      .field("SongTitleLoc_id")
      .value.toString()
      .slice(1, -1);
    const artistId = songObject
      .field("SongArtistLoc_id")
      .value.toString()
      .slice(1, -1);
    next.set(index++, new Translation(titleId, song.title, locale).build());
    next.set(index++, new Translation(artistId, song.artist, locale).build());
  }

  langConfig.field("translations").value = next;
};

const registerSongs = (
  RakshaModel: Il2Cpp.Image,
  metalogic: Il2Cpp.Image,
  userBeatmaps: Il2Cpp.Object,
  unlockSongProcess: Il2Cpp.Object
) => {
  const rewardSource = RakshaModel.class(
    "com.spaceape.flamingo.model.BeatmapRewardSource"
  ).field("CardCase").value;
  const transaction = userBeatmaps
    .method("CreateTransaction")
    .invoke(rewardSource) as Il2Cpp.Object;

  const existingById = new Map<number, Il2Cpp.Object>();
  const originalSongIds = new Set<number>();
  for (const beatmap of Il2Cpp.gc.choose(
    RakshaModel.class("com.spaceape.flamingo.model.BeatmapTO")
  )) {
    try {
      const template = beatmap.field("_template").value as Il2Cpp.Object;
      if (!isNull(template)) {
        const songId = Number(template.field("id").value);
        const idLabel = template.field("idLabel").value.toString();
        if (idLabel.includes("file://")) existingById.set(songId, beatmap);
        else originalSongIds.add(songId);
      }
    } catch (_) {}
  }

  for (const song of customSongs) {
    const songId = Number(song.id);
    if (originalSongIds.has(songId)) {
      throw new Error(
        `Custom song id ${songId} conflicts with an original Beatstar song`
      );
    }
    const existing = existingById.get(songId);
    if (existing) {
      existing.field("_template").value = song.template;
      Logger.log(`[CustomSongs] Refreshed existing song ${songId}: ${song.title}`);
      continue;
    }

    unlockSongProcess.method("Cmd_UnlockSong").invoke(
      song.template,
      rewardSource,
      transaction,
      transaction
    );
    Logger.log(`[CustomSongs] Registered new song ${songId}: ${song.title}`);
  }
};

const applyCustomSongScores = () => {
  try {
    const RakshaModel = Il2Cpp.domain.assembly("RakshaModel").image;
    const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const metalogic = Il2Cpp.domain.assembly("MetaLogic").image;
    const root = assembly.class("Config").field("Root").value as Il2Cpp.Object;
    const gradingSystem = Il2Cpp.gc.choose(metalogic.class("GradingSystem"))[0];
    const gameConfig = gradingSystem.field("gameConfig").value as Il2Cpp.Object;
    const grades = gameConfig.field("Grades").value as Il2Cpp.Array;

    const scoreById = new Map<number, number>();
    for (const score of scores) {
      const songId = Number(score.beatmapId);
      scoreById.set(songId, Math.max(scoreById.get(songId) || 0, Number(score.score)));
    }

    let applied = 0;
    for (const beatmap of Il2Cpp.gc.choose(
      RakshaModel.class("com.spaceape.flamingo.model.BeatmapTO")
    )) {
      const template = beatmap.field("_template").value as Il2Cpp.Object;
      if (isNull(template)) continue;

      const songId = Number(template.field("id").value);
      if (!template.field("idLabel").value.toString().includes("file://")) {
        continue;
      }
      const savedScore = scoreById.get(songId);
      if (savedScore === undefined) continue;
      if (!customSongs.some((song) => Number(song.id) === songId)) continue;

      const beatmapScore = RakshaModel.class(
        "com.spaceape.config.BeatmapScore"
      ).alloc();
      beatmapScore.method(".ctor").invoke(root);
      beatmapScore.field("absoluteScore").value = savedScore;
      beatmap.field("HighestScore").value = beatmapScore;

      const variant = template.field("_BeatmapVariantReference")
        .value as Il2Cpp.Object;
      const difficultyId = Number(
        (variant.method("get_Difficulty").invoke() as Il2Cpp.Object).field("id")
          .value
      );
      let medal = scoreToMedal(savedScore, difficultyId);
      if (
        variant.field("BeatmapType").value.toString().toLowerCase().includes("pro") &&
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
    }

    const newStarCount = gradingSystem
      .method("CalculateTotalStarsFromSongs")
      .invoke() as Il2Cpp.Object;
    const currencies = Il2Cpp.gc.choose(metalogic.class("UserCurrencies"))[0];
    if (!isNull(currencies)) {
      const starDefinition = currencies
        .method("get_StarCurrencyDefinition")
        .invoke() as Il2Cpp.Object;
      currencies
        .method("Set")
        .overload("com.spaceape.config.CurrencyDefinition", "System.Int32")
        .invoke(starDefinition, newStarCount);
    }
    Logger.log(`[CustomSongs] Restored ${applied} saved custom-song scores`);
  } catch (error) {
    Logger.log(`[CustomSongs] Failed to restore scores: ${error}`);
  }
};

const refreshCustomSongs = async (
  reason: string,
  onRuntimeReady?: () => void
): Promise<number> => {
  if (loadInProgress) return loadInProgress;

  loadInProgress = (async () => {
    Logger.log(`[CustomSongs] Loading songs (${reason})`);
    const RakshaModel = Il2Cpp.domain.assembly("RakshaModel").image;
    const lang = Il2Cpp.domain.assembly("SpaceApe.Lang").image;
    const metalogic = Il2Cpp.domain.assembly("MetaLogic").image;

    const [langConfig, unlockSongProcess, userBeatmaps] = await Promise.all([
      waitForObject(lang, "com.spaceape.sharedlang.LangConfig"),
      waitForObject(metalogic, "UnlockSongProcess"),
      waitForObject(metalogic, "com.spaceape.flamingo.model.UserBeatmaps"),
    ]);

    Logger.log("[CustomSongs] Main song model is ready");
    onRuntimeReady?.();

    if (!dataCache) setDataCache(new DataCache(RakshaModel));
    const reader = new CustomSongReader(dataCache);
    setCustomSongs(await reader.readCustomSongsOnDevice());

    const translations = langConfig.field("translations").value as Il2Cpp.Array;
    updateTranslations(lang, langConfig, getLocale(translations));
    registerSongs(RakshaModel, metalogic, userBeatmaps, unlockSongProcess);
    applyCustomSongScores();

    Logger.log(`[CustomSongs] Loaded ${customSongs.length} songs (${reason})`);
    return customSongs.length;
  })();

  try {
    return await loadInProgress;
  } finally {
    loadInProgress = null;
  }
};

export const unlockCustomSongs = async (onRuntimeReady?: () => void) => {
  installHooks();
  return refreshCustomSongs("app startup", onRuntimeReady);
};

export const prepareCustomSongs = () => {
  installHooks();
};
