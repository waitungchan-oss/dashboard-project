# Restore And Apply Notes

Updated: 2026-07-03

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
3. Keep `printReport`, `body.print-mode`, `.print-page`, `.print-block`, and `.print-report-chart-image`.
4. Apply visual/layout changes to production `index.html`.
5. Keep runtime logic in production `app.js`.
6. Do not replace `PRINT_SECTION_MANIFEST` unless the task is specifically about PDF page planning.
7. Run:
   - `node --check app.js`
   - `python3 scripts/check_screen_layout_static.py`
   - `python3 scripts/check_print_report_static.py`
   - `python3 scripts/validate_dashboard.py`
   - `python3 -m json.tool data/202604.json`
   - `python3 -m json.tool data/202605.json`
8. Validate through HTTP:
   - `/index.html`
   - `/app.js`
   - `/data/months.json`
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
- Normal dashboard is not stuck in `body.print-mode`.
- `#printReport` is hidden outside print mode.
- The PDF button generates print pages without blank charts or distorted doughnut charts.
