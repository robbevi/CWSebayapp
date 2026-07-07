# Calfrac Warehouse Inventory Triage App

Standalone Node + React monorepo for triaging excess/obsolete warehouse parts before
listing them on the Calfrac eBay store. Data of record is the **"Williston eBay
Inventory"** SharePoint list on the `Supplychain2` site; photos are stored in an existing
SharePoint document library folder. All Microsoft Graph calls run server-side using an
Entra ID app registration (client credentials) — no secrets ever reach the browser.

## Requirements

- Node >= 20
- An Entra ID app registration with a client secret and Graph application permission
  `Sites.ReadWrite.All` (or `Sites.Selected` scoped to the target site)

## Setup

```bash
npm install
cp .env.example .env   # fill in AZURE_* and SHAREPOINT_* values
npm run dev
```

This starts the Express API (port 4000) and the Vite dev server (port 5173, proxying
`/api` to the backend) together. Without a populated `.env`, the app runs against
built-in mock data and shows a banner explaining what's missing — useful for UI work
before Graph credentials are available.

Open http://localhost:5173.

## Project layout

```
packages/shared     InventoryPart types + workflow status derivation (checkpointCount/deriveStatus)
apps/server          Express API: Graph integration, CSV import, photo upload
apps/web             Vite + React + TypeScript + Tailwind dashboard
```

## How data maps to SharePoint

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
upserts rows into the SharePoint list, matched by `Inventory Part ID` (falling back to
SKU). It's safe to re-run. Legacy photo columns (`Part Photographs`,
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
