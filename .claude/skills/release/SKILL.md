---
name: release
description: Builds the History Viewer .app and DMG for a new release. Use this instead of `npm run tauri build` — the standard Tauri DMG bundler fails due to a known temp-file issue. Run with `/release`.
disable-model-invocation: true
---

Follow these steps exactly to produce a release build:

1. **Get the current version** from `src-tauri/tauri.conf.json` and confirm it matches `package.json` and `src-tauri/Cargo.toml`. If they differ, stop and tell the user.

2. **Build the .app bundle:**
   ```bash
   npm run tauri build -- --bundles app
   ```
   Confirm the .app was created at `src-tauri/target/release/bundle/macos/History Viewer.app`.

3. **Clean up any leftover temp files** from previous failed DMG attempts:
   ```bash
   rm -f "src-tauri/target/release/bundle/macos/rw."*.dmg
   hdiutil info | grep "History Viewer" | awk '{print $1}' | xargs -I{} hdiutil detach {} 2>/dev/null || true
   ```

4. **Create the DMG via hdiutil** (not create-dmg — it fails due to disk image mount race conditions):
   ```bash
   VERSION=$(node -p "require('./package.json').version")
   rm -rf /tmp/hv-staging && mkdir /tmp/hv-staging
   cp -r "src-tauri/target/release/bundle/macos/History Viewer.app" /tmp/hv-staging/
   mkdir -p "src-tauri/target/release/bundle/dmg"
   hdiutil create \
     -volname "History Viewer" \
     -srcfolder /tmp/hv-staging \
     -ov \
     -format UDZO \
     "src-tauri/target/release/bundle/dmg/History Viewer_${VERSION}_aarch64.dmg"
   ```

5. **Confirm the DMG exists** and report its path and file size to the user.

6. **Create the GitHub release** using `gh release create`:
   ```bash
   VERSION=$(node -p "require('./package.json').version")
   gh release create "v${VERSION}" \
     "src-tauri/target/release/bundle/dmg/History Viewer_${VERSION}_aarch64.dmg" \
     --repo parmsam/history-viewer \
     --title "v${VERSION}" \
     --notes "See [CHANGELOG.md](https://github.com/parmsam/history-viewer/blob/main/CHANGELOG.md) for details."
   ```
   Ask the user to confirm before running this step.
