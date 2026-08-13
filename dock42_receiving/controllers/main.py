import base64
import logging
import os

from odoo import http
from odoo.http import request
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)

_MODULE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PWA_INDEX = os.path.join(_MODULE_DIR, 'static', 'src', 'pwa', 'index.html')

_SCAN_PROMPT = (
    "You are an AI optical label scanner for a warehouse dock receiving "
    "station. Analyze the provided photo of a package label and extract "
    "or infer: vendor, item_name, weight_kg, po_number, shelf_location "
    "(a plausible warehouse bin code), is_damaged (true if the image shows "
    "a crushed carton, tear, or leak), and notes (a short receiving-condition "
    "note)."
)


def _is_operator():
    """Some instances let auth='user' fall through to the Public user
    instead of redirecting to login — enforce it explicitly rather than
    trust auth='user' alone. Same workaround porterly_inbound_pwa uses."""
    user = request.env.user
    return bool(user) and (not user._is_public()) and user.has_group('base.group_user')


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


class Dock42PWA(http.Controller):

    @http.route('/dock42', type='http', auth='user', website=False, csrf=False)
    def dock42_app(self, **kw):
        if not _is_operator():
            return request.redirect('/web/login?redirect=%2Fdock42')
        try:
            with open(_PWA_INDEX, 'r') as f:
                html = f.read()
        except FileNotFoundError:
            return request.make_response(
                'Dock 42 Receiving: frontend not built.\n\n'
                'Run `npm ci && npm run build` in the `frontend/` directory '
                'of this module, then reload this page.',
                status=503,
                headers=[('Content-Type', 'text/plain; charset=utf-8')],
            )
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

    @http.route('/dock42/api/report_damage', type='jsonrpc', auth='user', methods=['POST'])
    def report_damage(self, package_id=None, category=None, severity=None, notes=None, photo=None, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        try:
            record = request.env['dock42.package'].browse(int(package_id))
        except (TypeError, ValueError):
            return {'ok': False}
        if not record.exists():
            return {'ok': False}
        return record.pwa_report_damage(category, severity, notes, photo)

    @http.route('/dock42/api/feed', type='jsonrpc', auth='user')
    def feed(self, limit=25, **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')
        return request.env['dock42.package'].pwa_feed(limit=limit)

    @http.route('/dock42/api/scan-label', type='jsonrpc', auth='user', methods=['POST'])
    def scan_label(self, image_base64=None, mime_type='image/jpeg', **kw):
        if not _is_operator():
            raise AccessError('Please sign in with an operator account.')

        if not image_base64:
            # Without a real photo, a well-formed model response is
            # ungrounded guesswork, not a scan — this is the same class of
            # bug (success:True on fabricated data) this task exists to
            # eliminate, just triggered by a missing image instead of an
            # API failure. Require an image rather than letting the model
            # invent a plausible-looking label from a text-only prompt.
            return {'success': False, 'error': 'No image provided — a photo of the label is required to scan.'}

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
