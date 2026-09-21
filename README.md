# Routine Tracker — Setup Instructions

## 1. Upload these files to your GitHub repository

Go to: https://github.com/amritanshsahai/workout_tracker

Click **Add file → Upload files**, then drag in all of these files (all at once, into the root of the repo — not inside a subfolder):

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

Scroll down and click **Commit changes**.

## 2. Turn on GitHub Pages

1. In your repository, click **Settings** (top menu).
2. In the left sidebar, click **Pages**.
3. Under "Build and deployment" → "Source", choose **Deploy from a branch**.
4. Under "Branch", choose **main** (or **master**, whichever your repo uses) and folder **/ (root)**.
5. Click **Save**.
6. Wait about 1–2 minutes. Refresh the Pages settings page — it will show a message like "Your site is live at `https://amritanshsahai.github.io/workout_tracker/`".

## 3. Install it on your OnePlus 7T

1. Open that URL in **Chrome** on your phone.
2. Tap the **⋮** menu (top right) → **Install app** (or **Add to Home screen**).
3. Confirm. You'll get an icon on your home screen.
4. Open it from that icon — it will launch full-screen, no browser bar, and works completely offline from then on.

## What's already set up for you

- All 3 routines and all 18 exercises from our planning session are pre-loaded the first time you open the app.
- Your data (benchmarks, aspirations, logs, settings) lives only on your phone — nothing is sent anywhere.

## If you ever want to update the app later

Just re-upload the changed file(s) the same way (Add file → Upload files, same filenames) and click **Commit changes**. The live site updates automatically within a minute or two.

## One deviation from the original plan, for reliability

Routines and exercises are reordered using **up/down arrow buttons** rather than drag-and-drop. This avoids relying on an external drag-and-drop library that could fail to load if you ever open the app without a connection — everything works fully offline this way, with no external dependencies at all.
