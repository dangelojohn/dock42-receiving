from unittest.mock import patch

from odoo.tests.common import HttpCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestDock42Controllers(HttpCase):

    def test_app_route_redirects_anonymous_to_login(self):
        res = self.url_open('/dock42', allow_redirects=False)
        self.assertEqual(res.status_code, 303)
        self.assertIn('/web/login', res.headers.get('Location', ''))

    def test_app_route_returns_clear_error_when_frontend_not_built(self):
        # If the frontend hasn't been built (its output is gitignored), the
        # route must not let a raw FileNotFoundError traceback reach the
        # operator — it should return a clear, actionable plain-text error
        # instead.
        self.authenticate('admin', 'admin')
        with patch('odoo.addons.dock42_receiving.controllers.main._PWA_INDEX', '/nonexistent/dock42-index.html'):
            res = self.url_open('/dock42', allow_redirects=False)
        self.assertEqual(res.status_code, 503)
        self.assertIn(b'npm ci && npm run build', res.content)

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

    def test_update_shelf_with_missing_package_id_returns_ok_false(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/update_shelf',
            data='{"jsonrpc":"2.0","method":"call","params":{"shelf_location":"BAY-01"}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['ok'])

    def test_update_shelf_with_non_numeric_package_id_returns_ok_false(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/update_shelf',
            data='{"jsonrpc":"2.0","method":"call","params":{"package_id":"invalid-uuid","shelf_location":"BAY-01"}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['ok'])

    def test_flag_damage_with_missing_package_id_returns_ok_false(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/flag_damage',
            data='{"jsonrpc":"2.0","method":"call","params":{}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['ok'])

    def test_flag_damage_with_non_numeric_package_id_returns_ok_false(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/flag_damage',
            data='{"jsonrpc":"2.0","method":"call","params":{"package_id":"not-a-number"}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['ok'])

    def test_report_damage_with_missing_package_id_returns_ok_false(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/report_damage',
            data='{"jsonrpc":"2.0","method":"call","params":{"category":"crushed_box","severity":"major","notes":"x"}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['ok'])

    def test_report_damage_with_non_numeric_package_id_returns_ok_false(self):
        self.authenticate('admin', 'admin')
        res = self.url_open(
            '/dock42/api/report_damage',
            data='{"jsonrpc":"2.0","method":"call","params":{"package_id":"not-a-number"}}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body['result']['ok'])

    def test_report_damage_api_persists_when_authenticated(self):
        self.authenticate('admin', 'admin')
        capture_res = self.url_open(
            '/dock42/api/capture',
            data='{"jsonrpc":"2.0","method":"call","params":{"capture_uuid":"http-uuid-damage-1","vendor":"Acme","item_name":"Widget"}}',
            headers={'Content-Type': 'application/json'},
        )
        package_id = capture_res.json()['result']['id']

        res = self.url_open(
            '/dock42/api/report_damage',
            data=(
                '{"jsonrpc":"2.0","method":"call","params":{'
                '"package_id":%d,"category":"crushed_box","severity":"major",'
                '"notes":"Box crushed in transit."}}'
            ) % package_id,
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['result']['ok'])

        record = self.env['dock42.package'].browse(package_id)
        self.assertEqual(record.state, 'damaged')
        self.assertEqual(record.damage_category, 'crushed_box')
        self.assertEqual(record.damage_severity, 'major')
        self.assertEqual(record.damage_notes, 'Box crushed in transit.')

    def test_report_damage_api_requires_operator(self):
        res = self.url_open(
            '/dock42/api/report_damage', data='{}',
            headers={'Content-Type': 'application/json'},
        )
        self.assertNotEqual(res.status_code, 200 if b'"result"' in res.content else -1)
