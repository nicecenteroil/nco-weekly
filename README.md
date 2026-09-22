# nco-weekly

Weekly DSR team meeting management — Nice Center Oil
Site: https://weekly.nicecenter.co.th

## Structure

- `api/` — Google Apps Script backend (nco-weekly-api)
- `web/` — Static frontend (GitHub Pages)

## Setup

1. Set Script Properties in GAS: `SHEET_ID`, `APP_TOKEN`
2. Run `setupSheets()` once from Apps Script editor
3. Deploy as Web App (Execute as Me / Anyone)
4. Update `web/config.js` with the deployed Web App URL
