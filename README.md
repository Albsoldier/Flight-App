# Flight Log

A simple static site for tracking flight-training records for student pilots — roster of students, a per-student flight logbook (date, aircraft, route, dual/solo/night/cross-country hours, instructor, remarks), running totals, and CSV export.

No backend, no build step: it's plain HTML/CSS/JS. Data is saved in the browser via `localStorage`, so it's private to whoever's browser it's opened in — good for a personal or demo tool, not for a shared multi-user system (see "Next steps" below if you need that).

## Files

- `index.html` — page structure
- `style.css` — ledger-style visual design
- `app.js` — roster, logbook, totals, and CSV export logic

## Run it locally

Just open `index.html` in a browser. No server or install required.

## Put it on GitHub

```bash
git init
git add .
git commit -m "Initial flight log site"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Host it free with GitHub Pages

1. Push the repo to GitHub (above).
2. On GitHub, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Save. Your site will be live at `https://<your-username>.github.io/<your-repo>/` within a minute or two.

## Next steps you might want

- **Multi-device / shared data**: `localStorage` only lives in one browser. To let instructors and students see the same data from anywhere, you'd swap the storage layer for a backend (e.g. Firebase, Supabase, or a small API) — happy to help wire that up when you're ready.
- **Auth**: if multiple people will use this, you'll want logins so students can't see or edit each other's records.
- **More log fields**: FAA logbooks often track things like PIC, simulator time, or specific maneuvers — easy to add more columns in `app.js`/`index.html` following the existing pattern.
