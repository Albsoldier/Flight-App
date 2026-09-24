# Flight School Dashboard

A lightweight web app for managing a flight school's student roster, teaching materials, and real-time flight-hour logging — no backend required.

## Features

- **Roster** — add students with name and aircraft; each student has a file with notes and a full session log.
- **Materials** — upload PDFs, JPGs, or any file as shared teaching materials; download or delete them.
- **Stopwatch** — pick a student, run a live Start/Pause/Resume timer, then **End Session** to save the duration straight into that student's file and update their running total hours.

- **Login & roles** — the first person to sign in creates the admin account. Admins can then generate accounts for instructors (full access) and students (view-only access to their own record and materials), with a one-time-shown password for each.

## Files

- `index.html` — page structure
- `style.css` — styling (dark theme, auto-adapts to light mode)
- `auth.js` — login, roles, and admin user management
- `app.js` — roster/materials/stopwatch logic and data storage

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything instructors can, plus create/delete user accounts and reset passwords |
| **Instructor** | Manage roster, upload/delete materials, run the stopwatch |
| **Student** | View their own flight record and notes (read-only), view/download materials |

⚠️ **Security note:** this is a static site with no backend, so login is a client-side gate only — passwords are hashed before being stored, but everything still lives in the browser's `localStorage`, which anyone with dev-tools access to that browser could inspect. It's suitable for keeping casual visitors out, not for protecting sensitive data from a determined person. For real security you'd need a backend that verifies passwords server-side (e.g. Firebase Auth, Supabase Auth, or a small custom API).

## How data is stored

This app uses the browser's `localStorage` — everything (students, materials, session logs) is saved locally in the browser you're using. That means:

- Data persists across page reloads and browser restarts, but **stays on that one device/browser** (no syncing between your phone and laptop).
- Total storage is capped around 5–10MB depending on the browser, so keep uploaded files modest in size (a handful of PDFs/images is fine; large video files are not).
- Clearing browser site data / cache will erase everything.

If you outgrow this, swap the storage functions at the top of `app.js` (`loadLS` / `saveLS`) for calls to a real backend (Firebase, Supabase, a small REST API, etc.) — the rest of the app doesn't need to change.

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
