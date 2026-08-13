# Beatclone iOS minimal rework

This tree starts from `origin/private-server-frida-16`, the source version that
matches the working original IPA log.

The original IPA bootstrap remains the runtime entry point. Its compiled file
is changed only to prefer `Frameworks/beatclone-device.payload`, falling back
to the downloaded `Documents/script/script.js`. Manual `override.js` behavior
is unchanged.

The bootstrap's startup decision is now synchronized with its IL2CPP loader.
Previously, the loader could observe an uninitialised decision and silently do
nothing. The bundled payload is also selected locally rather than waiting on
the remote iOS-version request, whose missing error/timeout path could leave
startup pending forever. This makes installing a matching IPA self-contained;
manual `override.js` remains the only local override path.

Device payload changes are limited to:

- automatic custom-song loading after the real
  `Dispatching OnMainMenuActive event`, with a short bounded readiness retry
  window and no managed-heap polling during login;
- lifecycle-safe refresh state: Unity/IL2CPP objects are reacquired on every
  attempt, startup and Support loads cannot overlap, and a failed attempt does
  not poison later retries;
- automatic attempts are scheduled on Beatstar's main IL2CPP thread, and the
  managed song-building phase has no asynchronous thread boundary;
- saved scores are also applied on the main IL2CPP thread after their network
  response returns;
- custom songs receive both a unique `audioAsset_id` reference and a unique
  `MusicFileSourceID`; previously only the nested audio object was unique while
  Beatstar's reference and playback cache keys remained empty/zero;
- audio and chart bundles modified by the discarded identity experiments are
  restored to the original `TST00026` bank name, bank/media IDs, internal path,
  switch state, and chart `508` identity. V14 confirmed that the shared Wwise
  playback contract requires the complete original audio identity;
- before a consecutive custom song reuses `TST00026`, the existing bundle hook
  posts a captured regular-song switch, processes it, and unloads the outgoing
  song through `MusicPlayerData.Unload`. This reproduces the working regular-to-
  custom Wwise state edge without calling `StopCurrentMusic`, so Beatstar's
  persistent music-system event and normal `PlayNextMusic` flow remain alive;
- a ten-second score-request timeout so a network problem cannot leave the
  custom-song refresh permanently busy;
- restoring scores with the Android payload's proven request contract:
  `POST http://beatstarmod.app:4000/scores` with the Cinta ID from `user`, then
  rebuilding Beatstar's complete absolute/normalized score model, marking a
  scored song as played, and applying its grade and recalculated stars;
- rebuilding Beatstar's native title/artist search cache after custom songs and
  their translations are registered, so custom songs participate in normal
  song-list search without replacing the search algorithm;
- unique per-song variant and asset identifiers to prevent cross-song caching;
- Support button refresh using the same loader.

Build the encrypted device payload from `script/` with:

    node build.js -prod

The resulting `script.js` is stored in the IPA as
`Frameworks/beatclone-device.payload`.
