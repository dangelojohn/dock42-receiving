from unittest.mock import patch

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

    def test_pwa_create_capture_survives_true_uuid_race(self):
        """Force the exact race the DB constraint guards against: two
        requests' pwa_create_capture() calls both pass the initial dedup
        search() before either has committed, so the second one only
        discovers the collision when its own create() hits the DB-level
        UNIQUE(capture_uuid) constraint. That must be caught and turned
        into a duplicate=True response with the winner's id — not an
        unhandled IntegrityError — and it must not poison the cursor for
        calls made after it.
        """
        Package = self.env['dock42.package']

        # "Another request" wins the race and commits its row first —
        # created directly via create(), bypassing pwa_create_capture's
        # own dedup search entirely (exactly as a concurrent request
        # would, from this request's point of view).
        winner = Package.create({
            'capture_uuid': 'uuid-race',
            'po_number': 'PO-2026-200',
            'vendor': 'Race Winner Vendor',
            'item_name': 'Race Winner Item',
            'state': 'shelf_pending',
        })

        # Make *this* call's own initial dedup search miss the row that
        # is actually already there, for exactly one call — reproducing
        # the narrow window a true race exploits (searched, found
        # nothing, then discovered someone else's row was already
        # committed by the time create() ran). Every other search() call
        # — notably the fallback lookup inside pwa_create_capture's
        # except block — behaves normally.
        real_search = type(Package).search
        already_faked = []

        def fake_search(self, domain, *args, **kwargs):
            if domain == [('capture_uuid', '=', 'uuid-race')] and not already_faked:
                already_faked.append(True)
                return self.browse()
            return real_search(self, domain, *args, **kwargs)

        with patch.object(type(Package), 'search', fake_search):
            result = Package.pwa_create_capture({
                'capture_uuid': 'uuid-race',
                'po_number': 'PO-2026-999',
                'vendor': 'Loser Vendor',
                'item_name': 'Loser Item',
                'weight_kg': 1.0,
            })

        self.assertEqual(result, {'id': winner.id, 'duplicate': True})

        # The cursor must still be usable after the caught IntegrityError
        # (a bare try/except without a savepoint would leave it aborted)
        # — prove it by making another ORM call right after.
        count = Package.search_count([('capture_uuid', '=', 'uuid-race')])
        self.assertEqual(count, 1)

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

    def test_feed_includes_create_date(self):
        Package = self.env['dock42.package']
        Package.pwa_create_capture({'capture_uuid': 'uuid-feed-date-1', 'vendor': 'A', 'item_name': 'First'})
        feed = Package.pwa_feed(limit=1)
        self.assertIn('create_date', feed[0])
        self.assertTrue(feed[0]['create_date'])
        # Must be a real ISO-parseable timestamp, not a blank placeholder.
        from datetime import datetime
        datetime.fromisoformat(feed[0]['create_date'])

    def test_initial_damaged_flag_sets_damaged_state_and_notes_on_create(self):
        Package = self.env['dock42.package']
        result = Package.pwa_create_capture({
            'capture_uuid': 'uuid-initial-damaged-1',
            'vendor': 'Acme',
            'item_name': 'Widget',
            'initial_damaged': True,
            'notes': 'AI flagged: crushed corner on arrival.',
        })
        record = Package.browse(result['id'])
        self.assertEqual(record.state, 'damaged')
        self.assertEqual(record.damage_notes, 'AI flagged: crushed corner on arrival.')

    def test_report_damage_persists_fields_and_marks_damaged(self):
        Package = self.env['dock42.package']
        created = Package.pwa_create_capture({
            'capture_uuid': 'uuid-report-damage-1', 'vendor': 'Acme', 'item_name': 'Widget',
        })
        record = Package.browse(created['id'])
        result = record.pwa_report_damage('crushed_box', 'major', 'Box crushed in transit.')
        self.assertTrue(result['ok'])
        self.assertEqual(record.state, 'damaged')
        self.assertEqual(record.damage_category, 'crushed_box')
        self.assertEqual(record.damage_severity, 'major')
        self.assertEqual(record.damage_notes, 'Box crushed in transit.')
        # An audit trail message must actually have been posted — this is
        # the real persisted action the FlagView UI claims happened.
        self.assertTrue(
            any('Damage reported via Dock 42 PWA' in (m.body or '') for m in record.message_ids)
        )

    def test_undamaged_capture_with_ai_notes_does_not_populate_damage_notes(self):
        """The AI returns a generic "receiving condition" note on every
        scan, not just damaged ones. Since damage_notes is the only
        free-text field on this model, writing that note unconditionally
        would mislabel every undamaged package with populated "Damage
        Notes". It must only land there when the capture is actually
        flagged damaged.
        """
        Package = self.env['dock42.package']
        result = Package.pwa_create_capture({
            'capture_uuid': 'uuid-undamaged-with-notes-1',
            'vendor': 'Acme',
            'item_name': 'Widget',
            'initial_damaged': False,
            'notes': 'AI: package received in good condition.',
        })
        record = Package.browse(result['id'])
        self.assertEqual(record.state, 'shelf_pending')
        self.assertFalse(record.damage_notes)

    def test_report_damage_with_empty_notes_does_not_wipe_existing_damage_notes(self):
        """Filing a damage report with an empty textarea must not blank out
        a damage_notes value the original AI-flagged capture already wrote
        (pwa_create_capture with initial_damaged=True). Only overwrite
        damage_notes when the operator actually typed something.
        """
        Package = self.env['dock42.package']
        created = Package.pwa_create_capture({
            'capture_uuid': 'uuid-report-damage-empty-notes-1',
            'vendor': 'Acme',
            'item_name': 'Widget',
            'initial_damaged': True,
            'notes': 'AI flagged: dented corner on arrival.',
        })
        record = Package.browse(created['id'])
        self.assertEqual(record.damage_notes, 'AI flagged: dented corner on arrival.')

        result = record.pwa_report_damage('crushed_box', 'major', '')
        self.assertTrue(result['ok'])
        self.assertEqual(record.state, 'damaged')
        self.assertEqual(record.damage_category, 'crushed_box')
        # The pre-existing AI note must survive an empty-textarea submit.
        self.assertEqual(record.damage_notes, 'AI flagged: dented corner on arrival.')
