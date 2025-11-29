import CustomSongReader from "../lib/CustomSongReader.js";
import DataCache from "../lib/DataCache.js";
import {
  customSongs,
  setDataCache,
  setCustomSongs,
  dataCache,
} from "../lib/Globals.js";
import { songNameHack } from "./songName.js";
import { hookOnDeviceBundles } from "../customs/hookOnDeviceBundles.js";
import { ignoreBundleHash } from "../customs/ignoreBundleHash.js";
import { hookRemoteBundles } from "../customs/hookRemoteBundles.js";
import Translation from "../lib/Translation.js";
import Logger from "../lib/Logger.js";

export const hookSupportButton = async () => {
  Logger.log("[unlockCustomSongs] Setting up custom songs hook...");

  const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;

  assembly
    .class("OptionsDialog")
    .method("SupportButtonPressed").implementation = async function () {
    Logger.log("[SupportButtonPressed] Support button pressed");

    try {
      const RakshaModel = Il2Cpp.domain.assembly("RakshaModel").image;
      const lang = Il2Cpp.domain.assembly("SpaceApe.Lang").image;
      const metalogic = Il2Cpp.domain.assembly("MetaLogic").image;
      Logger.log("[SupportButtonPressed] Assemblies loaded");

      setDataCache(new DataCache(RakshaModel));
      Logger.log("[SupportButtonPressed] DataCache initialized");

      songNameHack();
      Logger.log("[SupportButtonPressed] Song names hacked");

      hookOnDeviceBundles();
      hookRemoteBundles();
      ignoreBundleHash();
      Logger.log("[SupportButtonPressed] Bundles hooked");

      const translations = Il2Cpp.gc.choose(
        lang.class("com.spaceape.sharedlang.LangConfig")
      )[0];

      const tr = translations.field("translations").value as Il2Cpp.Array;
      const locale = (
        (
          (tr.get(0) as Il2Cpp.Object).field("translations")
            .value as Il2Cpp.Array
        ).get(0) as Il2Cpp.Object
      )
        .field("key")
        .value.toString()
        .slice(1, -1);
      Logger.log(`[SupportButtonPressed] Locale: ${locale}`);

      let reader = new CustomSongReader(dataCache);
      setCustomSongs(await reader.readCustomSongsOnDevice());
      Logger.log(
        `[SupportButtonPressed] Loaded ${customSongs.length} custom songs`
      );

      const newLength = tr.length + customSongs.length * 2;
      const newTranslations = Il2Cpp.array(
        lang.class("com.spaceape.sharedlang.Translation"),
        newLength
      ) as Il2Cpp.Array;

      for (var i = 0; i < tr.length; i++) {
        newTranslations.set(i, tr.get(i));
      }

      let index = tr.length;
      Logger.log("[SupportButtonPressed] Preparing to unlock songs");

      let unlockSongProcess = Il2Cpp.gc.choose(
        metalogic.class("UnlockSongProcess")
      )[0];
      let userBeatmaps = Il2Cpp.gc.choose(
        metalogic.class("com.spaceape.flamingo.model.UserBeatmaps")
      )[0];
      let transaction = userBeatmaps
        .method("CreateTransaction")
        .invoke(
          RakshaModel.class(
            "com.spaceape.flamingo.model.BeatmapRewardSource"
          ).field("CardCase").value
        ) as Il2Cpp.Object;

      const promises: Promise<void>[] = [];

      for (var x = 0; x < customSongs.length; x++) {
        Logger.log(
          `[SupportButtonPressed] Processing song ${x + 1}/${
            customSongs.length
          }: ${customSongs[x].title}`
        );
        promises.push(
          new Promise((resolve, reject) => {
            try {
              unlockSongProcess
                .method("Cmd_UnlockSong")
                .invoke(
                  customSongs[x].template,
                  RakshaModel.class(
                    "com.spaceape.flamingo.model.BeatmapRewardSource"
                  ).field("CardCase").value,
                  transaction,
                  transaction
                );

              const nameTranslation = new Translation(
                customSongs[x].template
                  .field("_Song")
                  .value.field("SongTitleLoc_id")
                  .value.toString()
                  .slice(1, -1),
                customSongs[x].title,
                locale
              );
              const artistTranslation = new Translation(
                customSongs[x].template
                  .field("_Song")
                  .value.field("SongArtistLoc_id")
                  .value.toString()
                  .slice(1, -1),
                customSongs[x].artist,
                locale
              );

              newTranslations.set(index++, nameTranslation.build());
              newTranslations.set(index++, artistTranslation.build());
              Logger.log(
                `[SupportButtonPressed] Successfully processed: ${customSongs[x].title}`
              );
              resolve();
            } catch (err) {
              Logger.log(
                `[SupportButtonPressed] Error processing song: ${customSongs[x].title}`,
                err
              );
              resolve(); // Still resolve to continue with other songs
            }
          })
        );
      }

      await Promise.all(promises);
      Logger.log("[SupportButtonPressed] All songs processed");

      translations.field("translations").value = newTranslations;
      Logger.log("[SupportButtonPressed] Translations updated");

      //applyCustomSongScores();
      Logger.log(
        "[SupportButtonPressed] Custom songs hook completed successfully"
      );
    } catch (e) {
      Logger.log("[SupportButtonPressed] Error in setup:", e);
      Logger.log("[SupportButtonPressed] Stack trace:", e.stack);
    }
  };
};

/*const applyCustomSongScores = () => {
  try {
    Logger.log("[applyCustomSongScores] Starting to apply custom song scores...");
    
    const RakshaModel = Il2Cpp.domain.assembly("RakshaModel").image;
    const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const metalogic = Il2Cpp.domain.assembly("MetaLogic").image;
    
    const root = assembly.class("Config").field("Root").value as Il2Cpp.Object;

    const gradingSystem = Il2Cpp.gc.choose(metalogic.class("GradingSystem"))[0];
    if (!gradingSystem) {
      throw new Error("GradingSystem not found");
    }

    const gameConfig = gradingSystem.field("gameConfig").value as Il2Cpp.Object;
    const grades = gameConfig.field("Grades").value as Il2Cpp.Array;

    const beatmaps = Il2Cpp.gc
      .choose(RakshaModel.class("com.spaceape.flamingo.model.BeatmapTO"))
      .filter(function (beatmap) {
        const template = beatmap.field("_template").value as Il2Cpp.Object;
        if (template.toString() == "null") {
          return false;
        }
        const idLabel = template.field("idLabel").value;
        return idLabel.toString().includes("file://");
      });
    Logger.log(`[applyCustomSongScores] Found ${beatmaps.length} custom beatmaps`);

    for (const score of scores) {
      const beatmap = beatmaps.find((beatmap) => {
        const template = beatmap.field("_template").value as Il2Cpp.Object;
        if (template.field("id").value === score.beatmapId) {
          return true;
        }
      }) as Il2Cpp.Object;
      
      if (!beatmap) {
        Logger.log(`[applyCustomSongScores] WARNING: Beatmap not found for id ${score.beatmapId}`);
        continue;
      }
      
      try {
        const BeatmapScore = RakshaModel.class(
          "com.spaceape.config.BeatmapScore"
        ).alloc();
        BeatmapScore.method(".ctor").invoke(root);
        BeatmapScore.field("absoluteScore").value = score.score;
        beatmap.field("HighestScore").value = BeatmapScore;

        const template = beatmap.field("_template").value as Il2Cpp.Object;
        let variant = template.field("_BeatmapVariantReference").value as Il2Cpp.Object;

        const difficultyId = (
          variant.method("get_Difficulty").invoke() as Il2Cpp.Object
        ).field("id").value;

        let medal = scoreToMedal(score.score, difficultyId as number);

        if (
          variant.field("BeatmapType").value.toString() == "Promode" &&
          medal.includes("medal")
        ) {
          medal = "deluxe_" + medal;
        }

        let medalFound = false;
        for (var i = 0; i < 11; i++) {
          const grade = grades.get(i) as Il2Cpp.Object;
          const idLabel = grade.field("idLabel").value;
          if (idLabel.toString().slice(1, -1) === medal) {
            beatmap.method("set_HighestGrade").invoke(grade);
            medalFound = true;
            break;
          }
        }
        
        if (!medalFound) {
          Logger.log(`[applyCustomSongScores] WARNING: Medal ${medal} not found in grades`);
        }

      } catch (err) {
        Logger.log(`[applyCustomSongScores] Error applying score for beatmap ${score.beatmapId}: ${err.message}`);
        Logger.log(err.stack);
      }
    }

    const newStarCount = gradingSystem
      .method("CalculateTotalStarsFromSongs")
      .invoke() as Il2Cpp.Object;

    let currencies = Il2Cpp.gc.choose(metalogic.class("UserCurrencies"))[0];
    if (!currencies) {
      throw new Error("UserCurrencies not found");
    }
    
    let starDefinition = currencies
      .method("get_StarCurrencyDefinition")
      .invoke() as Il2Cpp.Object;
    
    currencies
      .method("Set")
      .overload("com.spaceape.config.CurrencyDefinition", "System.Int32")
      .invoke(starDefinition, newStarCount);
    
    Logger.log("[applyCustomSongScores] Custom song scores applied successfully");

  } catch (error) {
    Logger.log(`[applyCustomSongScores] CRITICAL ERROR: ${error.message}`);
    Logger.log(`[applyCustomSongScores] Stack trace: ${error.stack}`);
  }
};*/
