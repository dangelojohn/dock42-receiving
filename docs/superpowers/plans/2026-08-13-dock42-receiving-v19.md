# dock42_receiving v19 CE Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `dock-42-receiving` as `dock42_receiving`, a native Odoo v19 CE addon with server-side idempotent capture (porting porterly_inbound_pwa's pattern, corrected for v19), fixing all 15 bugs found in code review.

**Architecture:** Odoo controllers + models replace the old Express/mock-sync backend entirely; the existing React 19/Vite frontend is kept and fixed, built as static assets served by an Odoo controller route, same pattern porterly_inbound_pwa uses for its `index.html`.

**Tech Stack:** Odoo 19 CE (Python), `google-genai` (Python, server-side Gemini vision), React 19 + TypeScript + Vite (frontend, kept from original), Tailwind CSS.

## Global Constraints

- Odoo version floor: v19 CE. Do not use `_sql_constraints` — silently ignored in v19; use `models.Constraint` instead (spec: Idempotency section).
- No Marshal.show coupling of any kind — no API calls to Marshal, no shared models (spec: Explicitly resolved decisions).
- `dock42.package` is a standalone model — do not create `stock.picking`/`stock.move` records (spec: Data model).
- No deploy-target-specific assumptions (no Southbrook-specific model references) (spec: Explicitly resolved decisions).
- Gemini API failures must return/raise a real error — never fabricate label data with `success: true` (spec: Controllers section; this is the direct fix for review finding #14).
- Project root: `/Users/naadmin/Downloads/dock42-receiving` (git repo, spec already committed at `docs/superpowers/specs/2026-08-13-dock42-receiving-v19-design.md`).
- Original buggy prototype (reference for frontend fixes): `/private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/dock-42-receiving/`.
- Porterly reference (pattern source, v16 — adapt, do not copy verbatim): `/private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/porterly_inbound_pwa_ref/`.

---

## Task 1: Module skeleton

**Files:**
- Create: `dock42_receiving/__init__.py`
- Create: `dock42_receiving/__manifest__.py`
- Create: `dock42_receiving/controllers/__init__.py`
- Create: `dock42_receiving/models/__init__.py`
- Create: `dock42_receiving/tests/__init__.py`

**Interfaces:**
- Produces: an installable, empty Odoo addon named `dock42_receiving` that later tasks add models/controllers/tests into.

- [ ] **Step 1: Create the manifest**

```python
# dock42_receiving/__manifest__.py
{
    'name': 'Dock 42 Receiving',
    'version': '19.0.1.0.0',
    'summary': 'Warehouse dock receiving PWA: camera capture, offline-safe idempotent sync, damage reporting.',
    'category': 'Inventory/Inventory',
    'depends': ['base', 'web'],
    'data': [
    ],
    'external_dependencies': {
        'python': ['google-genai'],
    },
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
```

**Sequencing note:** `data` starts empty. Task 2 adds
`'security/ir.model.access.csv'` to this list in the same commit that
creates that file. Task 5 adds `'data/ir_config_parameter.xml'` to this
list in the same commit that creates that file. Do not list a data file
here before the task that creates it — Tasks 1 through 4 each run a real
`-i dock42_receiving` install as part of their own verification, and a
manifest referencing a file that doesn't exist yet fails installation with
`FileNotFoundError`, not a graceful skip. (This note was added after Task
1's own review surfaced the bug directly against a real install; it is
already correctly reflected in the actual committed code as of Tasks 1-2 —
this edit just brings the plan document itself back in sync after an
earlier uncommitted copy of this same fix was lost.)

- [ ] **Step 2: Create empty `__init__.py` files**

```python
# dock42_receiving/__init__.py
from . import controllers
from . import models
```

```python
# dock42_receiving/controllers/__init__.py
```

```python
# dock42_receiving/models/__init__.py
```

```python
# dock42_receiving/tests/__init__.py
```

- [ ] **Step 3: Verify the module installs**

Run (adjust `odoo-bin` path and `-d` database name to your v19 CE instance):
```bash
odoo-bin -d dock42_test -i dock42_receiving --stop-after-init
```
Expected: process exits 0, no traceback. With `data: []` empty, this
install has nothing to fail on and should succeed cleanly.

- [ ] **Step 4: Commit**

```bash
cd /Users/naadmin/Downloads/dock42-receiving
git add dock42_receiving/__init__.py dock42_receiving/__manifest__.py \
  dock42_receiving/controllers/__init__.py dock42_receiving/models/__init__.py \
  dock42_receiving/tests/__init__.py
git commit -m "dock42_receiving: module skeleton"
```

---

## Task 2: `dock42.package` model with idempotent capture

**Files:**
- Create: `dock42_receiving/models/dock42_package.py`
- Create: `dock42_receiving/security/ir.model.access.csv`
- Test: `dock42_receiving/tests/test_dock42_package.py`

**Interfaces:**
- Consumes: nothing new (Task 1's empty module).
- Produces: model `dock42.package` with method
  `pwa_create_capture(self, vals: dict) -> dict` returning
  `{'id': int, 'duplicate': bool}`. Later tasks (3, 4) call this method by
  name and rely on this exact return shape.

- [ ] **Step 1: Write the failing test**

```python
# dock42_receiving/tests/test_dock42_package.py
from odoo.tests.common import TransactionCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestDock42PackageCapture(TransactionCase):

    def test_capture_creates_a_new_record(self):
        Package = self.env['dock42.package']
        result = Package.pwa_create_capture({
            'capture_uuid': 'uuid-1',
            'po_number': 'PO-2026-100',
            'vendor': 'Acme Fasteners',
            'item_name': 'Roller Bearings',
            'weight_kg': 12.5,
        })
        self.assertFalse(result['duplicate'])
        record = Package.browse(result['id'])
        self.assertEqual(record.vendor, 'Acme Fasteners')
        self.assertEqual(record.capture_uuid, 'uuid-1')

    def test_duplicate_capture_uuid_is_deduped_not_double_created(self):
        Package = self.env['dock42.package']
        first = Package.pwa_create_capture({
            'capture_uuid': 'uuid-2',
            'po_number': 'PO-2026-101',
            'vendor': 'Apex Industrial',
            'item_name': 'Hydraulic Fittings',
            'weight_kg': 8.0,
        })
        second = Package.pwa_create_capture({
            'capture_uuid': 'uuid-2',
            'po_number': 'PO-2026-999',  # different payload, same uuid
            'vendor': 'Different Vendor',
            'item_name': 'Different Item',
            'weight_kg': 999.0,
        })
        self.assertFalse(first['duplicate'])
        self.assertTrue(second['duplicate'])
        self.assertEqual(first['id'], second['id'])
        count = Package.search_count([('capture_uuid', '=', 'uuid-2')])
        self.assertEqual(count, 1)

    def test_zero_weight_is_preserved_not_replaced(self):
        Package = self.env['dock42.package']
        result = Package.pwa_create_capture({
            'capture_uuid': 'uuid-3',
            'po_number': 'PO-2026-102',
            'vendor': 'Acme Fasteners',
            'item_name': 'Empty Tote',
            'weight_kg': 0,
        })
        record = Package.browse(result['id'])
        self.assertEqual(record.weight_kg, 0)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42PackageCapture --stop-after-init --no-http
```
Expected: FAIL — `KeyError: 'dock42.package'` (model doesn't exist yet).

- [ ] **Step 3: Write the model**

```python
# dock42_receiving/models/dock42_package.py
from odoo import api, fields, models


class Dock42Package(models.Model):
    _name = 'dock42.package'
    _description = 'Dock 42 Received Package'
    _order = 'create_date desc'

    capture_uuid = fields.Char(
        string='Capture UUID', index=True, copy=False,
        help='Client-generated idempotency key for the Dock 42 PWA.')
    po_number = fields.Char(string='PO Number')
    vendor = fields.Char(string='Vendor / Supplier')
    item_name = fields.Char(string='Item Description')
    weight_kg = fields.Float(string='Gross Weight (kg)')
    shelf_location = fields.Char(string='Shelf Bin')
    state = fields.Selection([
        ('draft', 'Draft'),
        ('shelf_pending', 'Shelf Pending'),
        ('stored', 'Stored'),
        ('damaged', 'Damaged'),
    ], string='Status', default='draft')
    captured_by = fields.Many2one('res.users', string='Captured By', copy=False)
    photo_label = fields.Binary(string='Label Photo', attachment=True)
    photo_package = fields.Binary(string='Package Photo', attachment=True)
    photo_shelf = fields.Binary(string='Shelf Photo', attachment=True)
    damage_category = fields.Selection([
        ('crushed_box', 'Crushed Box'),
        ('liquid_leak', 'Liquid Leak'),
        ('missing_content', 'Missing Content'),
        ('label_unreadable', 'Label Unreadable'),
        ('seal_broken', 'Seal Broken'),
    ], string='Damage Category')
    damage_severity = fields.Selection([
        ('minor', 'Minor'),
        ('major', 'Major'),
        ('critical_quarantine', 'Critical / Quarantine'),
    ], string='Damage Severity')
    damage_notes = fields.Text(string='Damage Notes')

    _capture_uuid_uniq = models.Constraint(
        'UNIQUE(capture_uuid)',
        'A package with this capture UUID already exists (idempotency guard).',
    )

    def _strip_b64(self, value):
        """Accept a data-URI or bare base64; return bare base64 for a Binary field."""
        if value and isinstance(value, str) and ',' in value[:64]:
            return value.split(',', 1)[1]
        return value

    @api.model
    def pwa_create_capture(self, vals):
        """Idempotent create from the Dock 42 PWA.

        If `capture_uuid` matches an existing record, that record is
        returned with duplicate=True and nothing new is created — the
        client can retry a submit blindly and it is always safe.
        """
        vals = vals or {}
        uuid = vals.get('capture_uuid')
        if uuid:
            existing = self.search([('capture_uuid', '=', uuid)], limit=1)
            if existing:
                return {'id': existing.id, 'duplicate': True}

        create_vals = {
            'capture_uuid': uuid or False,
            'captured_by': self.env.user.id,
            'state': 'shelf_pending',
        }
        for key in ('po_number', 'vendor', 'item_name', 'shelf_location'):
            if vals.get(key):
                create_vals[key] = vals[key]
        if 'weight_kg' in vals and vals['weight_kg'] is not None:
            try:
                create_vals['weight_kg'] = float(vals['weight_kg'])
            except (TypeError, ValueError):
                pass
        for key in ('photo_label', 'photo_package', 'photo_shelf'):
            if vals.get(key):
                create_vals[key] = self._strip_b64(vals[key])

        record = self.create(create_vals)
        record.message_post(body='Captured via Dock 42 PWA by %s.' % self.env.user.name)
        return {'id': record.id, 'duplicate': False}
```

- [ ] **Step 4: Create the ACL file and register it in the manifest (required for the model to be usable)**

```csv
# dock42_receiving/security/ir.model.access.csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_dock42_package_user,dock42.package.user,model_dock42_package,base.group_user,1,1,1,0
```

Task 1 shipped `__manifest__.py` with an empty `'data': []` list
deliberately — this file didn't exist yet at that point. Update the
manifest now that it does:

```python
    'data': [
        'security/ir.model.access.csv',
    ],
```

- [ ] **Step 5: Run test to verify it passes**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42PackageCapture --stop-after-init --no-http
```
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add dock42_receiving/models/dock42_package.py \
  dock42_receiving/security/ir.model.access.csv \
  dock42_receiving/__manifest__.py \
  dock42_receiving/tests/test_dock42_package.py
git commit -m "dock42_receiving: idempotent dock42.package model (v19 models.Constraint)"
```

---

## Task 3: Shelf/damage update and feed methods

**Files:**
- Modify: `dock42_receiving/models/dock42_package.py`
- Test: `dock42_receiving/tests/test_dock42_package.py`

**Interfaces:**
- Consumes: `dock42.package` from Task 2.
- Produces: `pwa_add_shelf(self, package_id: int, photo_shelf: str|bool) -> dict`
  returning `{'ok': bool}`; `pwa_toggle_flag(self, package_id: int) -> dict`
  returning `{'ok': bool, 'flagged': bool}` (repurposing `state='damaged'`
  as the flag, toggling back to `'stored'`); `pwa_feed(self, limit=25) -> list[dict]`.
  Controllers (Task 4) call these by name.

- [ ] **Step 1: Write the failing tests**

Append to `dock42_receiving/tests/test_dock42_package.py`:

```python
    def test_add_shelf_persists_and_marks_stored(self):
        Package = self.env['dock42.package']
        created = Package.pwa_create_capture({
            'capture_uuid': 'uuid-shelf-1', 'vendor': 'Acme', 'item_name': 'Widget',
        })
        record = Package.browse(created['id'])
        result = record.pwa_add_shelf('BAY-04-A2')
        self.assertTrue(result['ok'])
        self.assertEqual(record.shelf_location, 'BAY-04-A2')
        self.assertEqual(record.state, 'stored')

    def test_toggle_flag_sets_and_clears_damaged_state(self):
        Package = self.env['dock42.package']
        created = Package.pwa_create_capture({
            'capture_uuid': 'uuid-flag-1', 'vendor': 'Acme', 'item_name': 'Widget',
        })
        record = Package.browse(created['id'])
        first = record.pwa_toggle_flag()
        self.assertTrue(first['ok'])
        self.assertTrue(first['flagged'])
        self.assertEqual(record.state, 'damaged')

        second = record.pwa_toggle_flag()
        self.assertFalse(second['flagged'])
        self.assertEqual(record.state, 'stored')

    def test_feed_returns_recent_captures_newest_first(self):
        Package = self.env['dock42.package']
        Package.pwa_create_capture({'capture_uuid': 'uuid-feed-1', 'vendor': 'A', 'item_name': 'First'})
        Package.pwa_create_capture({'capture_uuid': 'uuid-feed-2', 'vendor': 'B', 'item_name': 'Second'})
        feed = Package.pwa_feed(limit=2)
        self.assertEqual(len(feed), 2)
        self.assertEqual(feed[0]['item_name'], 'Second')
        self.assertIn('vendor', feed[0])
        self.assertIn('state', feed[0])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42PackageCapture --stop-after-init --no-http
```
Expected: FAIL — `AttributeError: 'dock42.package' object has no attribute 'pwa_add_shelf'`.

- [ ] **Step 3: Add the methods**

Add to `dock42_receiving/models/dock42_package.py`, inside the `Dock42Package` class:

```python
    def pwa_add_shelf(self, photo_shelf=None):
        """Assign/confirm the shelf bin for this record, mark it stored."""
        self.ensure_one()
        vals = {'state': 'stored'}
        if photo_shelf:
            vals['photo_shelf'] = self._strip_b64(photo_shelf)
        self.write(vals)
        self.message_post(body='Shelf bin updated via Dock 42 PWA by %s.' % self.env.user.name)
        return {'ok': True}

    def pwa_toggle_flag(self):
        """Toggle the damaged state on this record."""
        self.ensure_one()
        new_state = 'stored' if self.state == 'damaged' else 'damaged'
        self.state = new_state
        flagged = new_state == 'damaged'
        if flagged:
            self.message_post(body='Flagged damaged via Dock 42 PWA by %s.' % self.env.user.name)
        else:
            self.message_post(body='Damage flag cleared by %s.' % self.env.user.name)
        return {'ok': True, 'flagged': flagged}

    @api.model
    def pwa_feed(self, limit=25):
        records = self.search([], order='create_date desc', limit=int(limit or 25))
        return [{
            'id': r.id,
            'po_number': r.po_number or '',
            'vendor': r.vendor or '',
            'item_name': r.item_name or '',
            'weight_kg': r.weight_kg,
            'shelf_location': r.shelf_location or '',
            'state': r.state,
            'captured_by': r.captured_by.name if r.captured_by else '',
        } for r in records]
```

Note: `pwa_add_shelf` and `pwa_toggle_flag` update `shelf_location` and
`state` — the first test above sets `shelf_location` via `write` directly in
`pwa_add_shelf`, matching the call shape `record.pwa_add_shelf('BAY-04-A2')`
where the argument is the shelf location string. Adjust the signature to
`pwa_add_shelf(self, shelf_location, photo_shelf=None)` and set
`vals['shelf_location'] = shelf_location` — the version above only handles
the photo; fix it to match the test:

```python
    def pwa_add_shelf(self, shelf_location, photo_shelf=None):
        self.ensure_one()
        vals = {'state': 'stored', 'shelf_location': shelf_location}
        if photo_shelf:
            vals['photo_shelf'] = self._strip_b64(photo_shelf)
        self.write(vals)
        self.message_post(body='Shelf bin updated via Dock 42 PWA by %s.' % self.env.user.name)
        return {'ok': True}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42PackageCapture --stop-after-init --no-http
```
Expected: PASS — 6 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add dock42_receiving/models/dock42_package.py dock42_receiving/tests/test_dock42_package.py
git commit -m "dock42_receiving: shelf/damage update and feed methods"
```

---

## Task 4: Controllers — auth, capture/shelf/flag/feed routes

**Files:**
- Create: `dock42_receiving/controllers/main.py`
- Create: `dock42_receiving/static/src/pwa/.gitkeep` (placeholder until Task 8 builds real assets into this path)
- Test: `dock42_receiving/tests/test_dock42_controllers.py`

**Interfaces:**
- Consumes: `dock42.package.pwa_create_capture/pwa_add_shelf/pwa_toggle_flag/pwa_feed` from Tasks 2–3.
- Produces: HTTP routes `GET /dock42`, `POST /dock42/api/capture`,
  `POST /dock42/api/update_shelf`, `POST /dock42/api/flag_damage`,
  `GET /dock42/api/feed`. Task 5 adds `/dock42/api/scan-label` to this same
  file/class.

- [ ] **Step 1: Write the failing test**

```python
# dock42_receiving/tests/test_dock42_controllers.py
from odoo.tests.common import HttpCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestDock42Controllers(HttpCase):

    def test_app_route_redirects_anonymous_to_login(self):
        res = self.url_open('/dock42', allow_redirects=False)
        self.assertEqual(res.status_code, 303)
        self.assertIn('/web/login', res.headers.get('Location', ''))

    def test_capture_api_requires_operator(self):
        res = self.url_open(
            '/dock42/api/capture', data='{}',
            headers={'Content-Type': 'application/json'},
        )
        # Odoo JSON controllers return 200 with an error envelope, or raise
        # AccessError surfaced as a JSON-RPC error — assert it's not a
        # silent success.
        self.assertNotEqual(res.status_code, 200 if b'"result"' in res.content else -1)

    def test_capture_api_creates_record_when_authenticated(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/capture',
            data='{"jsonrpc":"2.0","method":"call","params":{"capture_uuid":"http-uuid-1","vendor":"Acme","item_name":"Widget"}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['duplicate'])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42Controllers --stop-after-init
```
(Note: omit `--no-http` here — `HttpCase` needs the test HTTP server.)
Expected: FAIL — 404, no `/dock42` route registered yet.

- [ ] **Step 3: Write the controller**

```python
# dock42_receiving/controllers/main.py
import os

from odoo import http
from odoo.http import request
from odoo.exceptions import AccessError

_MODULE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PWA_INDEX = os.path.join(_MODULE_DIR, 'static', 'src', 'pwa', 'index.html')


def _is_operator():
    """Some instances let auth='user' fall through to the Public user
    instead of redirecting to login — enforce it explicitly rather than
    trust auth='user' alone. Same workaround porterly_inbound_pwa uses."""
    user = request.env.user
    return bool(user) and (not user._is_public()) and user.has_group('base.group_user')


class Dock42PWA(http.Controller):

    @http.route('/dock42', type='http', auth='user', website=False, csrf=False)
    def dock42_app(self, **kw):
        if not _is_operator():
            return request.redirect('/web/login?redirect=%2Fdock42')
        with open(_PWA_INDEX, 'r') as f:
            html = f.read()
        return request.make_response(html, headers=[
            ('Content-Type', 'text/html; charset=utf-8'),
            ('Cache-Control', 'no-store'),
        ])

    @http.route('/dock42/api/capture', type='json', auth='user', methods=['POST'])
    def capture(self, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        return request.env['dock42.package'].pwa_create_capture(kw)

    @http.route('/dock42/api/update_shelf', type='json', auth='user', methods=['POST'])
    def update_shelf(self, package_id=None, shelf_location=None, photo_shelf=None, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        record = request.env['dock42.package'].browse(int(package_id))
        if not record.exists():
            return {'ok': False}
        return record.pwa_add_shelf(shelf_location, photo_shelf)

    @http.route('/dock42/api/flag_damage', type='json', auth='user', methods=['POST'])
    def flag_damage(self, package_id=None, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        record = request.env['dock42.package'].browse(int(package_id))
        if not record.exists():
            return {'ok': False}
        return record.pwa_toggle_flag()

    @http.route('/dock42/api/feed', type='json', auth='user')
    def feed(self, limit=25, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        return request.env['dock42.package'].pwa_feed(limit=limit)
```

- [ ] **Step 4: Create the static placeholder so the app route doesn't 500 in tests**

The `test_app_route_redirects_anonymous_to_login` test never reaches the
`open(_PWA_INDEX)` call (it 303-redirects before that), so a placeholder is
sufficient for this task. Task 8 replaces it with the real built app.

```bash
mkdir -p dock42_receiving/static/src/pwa
touch dock42_receiving/static/src/pwa/.gitkeep
```

- [ ] **Step 5: Run test to verify it passes**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42Controllers --stop-after-init
```
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add dock42_receiving/controllers/main.py dock42_receiving/static/src/pwa/.gitkeep \
  dock42_receiving/tests/test_dock42_controllers.py
git commit -m "dock42_receiving: controllers for app shell, capture, shelf, flag, feed"
```

---

## Task 5: Gemini vision scan endpoint (server-side, real error handling)

**Files:**
- Modify: `dock42_receiving/controllers/main.py`
- Create: `dock42_receiving/data/ir_config_parameter.xml`
- Test: `dock42_receiving/tests/test_dock42_scan_label.py`

**Interfaces:**
- Consumes: `ir.config_parameter` key `dock42_receiving.gemini_api_key`.
- Produces: `POST /dock42/api/scan-label` — on success returns
  `{'success': True, 'vendor': str, 'item_name': str, 'weight_kg': float,
  'po_number': str, 'shelf_location': str, 'is_damaged': bool, 'notes': str}`;
  on any failure returns `{'success': False, 'error': str}` with the
  appropriate HTTP status — **never** fabricated label data with
  `success: True` (this is the direct fix for review finding #14, and the
  opposite of the original `server.ts` catch-block behavior).

- [ ] **Step 1: Write the failing tests**

```python
# dock42_receiving/tests/test_dock42_scan_label.py
from unittest.mock import patch
from odoo.tests.common import HttpCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestDock42ScanLabel(HttpCase):

    def test_scan_label_without_api_key_returns_real_error_not_fake_data(self):
        self.env['ir.config_parameter'].sudo().set_param(
            'dock42_receiving.gemini_api_key', '')
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/scan-label',
            data='{"jsonrpc":"2.0","method":"call","params":{}}',
            headers={'Content-Type': 'application/json'},
        )
        body = res.json()
        result = body.get('result', body.get('error'))
        # Whichever shape it comes back as, it must NOT claim success with
        # fabricated vendor/item data.
        self.assertNotIn('vendor', str(result)) if isinstance(result, dict) and result.get('success') else None
        if isinstance(result, dict):
            self.assertFalse(result.get('success', False))
            self.assertIn('error', result)

    @patch('odoo.addons.dock42_receiving.controllers.main._call_gemini_vision')
    def test_scan_label_with_mocked_success(self, mock_call):
        mock_call.return_value = {
            'vendor': 'Acme Fasteners', 'item_name': 'Roller Bearings',
            'weight_kg': 12.5, 'po_number': 'PO-2026-100',
            'shelf_location': 'A-01-01', 'is_damaged': False, 'notes': 'ok',
        }
        self.env['ir.config_parameter'].sudo().set_param(
            'dock42_receiving.gemini_api_key', 'fake-key-for-test')
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/scan-label',
            data='{"jsonrpc":"2.0","method":"call","params":{"image_base64":"Zm9v"}}',
            headers={'Content-Type': 'application/json'},
        )
        body = res.json()
        self.assertTrue(body['result']['success'])
        self.assertEqual(body['result']['vendor'], 'Acme Fasteners')
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42ScanLabel --stop-after-init
```
Expected: FAIL — 404, route doesn't exist yet.

- [ ] **Step 3: Add the config parameter default and register it in the manifest**

```xml
<!-- dock42_receiving/data/ir_config_parameter.xml -->
<odoo>
    <record id="dock42_gemini_api_key_default" model="ir.config_parameter">
        <field name="key">dock42_receiving.gemini_api_key</field>
        <field name="value"></field>
    </record>
</odoo>
```

Add this file to the manifest's `data` list (which currently holds only
`'security/ir.model.access.csv'` from Task 2):

```python
    'data': [
        'security/ir.model.access.csv',
        'data/ir_config_parameter.xml',
    ],
```

- [ ] **Step 4: Add the vision-scan controller method**

Add to `dock42_receiving/controllers/main.py`, above the `Dock42PWA` class:

```python
import base64
import logging

from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

_SCAN_PROMPT = (
    "You are an AI optical label scanner for a warehouse dock receiving "
    "station. Analyze the provided photo of a package label and extract "
    "or infer: vendor, item_name, weight_kg, po_number, shelf_location "
    "(a plausible warehouse bin code), is_damaged (true if the image shows "
    "a crushed carton, tear, or leak), and notes (a short receiving-condition "
    "note)."
)


def _call_gemini_vision(api_key, image_b64, mime_type='image/jpeg'):
    """Call Gemini vision for label extraction. Raises on any failure —
    callers must not convert exceptions into fabricated success data."""
    from google import genai
    from google.genai import types
    from pydantic import BaseModel

    class LabelScan(BaseModel):
        vendor: str
        item_name: str
        weight_kg: float
        po_number: str = ''
        shelf_location: str = ''
        is_damaged: bool = False
        notes: str = ''

    client = genai.Client(api_key=api_key)
    contents = [_SCAN_PROMPT]
    if image_b64:
        raw = base64.b64decode(image_b64)
        contents.append(types.Part.from_bytes(data=raw, mime_type=mime_type))

    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=contents,
        config={'response_mime_type': 'application/json'},
    )
    parsed = LabelScan.model_validate_json(response.text)
    return parsed.model_dump()
```

Add the route inside the `Dock42PWA` class:

```python
    @http.route('/dock42/api/scan-label', type='json', auth='user', methods=['POST'])
    def scan_label(self, image_base64=None, mime_type='image/jpeg', **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')

        api_key = request.env['ir.config_parameter'].sudo().get_param(
            'dock42_receiving.gemini_api_key')
        if not api_key:
            return {'success': False, 'error': 'Gemini API key is not configured. '
                    'Set it under Settings before using label scanning.'}

        try:
            data = _call_gemini_vision(api_key, image_base64, mime_type)
        except Exception as exc:  # noqa: BLE001 - deliberately broad: any
            # failure here (bad key, model rejection, network timeout,
            # malformed response) must surface as a real error, never as
            # fabricated label data with success=True.
            _logger.warning('Gemini vision scan failed: %s', exc)
            return {'success': False, 'error': 'Vision scan failed: %s' % exc}

        return {'success': True, **data}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
odoo-bin -d dock42_test -i dock42_receiving --test-enable \
  --test-tags /dock42_receiving:TestDock42ScanLabel --stop-after-init
```
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 6: Install the Python dependency on the target instance**

```bash
pip install google-genai pydantic
```
(Document this in the module's `README.rst` if one is added later — not
required for this task.)

- [ ] **Step 7: Commit**

```bash
git add dock42_receiving/controllers/main.py dock42_receiving/data/ir_config_parameter.xml \
  dock42_receiving/__manifest__.py dock42_receiving/tests/test_dock42_scan_label.py
git commit -m "dock42_receiving: server-side Gemini vision scan, real error handling"
```

---

## Task 6: Copy and fix the React frontend — crash and data bugs

**Files:**
- Create: `dock42_receiving/frontend/` (copy of the original app's `src/`, `public/`, config files)
- Modify: `dock42_receiving/frontend/src/components/PackageDetailModal.tsx`
- Modify: `dock42_receiving/frontend/src/components/CaptureStrip.tsx`
- Modify: `dock42_receiving/frontend/src/components/CameraViewfinder.tsx`
- Modify: `dock42_receiving/frontend/src/App.tsx`

**Interfaces:**
- Consumes: original source at
  `/private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/dock-42-receiving/`.
- Produces: a `frontend/` tree with the two app-breaking bugs and the
  dead-code capture path fixed. Task 7 continues fixing the remaining
  frontend findings in this same tree.

- [ ] **Step 1: Copy the original frontend source**

```bash
cd /Users/naadmin/Downloads/dock42-receiving
mkdir -p dock42_receiving/frontend
cp -R /private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/dock-42-receiving/src \
  dock42_receiving/frontend/src
cp -R /private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/dock-42-receiving/public \
  dock42_receiving/frontend/public
cp /private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/dock-42-receiving/index.html \
  dock42_receiving/frontend/index.html
cp /private/tmp/claude-502/-Users-naadmin/f3fe2442-cfc6-4956-a7f3-4baf9a868a1c/scratchpad/dock-42-receiving/tsconfig.json \
  dock42_receiving/frontend/tsconfig.json
git add dock42_receiving/frontend
git commit -m "dock42_receiving: import original frontend source as base for fixes"
```

- [ ] **Step 2: Fix the Rules-of-Hooks crash (finding #1)**

In `dock42_receiving/frontend/src/components/PackageDetailModal.tsx`,
move the early return after the hooks. Replace lines 12–20:

```tsx
export const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  pkg,
  onClose,
  onUpdateShelf,
  onToggleDamage,
}) => {
  if (!pkg) return null;

  const [shelfInput, setShelfInput] = useState(pkg.shelfLocation);
  const [copiedBanner, setCopiedBanner] = useState(false);
```

with:

```tsx
export const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  pkg,
  onClose,
  onUpdateShelf,
  onToggleDamage,
}) => {
  const [shelfInput, setShelfInput] = useState(pkg?.shelfLocation ?? '');
  const [copiedBanner, setCopiedBanner] = useState(false);

  if (!pkg) return null;
```

This also sets up finding #13 (stale shelf input across packages) — fixed
in Step 3 below by keying the component per-package from the parent instead
of relying on the initializer to resync.

- [ ] **Step 3: Fix stale shelf-input state across packages (finding #13)**

In `dock42_receiving/frontend/src/App.tsx`, find the `PackageDetailModal`
render (around line 349) and add a `key` so React remounts the component
(and thus re-runs the `useState` initializer) whenever the selected package
changes:

```tsx
      {/* Package Detail Drawer / Modal */}
      <PackageDetailModal
        key={selectedPackage?.id ?? 'none'}
        pkg={selectedPackage}
        onClose={() => setSelectedPackage(null)}
        onUpdateShelf={handleUpdateShelf}
        onToggleDamage={handleToggleDamage}
      />
```

- [ ] **Step 4: Wire the real scan handler instead of the dead-code/fake-data path (finding #2)**

`CameraViewfinder.tsx`'s `handleTriggerScan` (the function that captures a
real frame and calls `/api/scan-label`) is never invoked — `CaptureStrip`'s
capture button calls `onTriggerCapture()` directly, which App.tsx wires to
`handleCaptureScan()` with no arguments, producing fabricated data.

The fix: `CameraViewfinder` owns the camera and the scan call, so
`CaptureStrip`'s capture button must trigger `CameraViewfinder`'s handler,
not `App`'s directly. Restructure so `App` passes a ref-based trigger down.

In `dock42_receiving/frontend/src/components/CameraViewfinder.tsx`, change
the component to accept a trigger ref and expose `handleTriggerScan` through
it. Replace lines 1–13:

```tsx
import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Camera, Upload, RefreshCw, Zap, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PackageItem } from '../types';

interface CameraViewfinderProps {
  onCaptureScan: (scannedData?: Partial<PackageItem>) => void;
  isScanningAI: boolean;
}

export interface CameraViewfinderHandle {
  triggerScan: () => void;
}

export const CameraViewfinder = forwardRef<CameraViewfinderHandle, CameraViewfinderProps>(({
  onCaptureScan,
  isScanningAI,
}, ref) => {
```

Add, right after the `handleTriggerScan` function definition (after the
closing brace that currently ends around line 110), before
`handleFileUpload`:

```tsx
  useImperativeHandle(ref, () => ({
    triggerScan: handleTriggerScan,
  }));

```

Change the final closing of the component (currently `};` at the end of the
file) to close the `forwardRef` call instead:

```tsx
});
```

In `dock42_receiving/frontend/src/App.tsx`, import `useRef` (already
imported from React) and the new handle type, create the ref, pass it to
`CameraViewfinder`, and call `.triggerScan()` from the capture strip instead
of `handleCaptureScan` directly:

```tsx
import { CameraViewfinder, CameraViewfinderHandle } from './components/CameraViewfinder';
```

Inside the `App` function body, add:

```tsx
  const cameraRef = React.useRef<CameraViewfinderHandle>(null);
```

Update the `CameraViewfinder` render:

```tsx
            <CameraViewfinder
              ref={cameraRef}
              onCaptureScan={handleCaptureScan}
              isScanningAI={isScanningAI}
            />
```

Update the `CaptureStrip` render so its capture button triggers the camera's
real scan instead of fabricating data directly:

```tsx
            <CaptureStrip
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
              onTriggerCapture={() => cameraRef.current?.triggerScan()}
            />
```

`handleCaptureScan` in `App.tsx` remains the callback that receives real
scanned data from `CameraViewfinder.onCaptureScan(...)` — it's no longer
called directly with zero args from the capture strip, so the
`scannedData?.field || fallback` pattern only ever fires when a field is
genuinely absent from a real (or upload-path) scan result, not on every tap.

- [ ] **Step 5: Fix the `||` vs `??` weight bug (finding #9)**

In `dock42_receiving/frontend/src/App.tsx`, in `handleCaptureScan`, change:

```tsx
      weightKg: scannedData?.weightKg || 15.2,
```

to:

```tsx
      weightKg: scannedData?.weightKg ?? 15.2,
```

- [ ] **Step 6: Add a reentrancy guard on the capture button (finding #8)**

In `dock42_receiving/frontend/src/components/CaptureStrip.tsx`, add an
`isScanningAI` prop and disable the button while a scan is in flight.
Replace lines 5–15:

```tsx
interface CaptureStripProps {
  currentStep: CaptureStep;
  onSelectStep: (step: CaptureStep) => void;
  onTriggerCapture: () => void;
  isScanningAI: boolean;
}

export const CaptureStrip: React.FC<CaptureStripProps> = ({
  currentStep,
  onSelectStep,
  onTriggerCapture,
  isScanningAI,
}) => {
```

Replace the Segment 2 button's `onClick` (lines 38–42):

```tsx
        <button
          disabled={isScanningAI}
          onClick={() => {
            if (isScanningAI) return;
            onSelectStep('PACKAGE');
            onTriggerCapture();
          }}
```

And in `App.tsx`, pass the prop through:

```tsx
            <CaptureStrip
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
              onTriggerCapture={() => cameraRef.current?.triggerScan()}
              isScanningAI={isScanningAI}
            />
```

- [ ] **Step 7: Manual verification**

```bash
cd dock42_receiving/frontend
npm install
npm run dev
```
Open the app in a browser. Verify:
1. Tap any package in the Arrived Today list or Inbound view — the app
   must **not** crash (finding #1 fix).
2. Tap "TAP TO CAPTURE" twice quickly — only one new package record should
   be created, not two (finding #8 fix; full server-side guarantee lands
   in Task 7 once real API calls replace the mock, but the client-side
   double-fire is prevented here).
3. Open package A, note its shelf field, close, open package B — the shelf
   field must show B's value, not A's leftover text (finding #13 fix).

- [ ] **Step 8: Commit**

```bash
git add dock42_receiving/frontend/src
git commit -m "dock42_receiving/frontend: fix hooks crash, dead scan handler, weight bug, stale shelf input, double-tap guard"
```

---

## Task 7: Rewire frontend to real Odoo endpoints, remove fake offline-queue-as-truth

**Files:**
- Modify: `dock42_receiving/frontend/src/App.tsx`
- Modify: `dock42_receiving/frontend/src/utils/indexedDB.ts`
- Modify: `dock42_receiving/frontend/src/components/BottomNavBar.tsx`
- Modify: `dock42_receiving/frontend/src/components/InboundView.tsx`
- Modify: `dock42_receiving/frontend/src/components/CameraViewfinder.tsx`
- Modify: `dock42_receiving/frontend/public/manifest.json` (verify only — already correct)
- Modify: `dock42_receiving/frontend/public/sw.js`
- Create: `dock42_receiving/frontend/public/icon-192.png`
- Create: `dock42_receiving/frontend/public/icon-512.png`

**Interfaces:**
- Consumes: `/dock42/api/capture`, `/dock42/api/update_shelf`,
  `/dock42/api/flag_damage`, `/dock42/api/feed`, `/dock42/api/scan-label`
  from Tasks 4–5 (Odoo JSON-RPC controllers — request body
  `{"jsonrpc":"2.0","method":"call","params":{...}}`, response body
  `{"result": {...}}`).
- Produces: a frontend that talks to the real backend and no longer has a
  separate, driftable "offline queue" data structure as its source of
  truth for sync state.

- [ ] **Step 1: Add a small JSON-RPC helper**

```tsx
// dock42_receiving/frontend/src/utils/odooRpc.ts
export async function odooCall<T = any>(route: string, params: Record<string, any> = {}): Promise<T> {
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.data?.message || body.error.message || 'Request failed');
  }
  return body.result as T;
}
```

- [ ] **Step 2: Replace the fake capture/sync flow in `App.tsx`**

Replace `handleCaptureScan` (original lines 119–175) so it calls the real
capture endpoint with a client-generated `capture_uuid`, instead of
inventing local data and separately tracking an offline queue that can
drift from what actually got sent:

```tsx
import { odooCall } from './utils/odooRpc';

function generateUuid(): string {
  return crypto.randomUUID();
}

  // Handle barcode/package scan capture
  const handleCaptureScan = async (scannedData?: Partial<PackageItem>) => {
    setIsScanningAI(true);
    try {
      const result = await odooCall<{ id: number; duplicate: boolean }>('/dock42/api/capture', {
        capture_uuid: generateUuid(),
        po_number: scannedData?.poNumber,
        vendor: scannedData?.vendor ?? 'Unknown Vendor',
        item_name: scannedData?.itemName ?? 'Unlabeled Item',
        weight_kg: scannedData?.weightKg ?? 0,
        photo_package: scannedData?.imageUrl,
      });
      // Re-fetch the feed so local state always reflects server truth,
      // rather than optimistically constructing a local record that could
      // diverge from what the server actually stored.
      await refreshFeed();
      triggerLocalPushNotification(
        'Package Scanned & Logged',
        `Recorded at ${currentLocation.code}`
      );
      setCurrentStep('SHELF');
    } catch (e) {
      console.warn('Capture failed:', e);
      triggerLocalPushNotification('Capture Failed', String(e));
    } finally {
      setIsScanningAI(false);
    }
  };

  const refreshFeed = async () => {
    const feed = await odooCall<any[]>('/dock42/api/feed', { limit: 50 });
    setPackages(feed.map((r) => ({
      id: String(r.id),
      poNumber: r.po_number,
      vendor: r.vendor,
      itemName: r.item_name,
      weightKg: r.weight_kg,
      timeReceived: '',
      dateReceived: '',
      status: r.state === 'stored' ? 'STORED' : r.state === 'damaged' ? 'DAMAGED' : 'SHELF_PENDING',
      shelfLocation: r.shelf_location,
      labelScanned: true,
      packageCaptured: true,
      shelfAssigned: r.state === 'stored',
      odooSynced: true,
      dockLocation: currentLocation.name,
    })));
  };
```

Replace `handleUpdateShelf` (original lines 196–221) — it currently only
mutates local state and never persists, which is exactly review finding #3
(the UI claims "QUEUED FOR ODOO SYNC" while nothing is sent):

```tsx
  // Update shelf bin — actually persisted, no more local-only mutation
  const handleUpdateShelf = async (pkgId: string, newShelf: string) => {
    await odooCall('/dock42/api/update_shelf', {
      package_id: Number(pkgId),
      shelf_location: newShelf,
    });
    await refreshFeed();
  };
```

Replace `handleToggleDamage` (original lines 224–245) similarly:

```tsx
  const handleToggleDamage = async (pkgId: string) => {
    await odooCall('/dock42/api/flag_damage', { package_id: Number(pkgId) });
    await refreshFeed();
  };
```

Remove `handleForceSync`, the `offlineQueue` state, and the
`getOfflineQueue`/`addToOfflineQueue`/`clearOfflineQueue` imports/calls in
`App.tsx` entirely — there is no longer a separate queue to desync from the
truth (this removes review findings #4 and #6 by construction, per the
spec's Idempotency section). Call `refreshFeed()` once in the startup
`useEffect` alongside `registerServiceWorker()`.

- [ ] **Step 3: Wire the camera's real scan call to the new endpoint**

In `dock42_receiving/frontend/src/components/CameraViewfinder.tsx`,
`handleTriggerScan` currently calls `fetch('/api/scan-label', ...)`
(original line 80). Change the URL and response handling to match the
Odoo JSON-RPC envelope from Task 5:

```tsx
    try {
      const res = await fetch('/dock42/api/scan-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call',
          params: { image_base64: imageBase64?.replace(/^data:image\/\w+;base64,/, '') },
        }),
      });
      const body = await res.json();
      const data = body.result;
      if (data?.success) {
        setLastScannedBanner(`Scanned ${data.vendor}`);
        setTimeout(() => setLastScannedBanner(null), 4000);
        onCaptureScan({
          poNumber: data.po_number,
          vendor: data.vendor,
          itemName: data.item_name,
          weightKg: data.weight_kg,
          shelfLocation: data.shelf_location,
          status: data.is_damaged ? 'DAMAGED' : 'SHELF_PENDING',
          notes: data.notes,
        });
      } else {
        setCameraError(data?.error || 'Scan failed.');
      }
    } catch (e) {
      setCameraError('Scan request failed: ' + e);
    }
```

This removes the client-side "fallback local mock scan" branch (original
lines 103–109) entirely — a failed scan must show an error, not silently
fabricate a package ID, matching the spec's Controllers section requirement.

- [ ] **Step 4: Fix the camera stream cleanup race (finding #5)**

In `dock42_receiving/frontend/src/components/CameraViewfinder.tsx`, the
`useEffect` (lines 22–54) assigns the stream to a local `let stream` only
inside the async `.then()`, so cleanup can run before it's set. Use a ref
instead:

```tsx
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (useRealCamera) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
          setCameraError(null);
        })
        .catch((err) => {
          console.warn('Camera access error:', err);
          setCameraError('Camera access unavailable. Using high-contrast dock viewfinder.');
          setUseRealCamera(false);
        });
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [useRealCamera]);
```

- [ ] **Step 5: Fix bottom nav overlapping open modals (finding #7)**

In `dock42_receiving/frontend/src/components/BottomNavBar.tsx`, change the
nav's z-index (line 17) to sit below modal overlays (`z-50` in
`PackageDetailModal.tsx`/`LocationModal.tsx`):

```tsx
    <nav className="bg-white border-t border-slate-200 fixed bottom-0 w-full z-40 flex justify-around items-center px-2 py-2 select-none pb-safe shadow-lg">
```

- [ ] **Step 6: Fix CSV export escaping (finding #12)**

In `dock42_receiving/frontend/src/components/InboundView.tsx`, replace
`exportCSV` (lines 70–83) with proper field quoting/escaping:

```tsx
  const csvEscape = (value: unknown): string => {
    let s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralize formula injection
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const exportCSV = () => {
    const csvRows = [
      ['Package ID', 'PO Number', 'Vendor', 'Item', 'Weight (kg)', 'Status', 'Shelf Bin', 'Time', 'Odoo Ref'],
      ...filtered.map((p) => [p.id, p.poNumber, p.vendor, p.itemName, p.weightKg, p.status, p.shelfLocation, p.timeReceived, p.odooPickingRef || '']),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `dock42_inbound_manifest_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
```

- [ ] **Step 7: Fix notification icon (finding #11)**

In `dock42_receiving/frontend/src/utils/indexedDB.ts`, fix
`triggerLocalPushNotification` (line 76) to reference a real image, not
`manifest.json`:

```tsx
      reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
      } as NotificationOptions);
```

Generate the actual icon files (`manifest.json` and `sw.js` already
reference `/icon-192.png`/`/icon-512.png` correctly — only the files
themselves are missing):

```bash
cd dock42_receiving/frontend/public
# ImageMagick (commonly available via `brew install imagemagick`):
convert -size 192x192 xc:'#714B67' icon-192.png
convert -size 512x512 xc:'#714B67' icon-512.png
```

If ImageMagick isn't available, use Python + Pillow instead:
```bash
python3 -c "
from PIL import Image
Image.new('RGB', (192, 192), '#714B67').save('icon-192.png')
Image.new('RGB', (512, 512), '#714B67').save('icon-512.png')
"
```
These are solid-color placeholders — swap for a real app icon graphic
whenever one is designed; that's a design task, not a code-correctness one.

- [ ] **Step 8: Add basic shape validation to IndexedDB reads (finding #10)**

In `dock42_receiving/frontend/src/utils/indexedDB.ts`, harden
`getStoredPackages` (lines 6–17):

```tsx
export function getStoredPackages(defaultData: PackageItem[]): PackageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PACKAGES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_PACKAGES, JSON.stringify(defaultData));
      return defaultData;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((p) => typeof p?.id !== 'string')) {
      console.warn('Stored packages failed shape validation, resetting to defaults.');
      return defaultData;
    }
    return parsed;
  } catch (e) {
    return defaultData;
  }
}
```

Note: since Task 7 Step 2 makes `refreshFeed()` (server data) the source of
truth for `packages` rather than local storage, this is now a
defense-in-depth fix for the local cache, not a correctness-critical path.

- [ ] **Step 9: Manual verification**

```bash
npm run dev
```
With a v19 CE instance running and reachable (proxy `/dock42/*` to it in
`vite.config.ts` for local dev — see Task 8), verify:
1. Scanning a package (real camera or upload) creates a record visible via
   `/dock42/api/feed` and in Odoo's own model view.
2. Updating a shelf bin persists across a page reload (confirms it's
   server-backed, not local-only).
3. A scan with a deliberately broken API key shows an error banner, not a
   fabricated package.
4. Opening a modal, the bottom nav no longer visually overlaps it or
   intercepts taps.
5. Export CSV with a vendor name containing a comma — verify the exported
   file opens with correct columns in a spreadsheet app.

- [ ] **Step 10: Commit**

```bash
git add dock42_receiving/frontend
git commit -m "dock42_receiving/frontend: real Odoo endpoints, remove fake offline queue, remaining bug fixes"
```

---

## Task 8: Build wiring — static asset pipeline, end-to-end smoke test

**Files:**
- Create: `dock42_receiving/frontend/package.json`
- Create: `dock42_receiving/frontend/vite.config.ts`
- Modify: `dock42_receiving/frontend/public/sw.js` (cache list only)
- Create: `dock42_receiving/.gitignore` (ignore build output copied into `static/src/pwa`)

**Interfaces:**
- Consumes: the fixed frontend from Tasks 6–7.
- Produces: `npm run build` in `frontend/` outputs a deployable SPA bundle
  into `dock42_receiving/static/src/pwa/`, replacing the placeholder from
  Task 4, servable by the `GET /dock42` controller.

- [ ] **Step 1: Write the frontend-only `package.json`**

The Express-specific dependencies (`express`, `@types/express`, `tsx`,
`esbuild` server bundling, `dotenv`, `@google/genai`) are dropped — there is
no more Node backend; Gemini calls moved server-side into Python in Task 5.

```json
{
  "name": "dock42-receiving-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "motion": "^12.23.24"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2",
    "vite": "^6.2.3"
  }
}
```

- [ ] **Step 2: Write `vite.config.ts`**

Build output goes to `../static/src/pwa` (inside the Odoo module), and dev
mode proxies `/dock42/api/*` to a real Odoo instance so `npm run dev` works
against live data. Replace `<your-odoo-dev-host>` with the actual v19 CE
instance used for development — this is an environment-specific value the
implementer fills in for their own dev setup, not a code placeholder.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../static/src/pwa',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/dock42/api': {
        target: 'http://<your-odoo-dev-host>:8069',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Update the service worker's cache list**

`sw.js`'s `ASSETS_TO_CACHE` (line 3) references `/index.html` and
`/manifest.json` at the root — under the Odoo controller, the app is served
at `/dock42`, so update the cache list to match:

```js
const ASSETS_TO_CACHE = [
  '/dock42',
  '/manifest.json',
];
```

- [ ] **Step 4: Add `.gitignore` for build output**

```
# dock42_receiving/.gitignore
static/src/pwa/*
!static/src/pwa/.gitkeep
frontend/node_modules/
frontend/dist/
```

- [ ] **Step 5: Build and verify the artifact lands where the controller expects it**

```bash
cd dock42_receiving/frontend
npm install
npm run build
ls ../static/src/pwa/
```
Expected: `index.html` and an `assets/` directory now exist under
`dock42_receiving/static/src/pwa/`, replacing the Task 4 `.gitkeep`
placeholder.

- [ ] **Step 6: End-to-end smoke test against a real v19 CE instance**

```bash
odoo-bin -d dock42_test -i dock42_receiving --stop-after-init
odoo-bin -d dock42_test --http-port=8069 &
```
Then in a browser: log in as an operator, navigate to `/dock42`, and walk
through the full flow once: scan (or upload) a label → verify it appears
in the feed → assign a shelf bin → verify it persists after a page reload →
flag it damaged → verify the flag persists → export the CSV manifest.

- [ ] **Step 7: Commit**

```bash
cd /Users/naadmin/Downloads/dock42-receiving
git add dock42_receiving/frontend/package.json dock42_receiving/frontend/vite.config.ts \
  dock42_receiving/frontend/public/sw.js dock42_receiving/.gitignore
git commit -m "dock42_receiving: frontend build pipeline wired to static/src/pwa"
```

---

## Self-Review Notes

**Spec coverage:** Architecture (Tasks 1, 4, 8) · Data model (Task 2) ·
Idempotency (Task 2, using `models.Constraint` per the v19 correction) ·
Controllers (Tasks 4–5) · Frontend fixes #1–#13 (Tasks 6–7; #4 and #6 are
resolved structurally by Task 7 Step 2's removal of the offline-queue
duality rather than by a standalone patch — noted inline in that step) ·
Testing (Odoo integration tests in Tasks 2–5; manual smoke passes in Tasks
6–8, matching the spec's explicit scope decision not to build a frontend
test harness) · Out of scope items (Marshal, stock.picking) — untouched by
any task, consistent with the spec.

**Type consistency check:** `pwa_create_capture` returns
`{'id': int, 'duplicate': bool}` in Task 2 and is consumed with that exact
shape in Task 4's controller and Task 7's frontend `odooCall<{ id: number;
duplicate: boolean }>`. `pwa_add_shelf(shelf_location, photo_shelf=None)`
signature in Task 3 matches the controller's keyword call in Task 4 and the
frontend's `{ package_id, shelf_location }` params in Task 7. `pwa_feed`'s
returned dict keys (`po_number`, `item_name`, `weight_kg`, `shelf_location`,
`state`) match what Task 7's `refreshFeed()` reads.
