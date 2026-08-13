import { Score } from "../utilities/getScores.js";
import DataCache from "./DataCache.js";

let customSongs: any[] = [];
let lastNote: any = null;
let dataCache: DataCache;
let scores: Score[] = [];
let offline: boolean = false;

const setLastNote = (value: any) => {
  lastNote = value;
};

const setCustomSongs = (value: any) => {
  customSongs = value;
};

const setDataCache = (value: DataCache) => {
  dataCache = value;
};

const setScores = (value: Score[]) => {
  scores = Array.isArray(value) ? value : [];
};

const upsertScore = (value: Score) => {
  const beatmapId = Number(value.beatmapId);
  const score = Number(value.score);
  if (!Number.isFinite(beatmapId) || !Number.isFinite(score)) return;

  const existing = scores.find(
    (candidate) => Number(candidate.beatmapId) === beatmapId
  );
  if (existing) {
    existing.score = Math.max(Number(existing.score) || 0, score);
    existing.beatmapId = beatmapId;
  } else {
    scores.push({ beatmapId, score });
  }
};

const setOffline = (value: boolean) => {
  offline = value;
};

export {
  customSongs,
  lastNote,
  dataCache,
  scores,
  offline,
  setLastNote,
  setCustomSongs,
  setDataCache,
  setScores,
  upsertScore,
  setOffline,
};
