# Post-Milking Sampling — Clean Build v1.1.0

A **fresh, consolidated, mobile-first application**, designed for a **new GitHub repository and a new Vercel project**. It follows the original post-milking UI specification's main journey (Session Management → add animals → check order → continuous QR linking → confirm → scan boxes → close). It is a functional prototype, not an integration with NMR.

## What is different from the old builds

- **One QR scanner only**, directly on the main page. No scanner iframe, auxiliary reader page, cross-window handoff, or multiple scripts competing for the camera.
- Uses **html5-qrcode 2.3.8**, configured for QR_CODE only, with `{facingMode:'environment'}` and `{fps:10}` — the same QR configuration that decoded a real code in the standalone iPhone diagnostic.
- Live camera video remains mounted **between scans**. Successful scans update animal cards, not the camera DOM.
- **One green card above the camera:** only the **latest linked animal**. Previous linked animals are saved and available in **View all linked** / **Animals**.
- Awaiting animals remain below the camera. Each scan removes the next animal from Awaiting, advances NEXT and provides audio/visual feedback.
- The same Sample ID cannot link to multiple animals. Consecutive callbacks for one held code are throttled.
- Entering a complete, valid **HH:MM Start time** automatically moves keyboard focus to End time, without a separate tap.
- No service worker: deployments are fetched normally, avoiding confusing old cached app versions during camera testing.
- Camera diagnostics are built into the main screen: expand **Camera diagnostics** below the live preview to see video, permissions and QR reader status.

## File layout

| File | Purpose |
| --- | --- |
| `index.html` | Application entry point, loads only the main scanner library and `app.js` |
| `app.js` | All session, animal, linking, scanning and box logic |
| `styles.css` | Mobile-first interface |
| `manifest.webmanifest` | iOS/Android home-screen icon and standalone display |
| `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Icons |
| `vercel.json` | Static hosting settings |

**No build tools or npm install required.**

## Deploy to a brand-new GitHub repository and Vercel project

1. Create a new **public or private** repository in GitHub, e.g. `postmilk-clean`.
2. Extract this ZIP. Upload **the files inside** directly to the repository's root. Do not upload the ZIP itself or an enclosing folder.
3. Commit the files.
4. In Vercel, choose **Add New → Project → Import Git Repository**. Select the new repository.
5. Framework preset: **Other**. Root Directory: `./`. No build command. Output directory: leave blank (root). Deploy.
6. Open the **new HTTPS Vercel domain** in Safari on iPhone. Don't use the old Vercel link or old home-screen icon.
7. To run full screen, Safari → Share → Add to Home Screen, then open using its icon.

## Test the scanner on an iPhone

1. Open the new site and enter times; try `0510` to confirm focus moves to End Time.
2. Set End Time, tap **Start Linking**.
3. Tap **Load Demo** (or add two cows), then **Done Adding** and **Confirm Order**.
4. If Safari asks, **Allow camera**. The same app's camera area should show a live image and the status **CAMERA LIVE**. If it doesn't start automatically, press **START CAMERA** once.
5. Point at a QR code with any text, including your test nine-digit codes. The next animal should disappear from the awaiting list and **appear as the one green card above the camera**.
6. Point at a different QR code. The second animal replaces the first green card. Both links are saved under **View all linked**. The live camera is not restarted.
7. If scanning fails, expand **Camera diagnostics** and take a screenshot of the status and technical details.

**Honest testing limit:** The session and linking logic can be tested by browser simulation, but **real iPhone decoding must be verified on your device**. The previously successful diagnostic is strong evidence for this reader configuration, not a guarantee that every iPhone behaves identically in this app.

## Important prototype boundaries

- Session and animal data are stored in **localStorage on the current device, browser and domain**. The new Vercel site starts fresh; saved sessions from the old site **are not transferred automatically**.
- There is an **Export JSON** feature in the menu, and an **Import JSON** feature for a compatible session export. You can export from the old app and import into the new one if the export format is compatible; the clean app expects an `animals` array and session ID.
- No NMR integration, identity/device registration, backend syncing, invoice integration or account login.
- Barcode decoding depends on the `html5-qrcode` library loading from a CDN; first use requires internet. The static app is not presented as offline-capable.
- This is a demo/test app with default farm/session information. Replace those fields in Session details for your test.

## Diagnostic and development notes

- Scanner code is confined to `startCamera`, `stopCamera`, `onQrDecoded` and `loadLibrary` in `app.js`.
- A scanner instance is created only when scanning begins and destroyed when the user navigates away or pauses the camera.
- `refreshLinkingAfterScan()` modifies only the last linked and awaiting lists; it never rerenders the `#qr-reader` node.
- QR_CODE enum value is zero, so it is used explicitly and never removed via `.filter(Boolean)`.
- When porting to production, implement audited authentication, backend sync and server-issued session IDs before processing real customer data.

## UI-12 and 70-animal test herd (v1.3.3; previously 250 in v1.1.0)

- A deterministic **test-only herd** of 70 distinct line numbers, `00001` through `00070`, is bundled in `herd.js`. These are **herd catalogue records, not sampling-session animals**. The v1.3.3 update makes a one-time reset of the previous device-local demo sampling session, clearing old linked IDs, animal selections and boxes. Future work is saved normally. Camera preferences are preserved.
- Open **Main menu → Test herd · 70 animals** to search the full catalogue or filter by Available, Awaiting, Sampled, and No sample. The statuses derive from the current sampling session.
- **+ ADD COWS** now opens UI-12. Enter part of a line number on the custom number pad to search; tap a matching animal to add it to the **end** of the session list. If yields are required, a yield-entry step follows.
- Select an already-sampled or already-entered animal to see the duplicate warning. **ADD ANYWAY** appends a separate record, flagged DUPLICATE, without altering earlier records.
- If no herd animal matches the complete line number, **ADD** uses the number exactly as entered without changing the herd catalogue.
- **DONE** returns to the order check for initial setup, or resumes normal continuous linking when used during the linking stage.
- The status **Sampled** is the catalogue-level name for a session animal with a linked Sample ID.
- **UI-20 / 4.3.5** offers custom digit entry, CLR, backspace and BACK TO SCAN. **LINK SAMPLE** links only the selected animal and briefly shows the 4.3.2 confirmation.
- The continuous main-screen QR decoder and its working camera configuration are deliberately unchanged.

### Suggested test

Search for `0016` in UI-12 (matches `00160`–`00169`). Add `00164`, capture a sample, and search again: `00164` should appear under **SAMPLED**. Choosing it again should display the duplicate warning. Search for a number outside the catalogue (e.g. `00300`) to test the **ADD exactly as typed** flow.

## Data Matrix decoder comparison (v1.3.0)

The original in-browser ZXing JavaScript decoder remains the default. This release adds an **optional experimental ZXing-C++ WebAssembly decoder** for comparison on actual sample pots. No main-screen UI layout or session data structures were changed.

To compare on iPhone: Main menu → **Camera settings** → set **Barcode type** to **Data Matrix only** → change **Data Matrix decoder** between **Original ZXing (current)** and **ZXing-C++ Fast (experimental)** → DONE → return to scanning.

- Uses the exact same existing camera, focus/zoom settings, one-at-a-time animal linking, duplicate checks, and confirmation flow.
- The alternative loads pinned `zxing-wasm@3.1.6` through jsDelivr, and its reader WASM (~1 MB) downloads only when selected; decoding stays on the device.
- The old decoder keeps working during initial loading; once WASM is ready the old **decoder** pauses, without stopping or freezing the video.
- The alternative uses centre-region Data Matrix recognition (one symbol per scan), with occasional more thorough decoding passes to help difficult codes.
- If WASM fails to load, initialise or decode, the app automatically resumes the existing decoder and reports the fallback.
- QR-only and QR+Data Matrix modes are not changed by this option. Switching preferences changes the **next** camera start.
- **Experimental**: iPhone speed/reliability improvement must be measured with actual pots; browser/CPU/network differences matter.

Useful comparison: time 10 normal pots with Original, then 10 with Fast, and also test the one consistently difficult pot. Do not interpret a green camera overlay as a confirmed decoded code.

## Demo session clean-up (v1.3.3)

Before this version, previously linked sample IDs were stored under browser `localStorage` key `postmilk-clean-1.0` and reloaded whenever the app reopened. The test herd catalogue itself is separate from the saved session.

On the **first load of v1.3.3 on each browser/device profile**, the app removes that old **test session** (animal entries, sample links, boxes, and test session timing) and writes the one-time marker `postmilk-demo-clean-70-v1`. Subsequent launches preserve newly entered session data. The user’s stored camera, zoom, barcode-format, and decoder preferences in `postmilk-camera-preferences-v1` are not modified.

The five convenience demo animals are now selected from the 70-animal herd. The catalogue remains independent from the sampling session. Manually entered line numbers outside the catalogue remain supported as an explicit exception, as before.

## Multiple sampling sessions and test management (v1.4.0)

**Sampling Sessions** is now the initial screen. It shows locally saved sessions, farm, herd, session ID, number of animals, linked-sample count and current stage. Tap a session to open its existing Session Management workflow, or choose **+ New Session** to create a separate record. Session IDs must be unique on the device. The prior single-session `postmilk-clean-1.0` record migrates into the new `postmilk-sessions-v1` registry the first time multi-session functionality is used; `postmilk-active-session-v1` remembers the chosen record. Each session retains its own animal order, sample links, boxes, and tests. Data remains **on this device**, with no backend synchronisation.

**Clear Test Data** under Camera Settings now clears all locally saved test sampling sessions, including their animals, sample links, box scans, and test assignments. It requires confirmation and deliberately leaves camera, lens, zoom, decoder and barcode preferences untouched. The former Menu **Reset Demo Session** deletes only the selected session.

**Add Test** implements the selection in the section 4.7 mockups: tap a linked animal and choose **+ Add Test**, then select any of Johnes, BVD, PAG, Neo and tap ADD/DONE. Existing Sample ID and yield are unchanged. Menu → **Test management** lists **only animals with linked sample IDs in the selected sampling session** (not the whole 70-animal test herd). It provides test filters (With Test, Without Test, All), search by line number or Sample ID, Select All Shown and Save. Assignments belong to the sampled animal's record and are never applied to unsampled herd animals. Existing test choices for linked animals are migrated, while obsolete herd-level assignments are discarded. These are test-recording UI functions only. **Eligibility validation and pre-ordered locked test states are not implemented**, because the mockups mark them future work and do not specify business rules.

Sample Boxes uses the narrower full-image scanner preview with **SCAN NEXT BOX** and **CAMERA ON/OFF** overlaid, plus broad 1D/2D barcode recognition and manual box-number entry. The milk-pot fast Data Matrix decoder is independent and unchanged.

## Data Management, test seeding and simulated NMR delivery (v1.5.0)

**Main menu → Data Management** opens a separate local data-flow hub for the selected session. **Sync & consolidation** in Session Management remains unchanged and has no link to Data Management. It summarises animals in the sampling list, linked samples, animals with tests and scanned sample boxes.

- **Inbound** displays the locally seeded 70-animal demo herd (not a live NMR download) and offers **Import Session JSON**. The import adds a new session to the session list, retaining existing sessions.
- **Outbound → Files** offers **Export Current Session JSON**. JSON import/export now live here; the former standalone menu JSON items have been removed.
- **Outbound → NMR** explicitly shows **Not sent** by default. **Simulate Send to NMR** records a timestamp and a **SIMULATED SENT · TEST ONLY** state in browser storage, without making any NMR network request. Any subsequent saved session change marks the simulated delivery **CHANGED SINCE SIMULATED SEND**. This is **not proof of transmission or acceptance** by NMR; there is no NMR API connection in the prototype.
- **Test Data Tools → Add animals from test herd** accepts a requested count, chooses the next available demo-herd animals in ascending line-number order and adds them to this session's sampling list, unlinked and ready for pot scanning. It cannot create duplicates or exceed the available herd.
- **Test Data Tools → Generate linked Sample IDs & yields** accepts a requested count of awaiting animals and assigns unique, nine-digit numeric test Sample IDs to them, with a synthetic yield only when a yield is missing. Existing linked animals, sample IDs, assigned tests and entered yields are preserved. Newly linked animals are immediately available in **Add Tests**. Bulk test-data controls are disabled for closed sessions.

The 70-animal catalogue, pot camera, barcode formats, Data Matrix decoder, and camera preferences are unchanged. All data and simulated delivery statuses are local to the device. There is no automated actual NMR delivery.
