{
    'name': 'Dock 42 Receiving',
    'version': '19.0.1.0.0',
    'summary': 'Warehouse dock receiving PWA: camera capture, offline-safe idempotent sync, damage reporting.',
    'category': 'Inventory/Inventory',
    'depends': ['base', 'web', 'mail'],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_config_parameter.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
