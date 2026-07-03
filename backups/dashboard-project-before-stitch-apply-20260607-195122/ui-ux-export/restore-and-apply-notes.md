# Restore And Apply Notes

## Current Stable Backup

- Folder: `/Users/chanwaitung2025/Downloads/dashboard-project/backups/dashboard-project-before-uiux-20260603-222024`
- Zip: `/Users/chanwaitung2025/Downloads/dashboard-project/backups/dashboard-project-before-uiux-20260603-222024.zip`

## Restore Current Dashboard

If a redesign breaks the production dashboard, restore the files from the backup folder into:

`/Users/chanwaitung2025/Downloads/dashboard-project`

Then open through local HTTP:

`http://127.0.0.1:8080/index.html`

Do not use `file://` as the final validation path.

## Applying Stitch Output Later

When Stitch returns the redesign:

1. Compare the returned DOM against `ui-contract.md`.
2. Keep all required ids and canvas ids.
3. Apply visual/layout changes to production `index.html`.
4. Keep runtime logic in production `app.js`.
5. Run:
   - `node --check app.js`
   - `python3 -m json.tool data/202604.json`
   - `python3 -m json.tool data/202605.json`
6. Validate through HTTP:
   - `/index.html`
   - `/app.js`
   - `/data/202604.json`
   - `/data/202605.json`

## Browser Acceptance Checklist

- 2026年 05月 is the default month.
- 4月 and 5月 switching works.
- All charts initialize.
- Top 5 destination drill-down works.
- Long feedback filters work.
- Branch leaderboard and branch comments render.
- No `failed to fetch` error appears.
