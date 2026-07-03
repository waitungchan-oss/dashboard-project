# Sample Data Context For Stitch

Updated: 2026-07-03

Use this file to understand the content density and business meaning of the dashboard. The production data remains in JSON; this file is only for design context.

## Current Default Month

- Default month: `202605`
- Display label: `2026年 05月`
- Total respondents: `155`
- Promotion consent: `91 / 58.71%`
- NPS score: `89.03`
- Promoters: `141 / 90.97%`
- Store signup: `132人 / 85.16%`

## Dashboard Themes

- Customer profile: gender, age, membership consent, satisfaction, destination by age group.
- Channel behavior: customers discover products through online media and recommendations, but mostly complete booking through physical branches.
- Main insight: online acquisition and offline conversion should be visually connected.

## NPS Zone

- NPS threshold x: `0.402`
- Satisfaction threshold y: `4.61`
- Future travel demand examples:
  - 日本
  - 長江三峽
  - 越南
  - 絲路
  - 韓國
  - 東南亞
  - 北京
  - 雲南

## Tour Records

- Total samples: `155`
- Average duration: `5.35天`
- Top destinations:
  - 韓國: `35`
  - 雲南: `33`
  - 北京: `18`
  - 新西蘭: `15`
  - 張家界: `11`
- Duration distribution:
  - 1-4 天: `70 / 46.67%`
  - 5-7 天: `65 / 43.33%`
  - 8 天或以上: `15 / 10.00%`

## Long Feedback

- Data source: 5月出團長評
- Feedback count: `54`
- Types:
  - positive: `27`
  - suggestion: `22`
  - negative: `5`
- High frequency themes:
  - 導遊
  - 領隊
  - 行程
  - 時間
  - 滿意
  - 專業
  - 酒店
  - 細心
  - 態度
  - 膳食
  - 安全
  - 購物

## Branch Service

- Branch leaderboard sample total: `N=135`
- Top branch examples:
  - 大埔門市: `N=2`, `5.00`
  - 荃灣綠楊坊門市: `N=20`, `4.70`
  - 銅鑼灣門市: `N=16`, `4.63`
  - 沙田門市: `N=15`, `4.60`
- Branch comments: `18`

## PDF / Print Stress Context

Production now has a dedicated PDF export path. Design work should account for both screen readability and print readability, but should not rebuild print logic.

Potential stress cases for future testing:

- 50+ long feedback cards
- 20+ branch feedback cards
- 20+ leaderboard rows
- 40+ tour detail rows
- Long destination names
- Long qualitative comments
- Doughnut / pie charts that must stay circular in PDF

Use virtual or fixture data for stress tests. Do not treat fixture values as production month data.

## Strategy Page

The strategy page is organized around:

- 優先解決的營運痛點
- 產品競爭力升級方向
- 核心護城河與增長引擎

The tone should feel like an operational BI dashboard for travel management, not a marketing landing page.
