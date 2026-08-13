from odoo import api, fields, models


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
