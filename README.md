# Flight School Dashboard

A lightweight web app for managing a flight school's student roster, teaching materials, and real-time flight-hour logging — no backend required.

## Features

- **Roster** — add students with name and aircraft; each student has a file with notes and a full session log.
- **Materials** — upload PDFs, JPGs, or any file as shared teaching materials; download or delete them.
- **Stopwatch** — pick a student, run a live Start/Pause/Resume timer, then **End Session** to save the duration straight into that student's file and update their running total hours.

- **Login & roles** — the first person to sign in creates the admin account. Admins can then generate accounts for instructors (full access) and students (view-only access to their own record and materials), with a one-time-shown password for each.

- **Live "who's online" tracker** — a real-time count of who's currently signed in, visible to everyone in the header; admins see per-user online/offline status in the Users tab. Requires a free Firebase project (see below) — the site works fine without one, the badge just shows "not configured."

## Files

- `index.html` — page structure
- `style.css` — styling (dark theme, auto-adapts to light mode)
- `auth.js` — login, roles, and admin user management
- `app.js` — roster/materials/stopwatch logic and data storage
- `firebase-config.js` — your Firebase project keys for the live tracker (setup instructions inside the file)
- `presence.js` — live cross-device "who's online" tracking
- `logo.png` — header logo / favicon

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything instructors can, plus create/delete user accounts and reset passwords |
| **Instructor** | Manage roster, upload/delete materials, run the stopwatch |
| **Student** | View their own flight record and notes (read-only), view/download materials |

⚠️ **Security note:** this is a static site with no backend, so login is a client-side gate only — passwords are hashed before being stored, but everything still lives in the browser's `localStorage`, which anyone with dev-tools access to that browser could inspect. It's suitable for keeping casual visitors out, not for protecting sensitive data from a determined person. For real security you'd need a backend that verifies passwords server-side (e.g. Firebase Auth, Supabase Auth, or a small custom API).

## How data is stored

Everything is saved locally in the browser you're using — nothing goes to a server:

- **Students & session logs** — `localStorage` (tiny amount of data, no practical limit for this use).
- **Uploaded materials (files)** — `IndexedDB`, which holds far more than `localStorage`'s old ~5-10MB cap — typically hundreds of MB up to a few GB, depending on the browser and free disk space. If you previously used the `localStorage`-only version, your existing materials migrate to IndexedDB automatically the first time you load the updated app.
- Data persists across reloads and restarts, but **stays on that one device/browser** — nothing syncs between your phone and laptop.
- Clearing that browser's site data will erase everything.

If you need true cross-device sync or need to hand storage limits off entirely, that requires a real backend (Firebase, Supabase, S3, etc.) instead of browser storage.

If you outgrow this, swap the storage functions at the top of `app.js` (`loadLS` / `saveLS`) for calls to a real backend (Firebase, Supabase, a small REST API, etc.) — the rest of the app doesn't need to change.

## Setting up the live online-user tracker

Open `firebase-config.js` — it has full step-by-step instructions in the comments (create a free Firebase project, enable Realtime Database + Anonymous auth, paste in your config). Takes about 5 minutes. Until you fill it in, the app works normally and the header badge just reads "not configured."

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages** in the repo.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, pick your branch (e.g. `main`) and root folder `/`.
4. Save — GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/`.

## License

Use and modify freely for your own flight school.
