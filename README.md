# Beatclone Script for iOS

This is a community-maintained fork of
[ExternalAddress4401/Beatstar-Script-IOS](https://github.com/ExternalAddress4401/Beatstar-Script-IOS).
It contains the iOS Beatclone script work and the v25 minimal rework for
Beatstar 36.1.4.

## Install v25

Follow the complete [Beatclone iOS installation
instructions](https://beatclone.com/install/), with one important change:
when the instructions tell you to download the IPA, download the newest IPA
attached to this repository's **Releases** page instead. For this release,
choose `Beatclone-36.1.4-minimal-rework-v25.ipa` from the **v25** release.

Do not use an older IPA linked from the installation page. Continue with the
remaining instructions there, including AltStore installation, the exact
`user` filename, and the asset archive import.

## v25 source

The source used for the v25 IPA is in [`rework-v2`](rework-v2). It starts from
the upstream `private-server-frida-16` implementation and keeps the original
working bootstrap/playback contract while applying the focused reliability,
custom-song, search, and score-restoration fixes documented in
[`CHANGELOG.md`](CHANGELOG.md).

The root `script` directory records the earlier self-contained bootstrap
approach developed during the same investigation. It is retained for reference
and is not the source of the attached v25 release IPA.

## Development and rebuilding

The following information applies to the root experimental implementation.
For the exact v25 architecture and build notes, see
[`rework-v2/README-REWORK.md`](rework-v2/README-REWORK.md).

This root implementation builds the Frida scripts used by Beatclone and can
repack an existing decrypted, instrumented Beatclone 36.1.4 IPA for
installation through AltStore Classic.

The repository does not contain Beatstar. A normal App Store IPA is encrypted
and cannot be patched directly. The repack command requires an IPA whose main
executable and `UnityFramework` are already decrypted and whose app executable
already loads `FridaGadget.dylib`.

## Runtime design

`script/agent/packaged.ts` is the self-contained bootstrap embedded in the IPA.
It creates the writable folders and includes the game payload in the same
JavaScript bundle. Keeping a single IL2CPP bridge instance prevents a late
second bridge from missing Unity's initialization event. Packaged builds do not
download or execute cached scripts from Documents.

`script/device/device.ts` is the main mod payload. It initializes the Unity
IL2CPP hooks, unlocks normal and custom songs, loads saved scores, fixes custom
song lengths, applies graphics settings, and displays the `mod loaded` alert.

Every rebuilt IPA also contains an encoded `fallback.js` for diagnostic and
development use, although packaged installs execute the self-contained
`script.js`. Score network operations time out after eight seconds and failures
are written to `Documents/log.txt`.

Custom songs are scanned and registered automatically during startup. The
Support button performs the same scan again, so it can be used to load songs
copied into `Documents/songs` while the app is running. Custom song IDs must be
unique positive integers; duplicate IDs are rejected and recorded in the log.

Frida Gadget is configured with `code_signing: required`. The included
`UnityFramework` was pre-instrumented with gum-graft at the method offsets for
Beatstar 36.1.4. The offsets in `out.txt` must be regenerated for another game
version.

## Rebuild the shareable IPA

Requirements:

- macOS
- Node.js and npm
- A decrypted, already-instrumented Beatclone 36.1.4 IPA

Place the source IPA at `beatclone-ipa/Beatclone.ipa`, then run:

```sh
./beatclone repack
```

The result is:

```text
dist/Beatclone-36.1.4-updated.ipa
```

To select different paths:

```sh
./beatclone repack path/to/source.ipa path/to/output.ipa
```

The repacker:

1. Builds the bootstrap and bundled fallback payload.
2. Verifies that the source executable is decrypted.
3. Replaces `Frameworks/script.js` and adds `Frameworks/fallback.js`.
4. Enables access to the app's Documents folder in Files.
5. Removes the source developer's expired/device-specific provisioning profile.
6. Applies an ad-hoc integrity signature and verifies the app bundle.
7. Creates an IPA for AltStore to re-sign for the destination device.

Do not distribute a provisioning profile or a personally signed development
IPA. Each recipient should let AltStore sign the IPA with their own Apple
account. Do not distribute Beatstar or its assets unless you have permission
from the relevant rights holders.

## Manual installation reference

The maintained installation instructions are at
[beatclone.com/install](https://beatclone.com/install/). The summary below is
provided only as a reference; use the website for the complete process and use
the latest IPA from this repository's Releases page.

1. Install AltStore Classic and AltServer on the computer.
2. Connect the iPhone to the computer and ensure AltServer can see it.
3. Copy `Beatclone-36.1.4-updated.ipa` to the iPhone.
4. In Files, long-press the IPA and choose **Share > AltStore**. Alternatively,
   open AltStore's **My Apps** tab, press **+**, and select the IPA.
5. Open Beatclone and wait for `mod loaded`. The same message reports how many
   custom songs were found and how many saved scores were downloaded.
6. The first launch creates the Beatclone Documents container visible under
   **Files > On My iPhone > Beatclone**.
7. Put the account file in this folder with the exact filename `user`, with no
   `.txt`, `.bin`, or other extension.

AltStore installations made with a free Apple account normally need to be
refreshed every seven days.

## Install the asset archive

The 1.2 GB asset archive remains separate from the IPA. Keeping it separate
avoids storing a second copy of every asset inside the read-only app bundle.

1. Extract `asset-archive/iosarchive.zip` on the computer.
2. Connect the device and open its application file browser (for example,
   3uTools on Windows or another tool that can browse an app's data container).
3. Import `UnityCache` into Beatclone's `Library` folder.
4. Import `streamableemojis` and `streamedimages` into Beatclone's `Documents`
   folder. Preserve the archive's exact folder names unless the payload/server
   release specifies different capitalization.
5. Import the account file into `Documents` and ensure its name is exactly
   `user`.
6. Disconnect and restart the device, then open Beatclone.

If the game reports error 110 before `mod loaded`, fully close and reopen it.
The updated bootstrap does not wait for or download a script from the update
server. A persistent error should be diagnosed using `Documents/log.txt`.

## Security note

The legacy account and score server uses unencrypted HTTP. The bundled script's
XOR/base64 transformation is only encoding, not encryption or authentication.
For public distribution, the server should move to HTTPS and authenticate its
requests and responses.
