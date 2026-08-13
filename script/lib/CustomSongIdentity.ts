export const normalizeCustomSongId = (value: unknown): number => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 0xffffffff) {
    throw new Error(`Invalid custom song id: ${value}`);
  }
  return id;
};

/**
 * Beatstar caches Unity assets by their string id. Older custom templates used
 * the same ids for every song, so chart/audio data from the previous custom
 * song could be reused. Keep the familiar 32-character hexadecimal shape while
 * deriving a stable id from the custom song id and asset kind.
 */
export const customAssetId = (kind: number, songId: number): string => {
  const normalizedId = normalizeCustomSongId(songId) >>> 0;
  return (
    "bc" +
    kind.toString(16).padStart(6, "0") +
    normalizedId.toString(16).padStart(24, "0")
  );
};
