# Stitch Design Brief

Primary upload file: `DESIGN.md`.

This file is now a short companion note. Use `DESIGN.md` as the main Stitch input, and use `STITCH_OTHER_INSTRUCTIONS.md` for the "Other instructions" field in Stitch.

## Goal

Redesign the UI/UX for a travel business analytics dashboard without changing the runtime architecture. The final design should feel like a serious operational BI tool for travel management: dense, clear, scan-friendly, and suitable for repeated analysis.

## Audience

- Travel business management
- Sales and branch supervisors
- Product planning team
- Operations team reviewing tour feedback, leader performance, branch service, and destination demand

## Design Direction

- Prioritize readability, comparison, and fast scanning.
- Use clear hierarchy for KPI, trend, chart, table, and insight content.
- Keep charts visually prominent but not decorative.
- Make filters and month switching feel like core controls.
- Avoid a marketing-style landing page.
- Avoid oversized decorative sections that reduce data density.

## Pages To Redesign

- 旅行團數據儀表板
- AI 銷售預測
- 推薦意願專區
- 領隊表現專區
- 出團記錄分析
- 出團長評回饋
- 門市服務意見
- 綜合意見

## Do Not Break

Preserve all ids, canvas ids, select ids, and `.tab-content` sections listed in `ui-contract.md`.

The production dashboard depends on these hooks through `app.js`.

## Expected Output From Stitch

Prefer HTML/CSS-level design output or a detailed design spec that can be applied back to the existing `index.html`.

Do not move business logic, Chart.js configuration, data loading, formatters, or filters into the design output.
