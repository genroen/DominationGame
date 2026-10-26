# Signal Dominion — Browser Edition

A responsive, GitHub Pages-ready remake of the **Signal Dominion** Android graph puzzle, based on the Android project provided by the game owner.

![Signal Dominion browser edition — main menu](screenshots/home-desktop.png)

## Play and publish on GitHub Pages

**No build, npm, hosting backend, API key, or other tools are needed for the single-player game.**

1. Download and unzip `signal-dominion-github-pages.zip`.
2. Create a GitHub repository, e.g. `signal-dominion`.
3. Upload **all the extracted files and folders** directly into the **root of the repository** (not inside an extra folder). In particular, `index.html` must be at the root alongside `game.js`, `levels.js`, and `styles.css`. Keep `assets/` and the other files in place.
4. Commit the uploaded files on the `main` branch.
5. Open your repository's **Settings → Pages**.
6. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **`main`** and folder **`/ (root)`**, and save.
7. Visit the URL GitHub shows in Pages settings. It will normally look like `https://YOUR-USERNAME.github.io/signal-dominion/`.

If you want to try it first, just double-click `index.html`. It also works using any ordinary local web server, e.g. `python -m http.server 8000` from this folder.

## Features

- **43 original handcrafted campaign levels**, with the Android source's graph coordinates, edges, descriptions, Par values, and optimal hints.
- **Tap/click to increase** signal strength; **long-press, Shift+click or right-click to decrease**.
- Signal strength *k* covers the transmitting node and all other nodes within *k* edges. Score = sum of all signal strengths.
- **Progression locks, 1–3 star awards, best scores, Repeat/Next results, Reset and Hint**.
- **Procedurally generated Easy, Medium, and Hard graphs**. An exact graph-cover optimization algorithm computes Par and one optimal solution for each new graph. Random graphs can be regenerated using their stored seed.
- **Offline local competitive races** against a simulated, animated opponent with a live, draggable and expandable mini-board and a three-minute match clock. First to Par wins; on timeout, lowest complete solution wins.
- **Mobile-friendly and desktop-friendly** layout, keyboard support, reduced animation, vibration where supported, sound effects, and three optional music tracks.
- **LocalStorage saving** (scores, unlocked levels, settings and race history), no accounts or trackers.
- **Installable PWA** on supported browsers. GitHub Pages serves over HTTPS; the service worker caches game assets for subsequent offline use.

![Mobile view of a randomly generated puzzle](screenshots/game-mobile.png)

## Controls

| Action | Mobile | Desktop |
|---|---|---|
| Increase signal | Tap node | Left-click node; Enter/Space/Up on focused node |
| Decrease signal | Long-press node | Right-click, Shift+click, Down or `-` on focused node |
| Show an optimal hint | Hint | Hint |
| Clear the board | Reset | Reset, or Backspace while playing |
| Navigate screens | Menu buttons | Menu buttons, Esc to return/close |

**Star scoring:** 3 stars = cost equal to Par; 2 stars = Par + 1; 1 star = any other complete coverage. Completing any campaign level, even without 3 stars, unlocks the next.

## Files

```
index.html           Main webpage
styles.css           Responsive neon game UI
game.js              Graph game logic, generator, exact solver, menus and save system
levels.js            43 original campaign level definitions
manifest.webmanifest Installable web app metadata
sw.js                Offline caching for HTTPS hosts
.nojekyll            GitHub Pages configuration
assets/img/          App icon from the supplied project
assets/audio/        Bundled music and sound effects from the supplied project
screenshots/         Example screenshots for this README
```

All file references are relative paths, so they work even if the site is published at `/repository-name/` rather than the domain root.

## Limitations compared with the Android release

This is a **browser adaptation**, not a line-for-line Java-to-JavaScript transpilation. The campaign graph data and scoring rules are carried over. The procedurally generated graphs use a new **deterministic JavaScript generator**, so the **same numeric seed produces the same web graph**, but not necessarily the same graph as the Android generator.

**Online multiplayer is not included in this static site.** GitHub Pages cannot host the original custom Node.js PvP backend. The **Competitive** menu provides fully offline races against an opponent simulated locally. If you want real-time web PvP later, you will need a separate HTTPS server and web client integration. The Android app's backend cannot be made to run simply by uploading it to GitHub Pages.

The original Android and this adaptation both calculate coverage using shortest-path **link distance**, not physical pixel distance. The handcrafted level Par/hint values are copied from the Android source and checked for consistency; new graph Par values come from the in-browser exact optimization algorithm.

## Rights and attribution — important before publishing

The audio and icon assets in `assets/` were copied from **the project you supplied** to reproduce its look and sound. The supplied Android project's `17_AUDIO_RIGHTS_AND_ATTRIBUTION.md` contains an **unfinished rights checklist** and does not establish that the two MP3 tracks, ambient WAV, or sound effects are cleared for public redistribution.

**Before uploading the repository publicly, verify that you own or have permission to redistribute these assets.** If you do not have those rights, replace or remove the affected audio files and update the audio references in `game.js` and `sw.js`. The game logic, menus and levels don't require audio to function.

The game name and in-game credit **NodeSmith Games** are retained from the provided source. No third-party JavaScript packages, CDNs or analytics scripts are used.

## Updating the site

Edit `styles.css` for visuals, `game.js` for game logic, and `levels.js` for campaign content. Commit and push updates to `main`. To force the offline service-worker cache to refresh after deploying updates, change `CACHE_NAME` in `sw.js` (for example, from `signal-dominion-web-v1` to `signal-dominion-web-v2`).

## Browser support

Tested in Chromium using desktop and mobile viewports. Designed for current browsers supporting modern JavaScript, CSS, pointer events, HTMLAudioElement, and localStorage. Service worker/PWA installation requires HTTPS or localhost; core gameplay does not.
