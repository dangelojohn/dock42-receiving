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
