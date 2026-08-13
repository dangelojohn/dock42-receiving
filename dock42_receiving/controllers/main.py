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

    @http.route('/dock42/api/capture', type='jsonrpc', auth='user', methods=['POST'])
    def capture(self, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        return request.env['dock42.package'].pwa_create_capture(kw)

    @http.route('/dock42/api/update_shelf', type='jsonrpc', auth='user', methods=['POST'])
    def update_shelf(self, package_id=None, shelf_location=None, photo_shelf=None, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        try:
            record = request.env['dock42.package'].browse(int(package_id))
        except (TypeError, ValueError):
            return {'ok': False}
        if not record.exists():
            return {'ok': False}
        return record.pwa_add_shelf(shelf_location, photo_shelf)

    @http.route('/dock42/api/flag_damage', type='jsonrpc', auth='user', methods=['POST'])
    def flag_damage(self, package_id=None, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        try:
            record = request.env['dock42.package'].browse(int(package_id))
        except (TypeError, ValueError):
            return {'ok': False}
        if not record.exists():
            return {'ok': False}
        return record.pwa_toggle_flag()

    @http.route('/dock42/api/feed', type='jsonrpc', auth='user')
    def feed(self, limit=25, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        return request.env['dock42.package'].pwa_feed(limit=limit)
