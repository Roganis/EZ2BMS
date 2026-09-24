# Releasing EZ2BMS

A release is built by `.github/workflows/release.yml` when a tag like
`v0.2.0` is pushed. It builds the Windows installer (NSIS) and the Linux
AppImage and `.deb`, and attaches them to a **draft** release to check and
publish by hand. The app updates itself from the newest **published**
release of this repository (not drafts, not pre-releases).

## Once: before the first release that updates

1. **Make the repository public.** The app downloads updates from its
   releases without a token, which only works on a public repository.
   Before you do, run `node scripts/public-check.mjs`: it looks through every
   commit on every branch for the game's files, executables, private keys
   and tokens, and lists the names and addresses the commits carry. It must
   end with "Must not be published (0)".
2. **Make the update key pair.** On your own machine:

   ```sh
   pnpm tauri signer generate -w ~/.tauri/ez2bms.key
   ```

   Keep `~/.tauri/ez2bms.key` and its password safe and private: whoever has
   it can make updates every installed EZ2BMS accepts. If it is lost, the
   installed apps cannot be updated any more (each must be reinstalled by
   hand with a new key).

3. **Give it to the workflow** (repository Settings → Secrets and variables
   → Actions):
   - secret `TAURI_SIGNING_PRIVATE_KEY`: the contents of `ez2bms.key`;
   - secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password;
   - variable (not secret) `TAURI_UPDATER_PUBKEY`: the contents of
     `ez2bms.key.pub`.

   Without the three, releases build as before and the app says it cannot
   update itself. With only half of them, the release fails and says which
   is missing (`scripts/release-config.mjs`).

4. **Signing for Windows (optional).** Installers are unsigned, so Windows
   SmartScreen warns the first time ("More info" → "Run anyway"). A code
   signing certificate stops that once it has built up a reputation. To use
   one, add:
   - secret `WINDOWS_CERTIFICATE`: the `.pfx` file, base64-encoded
     (`base64 -w0 cert.pfx`);
   - secret `WINDOWS_CERTIFICATE_PASSWORD`: its password.

   The Windows build then signs the app and the installer. (Azure Artifact
   Signing is another route, for individuals in the US and Canada only; it
   would need the workflow changed to use its `signCommand`.)

## Each release

1. Put the version in `src-tauri/tauri.conf.json`, the workspace
   `Cargo.toml` and both `package.json` files, and add its section to
   `CHANGELOG.md`.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. When the workflow is done, open the draft release, check the installers
   (install on Windows; run the AppImage), and write what changed.
4. **Publish** it as a normal release (not a pre-release). From that moment
   the app finds it: at start, at most once a day, it tells you about it,
   shows what changed, and installs it when you say so.

The `.deb` does not update itself (Linux packages are updated by the
package manager); on a `.deb` install the app offers the release page
instead.
