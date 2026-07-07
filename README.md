# Calfrac Warehouse Inventory Triage App

Standalone Node + React monorepo for triaging excess/obsolete warehouse parts before
listing them on the Calfrac eBay store. Data of record is meant to be the **"Williston
eBay Inventory"** SharePoint list on the `Supplychain2` site, with photos in an existing
SharePoint document library folder, via server-side Microsoft Graph (Entra ID app
registration, client credentials) — no secrets ever reach the browser.

**Interim backend**: the Entra admin-consent step needs Calfrac IT, so until that's
granted the app also supports **Google Sheets (data) + Google Drive (photos)** as a
drop-in replacement behind the same `/api/*` contract — see "Two backends" below. Both
implementations are kept side by side; switching is just a matter of which env vars are
populated. No code changes needed to go back to SharePoint once IT grants consent.

## Requirements

Either:
- An Entra ID app registration with a client secret and Graph application permission
  `Sites.ReadWrite.All` (or `Sites.Selected`), **or**
- A Google Cloud service account with the target Sheet + Drive folder shared to it

Node >= 20 either way.

## Setup

```bash
npm install
cp .env.example .env   # fill in either the GOOGLE_* vars or the AZURE_*/SHAREPOINT_* vars
npm run dev
```

This starts the Express API (port 4000) and the Vite dev server (port 5173, proxying
`/api` to the backend) together. Without a populated `.env`, the app runs against
built-in mock data and shows a banner explaining what's missing — useful for UI work
before real credentials are available.

Open http://localhost:5173.

## Two backends

Each `/api/*` route checks `isGoogleConfigured()` first, then `isGraphConfigured()`,
then falls back to mock data — see `apps/server/src/routes/*.ts`. This is a simple
explicit branch per route, not a generic adapter interface, since there are exactly two
concrete backends and no plans for a third.

### Google Sheets/Drive (interim)

1. console.cloud.google.com → new project → enable **Google Sheets API** and
   **Google Drive API**.
2. IAM & Admin → Service Accounts → create one → Keys → **Add key → JSON** → download.
3. Create a blank Google Sheet, rename the first tab **Parts**, and set row 1 to these
   headers (order doesn't matter — columns are matched by name, not position):
   ```
   sku, description, manufacturer, inventorySite, binLocation, qoh, confirmedQoh, notes,
   boxCondition, photographed, itemListed, itemListedDate, transferredToMarketRecovery,
   catalogingStartDate, legacyPartId, importSequenceNumber, updatedAt
   ```
4. Share that Sheet with the service account's `client_email` (from the JSON key) as
   **Editor**.
5. Create a Google Drive folder for photos, share it with the same service account
   email as **Editor**.
6. Put the downloaded JSON key somewhere local (gitignored via
   `google-service-account*.json`) and set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`,
   `GOOGLE_SHEET_ID`, and `GOOGLE_DRIVE_FOLDER_ID` in `.env`.

Rows are identified by SKU (Sheets have no stable row-ID concept), so
`InventoryPart.id === sku` for Google-backed data — the frontend doesn't need to know
which backend is active. Photos are uploaded to the Drive folder and made
"anyone with the link can view" so they can be shown via `<img src>` directly, rather
than proxied through the server — a deliberate simplification, reasonable for photos
destined for a public eBay listing anyway.

### SharePoint/Graph (target)

- An Entra ID app registration with a client secret and Graph application permission
  `Sites.ReadWrite.All` (or `Sites.Selected` scoped to the target site).

## Project layout

```
packages/shared     InventoryPart types + workflow status derivation (checkpointCount/deriveStatus)
apps/server          Express API: Graph integration, CSV import, photo upload
apps/web             Vite + React + TypeScript + Tailwind dashboard
```

## How data maps to SharePoint (target backend)

Only the list's existing legacy columns are read/written (see
`apps/server/src/graph/fieldMap.ts` for the exact display-name mapping) — no new
columns are added to the production list. Photos are **not** stored as a list column;
they're derived by listing the configured document library folder and grouping
filenames by SKU prefix (`SKU_yyyy-MM-dd_HHmmss.jpg`). Workflow status
(Not Started / Processing / Completed) is computed on the fly from five checkpoints
(photographed, confirmed quantity, box condition, transferred, listed) — it isn't
persisted either.

Column display names in this repo were chosen to match the real legacy CSV export
headers. If the actual SharePoint list uses different internal names, the server
resolves display name → internal name once at startup via the Graph columns endpoint,
so no code changes are needed for that — but if a *display name* itself differs from
what's in `fieldMap.ts`, update it there.

## CSV import

The dashboard's "Import CSV" button uploads the legacy InventoryPart export and
upserts rows into whichever backend is active, matched by `Inventory Part ID` (falling
back to SKU). It's safe to re-run. Legacy photo columns (`Part Photographs`,
`Part Photographs ID`, `Photo URLs`) are intentionally not imported — every part starts
with zero photos until staff capture one in the app. Import is sequential (not
batched), so a very large one-off export may take a while; that's a reasonable
trade-off for an occasional operation, but worth knowing before kicking off a
multi-thousand-row import.

## Production

```bash
npm run build
npm start
```

`npm start` runs a single Node process that serves both the API and the built web
assets.

## Known follow-ups (not blocking, not yet built)

- Photo deletion (only upload is implemented; no DELETE endpoint yet).
- Graph application permission `Sites.Selected` instead of `Sites.ReadWrite.All` for
  least-privilege access (works either way; `Sites.Selected` needs an extra admin
  consent step per site).
- Adding staff as SharePoint site members for direct browsing of the photos library is
  a separate access-control task on the Microsoft 365 admin side, not something this
  app manages.
