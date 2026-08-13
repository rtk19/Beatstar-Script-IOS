# Changelog

This changelog covers the changes made in this fork after
`ExternalAddress4401/Beatstar-Script-IOS`.

## v25 - 2026-08-13

### Startup and packaging

- Based the release on the upstream `private-server-frida-16` implementation
  that matches the known-working original iOS IPA.
- Kept the original IPA bootstrap and made it prefer a version-matched payload
  bundled in the app, while preserving the downloaded-script fallback and
  manual `override.js` development path.
- Synchronized the bootstrap startup decision with the IL2CPP loader so the
  payload cannot silently miss startup because its decision was still unset.
- Removed the blocking dependency on the remote iOS version check. A missing or
  unavailable version server can no longer leave startup waiting forever.
- Kept the release self-contained: v25 starts with its bundled payload and does
  not need to download a replacement script before the mod can load.

### Custom-song loading and refresh

- Added automatic custom-song loading after Beatstar dispatches the real
  `OnMainMenuActive` event.
- Added a short, bounded startup readiness retry window instead of polling the
  managed heap throughout login.
- Scheduled automatic attempts on Beatstar's main IL2CPP thread and kept the
  managed song-building phase synchronous on that thread.
- Made refresh state lifecycle-safe: runtime objects are reacquired for each
  attempt, startup and Support-button refreshes cannot overlap, and a failed
  attempt does not block later retries.
- Made the Support button run the same refresh path, allowing songs copied
  while the app is open to be loaded safely.
- Rebuilt Beatstar's native title/artist search cache after songs and
  translations are registered, so custom songs appear in the normal search.

### Consecutive custom-song playback

- Preserved the shared `TST00026` Wwise bank name, bank/media identifiers,
  internal bundle path, switch state, and chart identity required by the
  original working playback contract.
- Added unique per-song Beatstar variant/asset references and a unique
  `MusicFileSourceID`, preventing the game from confusing cached data between
  custom songs without breaking the shared Wwise bank contract.
- Added a transition reset before another custom song reuses `TST00026`: v25
  posts a captured regular-song switch, processes it, and unloads the outgoing
  song through `MusicPlayerData.Unload`.
- Avoided `StopCurrentMusic`, preserving Beatstar's persistent music-system
  event and normal `PlayNextMusic` flow.
- Restored audio and chart bundle values changed during earlier identity
  experiments after testing showed that those values must remain compatible
  with the original custom-song format.

### Scores, search, and runtime reliability

- Restored scores using the proven private-server request contract: the Cinta
  ID from the exact `user` file is posted to the score service.
- Added a 10-second score request timeout so an unavailable network cannot
  leave custom-song refresh permanently busy.
- Applied score results back on the main IL2CPP thread.
- Rebuilt Beatstar's full score model from each absolute score, including its
  normalized score, played state, grade/medal, and recalculated star total.
- Added clearer diagnostic logging around startup, refresh, score restoration,
  bundle handling, playback transitions, and recoverable failures.
- Hardened optional hooks so a missing version-specific method does not prevent
  the rest of the mod from loading.

### Earlier investigation retained in the repository

- Added a root-level self-contained packaged bootstrap experiment that keeps a
  single `frida-il2cpp-bridge` instance from early startup through Unity
  initialization.
- Added local IPA repacking support, ad-hoc integrity signing, provisioning
  profile removal, Files document sharing, and source-IPA safety checks.
- Added network timeouts/status handling, normalized score caching, duplicate
  and invalid custom-song ID checks, stable asset identifiers, background song
  loading, loading UI, and timestamped logs to that experimental path.
- Kept these files for technical reference; the attached v25 IPA was built from
  `rework-v2`, which is the tested minimal implementation described above.

### Release artifact

- Removed the embedded provisioning profile and re-signed the app ad hoc so the
  public IPA does not redistribute signer/device provisioning data. AltStore
  supplies the recipient's own signature during installation.
- File: `Beatclone-36.1.4-minimal-rework-v25.ipa`
- SHA-256: `bd3a4fb779567477a3ddec1352b16e274a69ef17d5a49a7be242bcc5798352da`

## Upstream history

For changes before this fork, see the
[upstream repository](https://github.com/ExternalAddress4401/Beatstar-Script-IOS)
and its branch history.
