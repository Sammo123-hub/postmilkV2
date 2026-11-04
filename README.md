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

## UI-12 and 250-animal test herd (v1.1.0)

- A deterministic **test-only herd** of 250 distinct line numbers, `00001` through `00250`, is bundled in `herd.js`. These are **herd catalogue records, not sampling-session animals**. The existing saved session is left unchanged.
- Open **Main menu → Test herd · 250 animals** to search the full catalogue or filter by Available, Awaiting, Sampled, and No sample. The statuses derive from the current sampling session.
- **+ ADD COWS** now opens UI-12. Enter part of a line number on the custom number pad to search; tap a matching animal to add it to the **end** of the session list. If yields are required, a yield-entry step follows.
- Select an already-sampled or already-entered animal to see the duplicate warning. **ADD ANYWAY** appends a separate record, flagged DUPLICATE, without altering earlier records.
- If no herd animal matches the complete line number, **ADD** uses the number exactly as entered without changing the herd catalogue.
- **DONE** returns to the order check for initial setup, or resumes normal continuous linking when used during the linking stage.
- The status **Sampled** is the catalogue-level name for a session animal with a linked Sample ID.
- **UI-20 / 4.3.5** offers custom digit entry, CLR, backspace and BACK TO SCAN. **LINK SAMPLE** links only the selected animal and briefly shows the 4.3.2 confirmation.
- The continuous main-screen QR decoder and its working camera configuration are deliberately unchanged.

### Suggested test

Search for `0016` in UI-12 (matches `00160`–`00169`). Add `00164`, capture a sample, and search again: `00164` should appear under **SAMPLED**. Choosing it again should display the duplicate warning. Search for a number outside the catalogue (e.g. `00300`) to test the **ADD exactly as typed** flow.
