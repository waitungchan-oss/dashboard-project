# Dashboard Project Backup Manifest

## Backup Snapshot

- Backup name: `dashboard-project-before-uiux-20260603-222024`
- Created at: `2026-06-03 22:20:24 Asia/Hong_Kong`
- Source project: `/Users/chanwaitung2025/Downloads/dashboard-project`
- Purpose: Stable snapshot before creating the UI/UX export package for Stitch redesign.

## Included Files

- `index.html`
- `app.js`
- `data/202604.json`
- `data/202605.json`
- `serve.py`
- `start-dashboard.bat`
- `start-dashboard.command`
- `start-dashboard.sh`
- `README_START.md`
- `CHAT_RECORD.md`

## Excluded Files And Folders

- `backups/`
- `ui-ux-export/`
- `.DS_Store`

## Restore Notes

To restore this snapshot, copy the files from this backup folder back into:

`/Users/chanwaitung2025/Downloads/dashboard-project`

After restoring, start the dashboard through the local HTTP server and open:

`http://127.0.0.1:8080/index.html`

Do not use `file://` for final testing because the dashboard fetches local JSON data.
