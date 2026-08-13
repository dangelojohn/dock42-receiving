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
