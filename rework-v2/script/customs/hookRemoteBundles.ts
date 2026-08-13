import Logger from "../lib/Logger.js";

// Custom songs all use the same Wwise music switch state (TST00026) and the
// same internal Wwise bank/media IDs. Keep a real regular-song switch around
// so a custom -> custom transition can leave TST00026 before the old bank is
// unloaded and the replacement bank is loaded under that same identity.
let regularMusicSwitch: Il2Cpp.Object | null = null;

const finishCurrentCustomMusic = () => {
  try {
    const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const players = Il2Cpp.gc.choose(
      assembly.class("BeatStar.WwiseApeAudio.MusicPlayer")
    );
    const player = players[0];
    if (!player || player.toString() === "null") return;

    const current = player.field("currentPlayingMusic").value as Il2Cpp.Object;
    if (!current || current.toString() === "null") return;
    const song = current.field("songTemplate").value as Il2Cpp.Object;
    if (!song || song.toString() === "null") return;
    const label = song.field("idLabel").value.toString();

    if (!label.includes("file://")) {
      const songSwitch = song.field("WwiseSwitch").value as Il2Cpp.Object;
      if (songSwitch && songSwitch.toString() !== "null") {
        regularMusicSwitch = songSwitch;
        Logger.log(
          `[CustomSongTransition] Captured regular-song switch: song=${label}, group=${songSwitch.field("switchId").value}, state=${songSwitch.field("switchState").value}`
        );
      }
      return;
    }

    if (!regularMusicSwitch || regularMusicSwitch.toString() === "null") {
      throw new Error(
        "No regular-song switch has been captured; refusing an unproven shared-bank reset"
      );
    }

    const audioAsset = song.field("_audioAsset").value as Il2Cpp.Object;
    const loader = player.field("audioBankLoader").value as Il2Cpp.Object;
    const banks = loader.field("banksById").value as Il2Cpp.Object;
    const assetId = audioAsset.field("id").value as Il2Cpp.String;
    const bank = banks.method("get_Item").invoke(assetId) as Il2Cpp.Object;
    const pinnedHandleAddress = bank.handle.add(
      bank.class.field("ms_pinnedArray").offset
    );

    const apeAudio = player.field("apeAudio").value as Il2Cpp.Object;
    const resetGroup = regularMusicSwitch.field("switchId").value;
    const resetState = regularMusicSwitch.field("switchState").value;
    const startedBefore = player.field("started").value;
    const playingIdBefore = player.field("musicSystemPlayingId").value;

    Logger.log(
      `[CustomSongTransition] Leaving TST00026 through captured regular switch: group=${resetGroup}, state=${resetState}, currentLoadState=${current.field("loadingState").value}, bankLoadState=${bank.field("loadState").value}, refCount=${bank.field("refCount").value}, started=${startedBefore}, playingId=${playingIdBefore}`
    );

    // Reproduce the proven regular -> custom switch edge without stopping the
    // persistent music event. Merely reposting TST00026 cannot retrigger a
    // Wwise switch whose state has not changed.
    apeAudio.method("PostSwitch").invoke(regularMusicSwitch, NULL);
    const akSoundEngine = Il2Cpp.domain
      .assembly("AK.Wwise.Unity.API")
      .image.class("AkSoundEngine");
    const renderResult = akSoundEngine.method("RenderAudio").invoke();

    // The next custom bank has the same internal Wwise bank ID as this one, so
    // the old bank must be gone before the new bundle reaches Wwise. Use the
    // owning MusicPlayerData's normal unload method; it also marks itself
    // unloaded, making PlayNextMusic's later cleanup a safe no-op.
    current.method("Unload").invoke();
    const released = pinnedHandleAddress.readPointer().isNull();
    const cleanupResult = akSoundEngine.method("RenderAudio").invoke();
    Logger.log(
      `[CustomSongTransition] Shared-bank handoff complete: released=${released}, currentLoadState=${current.field("loadingState").value}, bankLoadState=${bank.field("loadState").value}, refCount=${bank.field("refCount").value}, render=${renderResult}, cleanup=${cleanupResult}, currentPreserved=${player.field("currentPlayingMusic").value.toString() !== "null"}, nextPreserved=${player.field("nextPlayingMusic").value.toString() !== "null"}, started=${player.field("started").value}, playingId=${player.field("musicSystemPlayingId").value}`
    );
  } catch (error) {
    Logger.log(`[CustomSongTransition] TST00026 handoff failed: ${error}`);
  }
};

export const hookRemoteBundles = () => {
  const assembly = Il2Cpp.domain.assembly("SpaceApe.UnityAssets").image;

  assembly
    .class("com.spaceape.assetstreaming.AssetBundleDownloader")
    .method("DownloadRemoteBundle").implementation = function (
    bundle: any,
    url: Il2Cpp.String,
    onComplete: any
  ) {
    const originalUrl = url.toString();
    const isCustomBundle =
      originalUrl.includes("file") &&
      (originalUrl.includes("audio.bundle") ||
        originalUrl.includes("artwork.bundle") ||
        originalUrl.includes("chart.bundle"));

    if (isCustomBundle) {
      if (originalUrl.includes("audio.bundle")) finishCurrentCustomMusic();
      const path = originalUrl
        .substring(
          originalUrl.indexOf("file"),
          originalUrl.indexOf(".bundle") + 7
        )
        .replace(/\s+/g, "_");

      url = Il2Cpp.string(path);
    }

    return this.method("DownloadRemoteBundle").invoke(bundle, url, onComplete);
  };
};
