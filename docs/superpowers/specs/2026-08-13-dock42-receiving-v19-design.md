# dock42-receiving — Odoo v19 CE rebuild design

## Context

`dock-42-receiving` (source: `~/Downloads/dock-42-receiving.zip`) is a standalone
React 19 + TypeScript + Vite + Express prototype for warehouse dock package
receiving — camera-based label scanning (Gemini AI), offline IndexedDB queue,
push notifications, damage reporting. It was AI-Studio-generated and code
reviewed on 2026-08-13, which found 15 real bugs, two app-breaking:

1. A React Rules-of-Hooks violation in `PackageDetailModal.tsx` crashes the
   app the first time any package is opened.
2. The primary "TAP TO CAPTURE" button never calls the real scan/AI path —
   it fabricates random mock data. The real scan handler is dead code.

The remaining 13 findings are mostly silent data-loss / fake-success bugs
rooted in one architectural choice: the app maintains its own client-side
"offline queue" and "synced" bookkeeping instead of treating a real backend
as the single source of truth, so the two can drift out of sync (findings on
shelf/damage edits never syncing, a scanned package marked synced without
being sent, the queue being wiped mid-flight, no reentrancy guard allowing
duplicate records on double-tap, a `||` vs `??` bug silently replacing a
legitimate 0 weight with fake data, and a server that returns fabricated
"success" data on every AI API failure instead of surfacing the error).

Separately, `porterly_inbound_pwa` (Odoo **16** CE module, live at
`https://porterly.space/inbound`, source in Forgejo at
`john/porterly_ERP/Porterly_PRODUCTION-master/porterly_inbound_pwa`) solves
the same class of problem correctly: native Odoo controllers + models, a
`capture_uuid` idempotency key enforced by a DB-level unique constraint, real
auth, an audit trail via `message_post`, and a clean pattern for completing a
record later (shelf photo) via a second idempotent call instead of silent
local-only mutation.

## Goal

Rebuild `dock-42-receiving` as a new, standalone Odoo **v19 CE** addon,
`dock42_receiving`, that:
- Ports porterly's idempotent-capture architecture (adapted for v19 — see
  Idempotency below), eliminating the review findings that trace back to
  the fake client-side sync layer.
- Fixes the remaining bugs (hooks crash, dead scan handler, weight bug,
  missing `key` prop, nav z-index/DOM order, CSV escaping, missing
  notification icon assets) as part of the port.
- Is a genuine improvement on what `porterly_inbound_pwa` does for its
  domain — real server-side auth, real idempotency, real error handling
  instead of fabricated success.

## Explicitly resolved decisions (do not re-litigate without new input)

- **Marshal.show compatibility:** resolved as *pattern-reuse only, no
  runtime coupling*. Marshal (Odoo 16 CE, RainCloud) is architecturally a
  poor integration target — different domain (freight/chokepoint movement,
  not warehouse shelf-bin receiving), no external write API, single-tenant
  per venue. `dock42_receiving` does not call, depend on, or install into
  Marshal in any way.
- **Deploy target:** generic — no assumptions baked in for Southbrook or any
  other specific existing instance. Ships as a normal installable v19 CE
  addon; the actual instance it lands on is decided later.
- **Data model scope:** `dock42.package` is a standalone, self-contained
  model — it does **not** create real `stock.picking`/`stock.move` records
  against Odoo's inventory. This matches the original app's scope (it never
  touched real stock quants) and porterly's own pattern (a bespoke model,
  not core-stock integration). Deeper inventory integration (product
  matching, lot handling, picking state machine) is out of scope for this
  rebuild.

## Architecture

```
dock42_receiving/
  __init__.py
  __manifest__.py
  controllers/
    __init__.py
    main.py                  # HTTP routes, mirrors the old Express routes
  models/
    __init__.py
    dock42_package.py        # the record + idempotent create/update logic
  data/
    ir_config_parameter.xml  # gemini_api_key default (empty)
  security/
    ir.model.access.csv
  static/
    src/pwa/                 # built React app (Vite output), served as the
                              # app shell — same static-serving pattern
                              # porterly uses for its index.html
  frontend/                  # React/TS/Vite SOURCE (not installed by Odoo;
                              # `npm run build` output is copied into
                              # static/src/pwa/). Carried over from the
                              # original dock-42-receiving React app.
```

## Data model

`dock42.package` fields (carried over from the original `PackageItem` type):
`po_number`, `vendor`, `item_name`, `weight_kg`, `state`
(draft / shelf_pending / damaged / synced), `shelf_location`, `capture_uuid`
(idempotency key, indexed, unique), `captured_by` (`res.users`),
`photo_label` / `photo_package` / `photo_shelf` (Binary attachments),
damage fields (`damage_category`, `damage_severity`, `damage_notes`).

## Idempotency (the core point of this rebuild)

```python
class Dock42Package(models.Model):
    _name = 'dock42.package'
    _description = 'Dock 42 Received Package'

    capture_uuid = fields.Char(index=True, copy=False)

    _capture_uuid_uniq = models.Constraint(
        'UNIQUE(capture_uuid)', 'A package with this capture UUID already exists.')

    @api.model
    def pwa_create_capture(self, vals):
        uuid = vals.get('capture_uuid')
        if uuid:
            existing = self.search([('capture_uuid', '=', uuid)], limit=1)
            if existing:
                return {'id': existing.id, 'duplicate': True}
        return {'id': self.create({...}).id, 'duplicate': False}
```

**v19-specific correction, load-bearing:** porterly's v16 code uses
`_sql_constraints`, which is **silently ignored in Odoo 19 CE** — the module
would install without error and the unique constraint simply would not
exist in Postgres. The v19-correct form is the class-level
`models.Constraint(...)` shown above. This was confirmed via targeted
research before writing this spec, specifically to avoid porting a pattern
that looks identical but silently loses its safety guarantee.

This single server-side guarantee is what eliminates review findings #3, #4,
#6, and #8 (shelf/damage edits silently lost, a package marked synced
without its data being transmitted, the offline queue wiped mid-flight
dropping concurrently-added items, double-tap creating duplicate records) —
the client can retry blindly against `pwa_create_capture` and it is always
safe, because the source of truth is a DB constraint, not client-side
bookkeeping that has to be kept in sync by hand.

## Controllers (`/dock42/api/*`)

Mirrors the current Express routes, native Odoo instead:

- `GET /dock42` — serves the built React app shell. `auth='user'`, reuses
  porterly's `_is_operator()` pattern (`not _is_public()` and
  `has_group('base.group_user')`) rather than trusting `auth='user'` alone,
  since that instance-specific Public-user fallthrough is a documented Odoo
  gotcha porterly already worked around. dock-42 currently has **no auth at
  all** on its Express routes — this is a genuine new requirement, not a
  straight port.
- `POST /dock42/api/capture` — idempotent create (above).
- `POST /dock42/api/scan-label` — Gemini vision call, moved server-side into
  Python (`google-genai` SDK, not the Node `@google/genai` SDK the original
  used). API key read from `ir.config_parameter` (`sudo()`-scoped), not a
  `.env` file. **On any failure (missing/invalid key, model rejection,
  network timeout, malformed response) this raises/returns a real error —
  it must never fabricate label data and report success**, which is exactly
  what the original `server.ts` catch block did (finding #14).
- `POST /dock42/api/update_shelf`, `POST /dock42/api/flag_damage` — same
  idempotent-write pattern, actually persisted server-side (fixes finding
  #3's "queued for sync" banner that was previously a lie).
- `GET /dock42/api/feed` — recent captures, for the arrived-today list.

## Frontend

Keep the existing React app rather than rewrite it — the bugs found were
logic bugs, not architecture-wrong-for-the-job bugs. Fixed as part of the
port:

- Rules-of-Hooks crash in `PackageDetailModal.tsx` (finding #1) — move the
  early-return after the hooks, or guard the component's mount in the
  parent so it's never mounted with a null `pkg`.
- Dead scan handler (finding #2) — wire `CaptureStrip`'s capture button to
  the real `handleTriggerScan` path instead of the mock-data generator.
- `weightKg: scannedData?.weightKg || 15.2` (finding #9) — `??` not `||`,
  so a legitimate scanned `0` is preserved.
- Missing `key={pkg.id}` on `PackageDetailModal` (finding #13) — forces a
  remount per package so `shelfInput`'s `useState` initializer resyncs.
- Bottom nav z-index/DOM order overlapping open modals (finding #7).
- CSV export field escaping (finding #12) — quote fields containing commas
  or leading `=`/`+`/`-`/`@` per standard CSV-injection mitigation.
- Notification icon pointing at `manifest.json` instead of a real image,
  and the referenced `icon-192.png`/`icon-512.png` not existing in `public/`
  (finding #11) — add the actual icon assets.
- Camera stream cleanup race (finding #5) and force-sync-wipes-queue race
  (finding #6) are substantially defused by the idempotency change above
  (retries are safe), but the camera cleanup race is a separate client-only
  bug worth fixing directly (track the stream via a ref, not a `let` closed
  over by an async callback).

Build: `npm run build` in `frontend/`, output copied into
`static/src/pwa/` (not installed/versioned as part of the Odoo module's
Python path — a build step, not source-controlled duplication).

## Testing

Odoo integration tests (`--test-enable --no-http` against a scratch database,
per the standing QNAP/Odoo testing pattern — zero production downtime),
covering:
- Duplicate `capture_uuid` submission is deduped, not double-created.
- `update_shelf`/`flag_damage` actually persist and are visible via
  `pwa_feed`.
- A simulated vision-scan failure (bad/missing key) returns a real error,
  never fabricated package data.

Frontend: manual smoke pass on the fixed hooks-crash, dead-scan-handler,
and weight-bug paths — the original app had no test harness to extend.

## Out of scope

- Any Marshal.show integration, read-only or otherwise.
- Real Odoo inventory (`stock.picking`/`stock.move`) integration.
- Push notification delivery infrastructure beyond what already existed
  (the service worker's push/notificationclick handlers are kept, only the
  broken icon asset is fixed).
- A specific deploy target instance.
