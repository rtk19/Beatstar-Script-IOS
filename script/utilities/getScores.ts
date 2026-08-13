import Device from "../lib/Device.js";
import { setScores } from "../lib/Globals.js";
import Logger from "../lib/Logger.js";
import { networkRequest } from "../lib/Utilities.js";

export interface Score {
  beatmapId: number;
  score: number;
}

export const getScores = () => {
  return new Promise<Score[]>(async function (resolve, reject) {
    try {
      const scores = (await networkRequest("/getScores", {
        androidId: Device.getDeviceID(),
      })) as string;

      Logger.log(`Scores: ${scores}`);
      const parsedScores = JSON.parse(scores);
      if (!Array.isArray(parsedScores)) {
        throw new Error("Score server returned a non-array response");
      }

      const bestScoresByBeatmap = new Map<number, number>();
      for (const entry of parsedScores) {
        const beatmapId = Number(entry.beatmapId);
        const score = Number(entry.score);
        if (!Number.isFinite(beatmapId) || !Number.isFinite(score)) continue;
        bestScoresByBeatmap.set(
          beatmapId,
          Math.max(bestScoresByBeatmap.get(beatmapId) || 0, score)
        );
      }

      const normalizedScores = Array.from(bestScoresByBeatmap.entries()).map(
        ([beatmapId, score]) => ({ beatmapId, score })
      );
      setScores(normalizedScores);
      resolve(normalizedScores);
    } catch (e: any) {
      Logger.log(`Error fetching scores: ${e}`);
      resolve([]);
    }
  });
};
