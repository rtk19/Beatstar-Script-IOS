import { getStatus } from "../functions/autoplay.js";
import { networkRequest } from "../lib/Utilities.js";
import Device from "../lib/Device.js";
import Logger from "../lib/Logger.js";
import { upsertScore } from "../lib/Globals.js";
//import { writeScores } from "../utilities/getScores.js";

export const saveScores = () => {
  const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  const mscorlib = Il2Cpp.domain.assembly("mscorlib").image;

  assembly
    .class("BeatStarRhythmGameFlowListener")
    .method("HandleResultsComplete").implementation = function (result: any) {
    const score = result.field("Score").value as Il2Cpp.Object;
    const gameResult = result.field("GameResult").value as Il2Cpp.Object;
    const beatmap = gameResult.field("Beatmap").value as Il2Cpp.Object;
    const beatmapId = Number(beatmap.field("id").value);
    let scoreCounts = gameResult.field("ScoreTypeCounts")
      .value as Il2Cpp.Object;
    const SystemInt32 = mscorlib.class("System.Int32");

    const values = scoreCounts.method("get_Values").invoke() as Il2Cpp.Object;
    const count = values.method("get_Count").invoke() as number;
    const array = Il2Cpp.array(SystemInt32, count);
    values.method("CopyTo").invoke(array, 0);

    //don't send custom scores to database
    let shouldSave = getStatus() === "Autoplay enabled" ? false : true;

    const absoluteScore = score.field("absoluteScore").value as number;

    if (shouldSave) {
      upsertScore({ beatmapId, score: absoluteScore });
      networkRequest("/saveScore", {
        androidId: Device.getDeviceID(),
        score: absoluteScore,
        beatmapId,
      }).catch((error: Error) => {
        Logger.log(`[saveScores] Failed to upload score: ${error.message}`);
      });
    }

    return this.method("HandleResultsComplete").invoke(result);
  };
};
