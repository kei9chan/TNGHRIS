#!/usr/bin/env python3
"""Compare catalog JSON exported by scripts/sql/schema-parity-{catalog,aux}.sql.

No network or database access; accepts the JSON value of each `catalog` result.
Sequence values and physical column positions are intentionally data/layout-only.
"""
import argparse
import copy
import json
from pathlib import Path

KEYS = {
    'tables': ('schema', 'name'),
    'columns': ('schema', 'table', 'name'),
    'constraints': ('schema', 'table', 'name'),
    'indexes': ('schema', 'table', 'name'),
    'functions': ('schema', 'name', 'args'),
    'policies': ('schemaname', 'tablename', 'policyname'),
    'triggers': ('schema', 'table', 'name'),
    'types': ('schema', 'name'),
    'grants': ('table_schema', 'table_name', 'grantee', 'privilege_type'),
    'column_grants': ('table_schema', 'table_name', 'column_name', 'grantee', 'privilege_type'),
    'sequences': ('schemaname', 'sequencename'),
    'default_acls': ('schema', 'role', 'type'),
    'publications': ('pubname', 'schemaname', 'tablename'),
    'extensions': ('name',),
    'schemas': ('name',),
    'column_acls': ('schema', 'table', 'column'),
    'sequence_acls': ('schema', 'name'),
    'storage_buckets': ('id',),
    'replica_identity': ('schema', 'table'),
}


def normalize(value, category):
    value = copy.deepcopy(value)
    if category == 'columns':
        value.pop('position', None)
    if category == 'sequences':
        value.pop('last_value', None)
    # ACL entries are sets. Enum label and view/publication column order matter.
    if isinstance(value.get('grants'), list):
        value['grants'].sort(key=lambda item: json.dumps(item, sort_keys=True))
    return value


def compare(production, staging):
    result = []
    for category, fields in KEYS.items():
        if category not in production:
            continue
        def index(catalog):
            return {tuple(row.get(field) for field in fields): row
                    for row in catalog.get(category, []) or []}
        left, right = index(production), index(staging)
        missing = sorted(left.keys() - right.keys(), key=str)
        extra = sorted(right.keys() - left.keys(), key=str)
        changed = sorted((key for key in left.keys() & right.keys()
                          if normalize(left[key], category) != normalize(right[key], category)), key=str)
        # A platform-installed staging extension is retained, never dropped.
        allowed_extra = [('pg_net',)] if category == 'extensions' else []
        unexpected_extra = [key for key in extra if key not in allowed_extra]
        result.append({'category': category, 'production': len(left), 'staging': len(right),
                       'missing': missing, 'extra': extra, 'changed': changed,
                       'passed': not (missing or unexpected_extra or changed)})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('production', type=Path)
    parser.add_argument('staging', type=Path)
    parser.add_argument('--production-aux', type=Path)
    parser.add_argument('--staging-aux', type=Path)
    args = parser.parse_args()
    left, right = (json.loads(path.read_text()) for path in (args.production, args.staging))
    if bool(args.production_aux) != bool(args.staging_aux):
        parser.error('Supply both auxiliary catalogs or neither.')
    if args.production_aux:
        left.update(json.loads(args.production_aux.read_text()))
        right.update(json.loads(args.staging_aux.read_text()))
    report = compare(left, right)
    print(json.dumps(report, indent=2))
    return 0 if all(row['passed'] for row in report) else 1


if __name__ == '__main__':
    raise SystemExit(main())
