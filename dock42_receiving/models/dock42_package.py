import psycopg2

from odoo import api, fields, models
from odoo.tools import mute_logger


class Dock42Package(models.Model):
    _name = 'dock42.package'
    _description = 'Dock 42 Received Package'
    _order = 'create_date desc'
    _inherit = ['mail.thread']

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
            'state': 'damaged' if vals.get('initial_damaged') else 'shelf_pending',
        }
        for key in ('po_number', 'vendor', 'item_name', 'shelf_location'):
            if vals.get(key):
                create_vals[key] = vals[key]
        if vals.get('notes'):
            # The only free-text note field on this model today is
            # damage_notes; an AI-flagged-damaged capture's receiving-
            # condition note lands here so it isn't silently discarded.
            create_vals['damage_notes'] = vals['notes']
        if 'weight_kg' in vals and vals['weight_kg'] is not None:
            try:
                create_vals['weight_kg'] = float(vals['weight_kg'])
            except (TypeError, ValueError):
                pass
        for key in ('photo_label', 'photo_package', 'photo_shelf'):
            if vals.get(key):
                create_vals[key] = self._strip_b64(vals[key])

        if uuid:
            # Two requests can both pass the search() above before either has
            # committed (a genuine race between concurrent PWA retries). The
            # DB-level UNIQUE(capture_uuid) constraint then rejects the
            # second create() with an IntegrityError. Run it under a
            # savepoint so the failed INSERT rolls back to a clean point
            # instead of poisoning the rest of this transaction (a bare
            # try/except around create() would leave the cursor aborted and
            # fail every subsequent ORM call in this request). Once rolled
            # back, treat it exactly like a search() hit: the other request
            # won the race, so return its row as a duplicate.
            try:
                with mute_logger('odoo.sql_db'), self.env.cr.savepoint():
                    record = self.create(create_vals)
            except psycopg2.IntegrityError:
                existing = self.search([('capture_uuid', '=', uuid)], limit=1)
                if existing:
                    return {'id': existing.id, 'duplicate': True}
                raise
        else:
            record = self.create(create_vals)

        record.message_post(body='Captured via Dock 42 PWA by %s.' % self.env.user.name)
        return {'id': record.id, 'duplicate': False}

    def pwa_add_shelf(self, shelf_location, photo_shelf=None):
        """Assign/confirm the shelf bin for this record, mark it stored."""
        self.ensure_one()
        vals = {'state': 'stored', 'shelf_location': shelf_location}
        if photo_shelf:
            vals['photo_shelf'] = self._strip_b64(photo_shelf)
        self.write(vals)
        self.message_post(body='Shelf bin updated via Dock 42 PWA by %s.' % self.env.user.name)
        return {'ok': True}

    def pwa_report_damage(self, category, severity, notes, photo=None):
        """Persist a damage report for this record — writes the damage
        fields, marks the record damaged, and posts an audit note. This is
        the real write the FlagView UI claims happens; nothing about a
        submit here may be shown to the operator as filed until this
        method has actually run and returned.
        """
        self.ensure_one()
        vals = {
            'state': 'damaged',
            'damage_category': category or False,
            'damage_severity': severity or False,
            'damage_notes': notes or False,
        }
        if photo:
            vals['photo_package'] = self._strip_b64(photo)
        self.write(vals)
        self.message_post(body='Damage reported via Dock 42 PWA by %s.' % self.env.user.name)
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
        """Return recent packages (newest first) for the PWA feed."""
        records = self.search([], order='create_date desc, id desc', limit=int(limit or 25))
        return [{
            'id': r.id,
            'po_number': r.po_number or '',
            'vendor': r.vendor or '',
            'item_name': r.item_name or '',
            'weight_kg': r.weight_kg,
            'shelf_location': r.shelf_location or '',
            'state': r.state,
            'captured_by': r.captured_by.name if r.captured_by else '',
            # Naive UTC ISO string (Odoo stores/returns create_date in UTC).
            # The frontend appends 'Z' before parsing so it renders in the
            # operator's local time instead of being misread as local-time.
            'create_date': r.create_date.isoformat() if r.create_date else '',
        } for r in records]
