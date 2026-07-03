# UI Contract For Stitch Redesign

This file lists the DOM contract that the production dashboard relies on. Stitch can redesign layout, visual hierarchy, colors, typography, cards, spacing, and responsive behavior, but the following hooks must be preserved when applying a design back to the production dashboard.

## Production Files To Protect

- Production entry: `/Users/chanwaitung2025/Downloads/dashboard-project/index.html`
- Runtime logic: `/Users/chanwaitung2025/Downloads/dashboard-project/app.js`
- Data files: `/Users/chanwaitung2025/Downloads/dashboard-project/data/202604.json`, `/Users/chanwaitung2025/Downloads/dashboard-project/data/202605.json`

Do not move Chart.js logic, formatter logic, drill-down logic, filter logic, or fetch logic into JSON.

## Required Month And Tab Hooks

- `globalMonthSelector`
- `report-content`
- `tabFilterContainer`
- `tabFilterMenu`
- `filterCheckboxes`
- `.tab-content`
- Tab section ids:
  - `dashboard`
  - `sales_forecast`
  - `nps_zone`
  - `tourleader`
  - `records`
  - `feedback_analysis`
  - `branch_feedback`
  - `analysis`

## Required Chart Canvas Ids

- `genderChart`
- `ageChart`
- `memberConsentCrossChart`
- `satisfactionChart`
- `destAgeCrossChart`
- `sourceChart`
- `channelChart`
- `salesForecastChart`
- `rfmChart`
- `npsCorrelationChart`
- `futureDestChart`
- `npsDistChart`
- `npsScoreChart`
- `topDestChart`
- `durationDistChart`
- `satisfactionCrossChart`

## Required Dynamic Text And Table Hooks

- Dashboard KPI and insights:
  - `header-data-source`
  - `kpi-total-respondents`
  - `kpi-promo-consent`
  - `kpi-nps-score`
  - `kpi-store-signup`
  - `profile-title`
  - `member-source-label`
  - `member-insight-1`
  - `member-insight-2`
  - `satisfaction-title`
  - `satisfaction-insight-1`
  - `satisfaction-insight-2`
  - `dest-age-insight-1`
  - `dest-age-insight-2`
  - `source-reply-label`
  - `channel-reply-label`
  - `channel-insight-title-1`
  - `channel-insight-text-1`
  - `channel-insight-title-2`
  - `channel-insight-text-2`
  - `channel-insight-title-3`
  - `channel-insight-text-3`

- NPS Zone:
  - `nps-zone-description`
  - `nps-zone-indicator`
  - `future-dest-table-body`
  - `future-product-guide-list`
  - `loyalty-recommendation-list`
  - `nps-driver-table-body`
  - `opinion-keyword-grid`
  - `opinion-optimization-title`
  - `opinion-optimization-list`

- Leaderboard:
  - `leaderboard-source-label`
  - `leaderboard-title`
  - `fullLeadersTable`
  - `leaderboard-footnote`

- Tour records:
  - `records-top-destination`
  - `records-average-days`
  - `records-total-samples`
  - `duration-legend`
  - `crossChartSubtitle`
  - `resetBtn`
  - `records-cross-insights`
  - `tourDetailBody`

- Long feedback:
  - `typeFilter`
  - `destFilter`
  - `leaderFilter`
  - `sentimentStatusBar`
  - `wordCloudContainer`
  - `feedbackGrid`

- Branch feedback:
  - `branch-leaderboard-heading`
  - `branch-leaderboard-total`
  - `branchLeaderboard`
  - `branch-feedback-total`
  - `branchFeedbackGrid`

## Safe Redesign Rules

- Keep all ids exactly as written.
- Keep one `<canvas>` per chart id.
- Keep select controls for month, feedback type, destination, and leader.
- Existing `app.js` should remain the source of runtime behavior.
- JSON files must remain pure data only.
- Use local HTTP testing after applying any redesign: `http://127.0.0.1:8080/index.html`.
