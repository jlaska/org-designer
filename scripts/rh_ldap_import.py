#!/usr/bin/env python3
"""
Red Hat LDAP → org-designer adapter

Fetches all reports under a given root UID from ldap.corp.redhat.com
and writes data/all_users.json in the format expected by `make import`.

Usage:
    python3 scripts/rh_ldap_import.py [--root ROOT_UID] [--out PATH]

Defaults:
    --root   rvokal          (or set RH_LDAP_ROOT env var)
    --out    data/all_users.json

After running, execute:
    make import              (to build data/baseline.json)
    make dev                 (to start the app)

Requires: pip install ldap3
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from ldap3 import Server, Connection, SASL, KERBEROS, SUBTREE
    from ldap3.protocol.sasl.kerberos import ReverseDnsSetting
except ImportError:
    print("ERROR: ldap3 not installed. Run: pip install ldap3", file=sys.stderr)
    sys.exit(1)

try:
    import gssapi  # noqa: F401
except ImportError:
    print("ERROR: gssapi not installed. Run: pip install gssapi", file=sys.stderr)
    sys.exit(1)

LDAP_HOST = 'ldap.corp.redhat.com'
LDAP_BASE = 'dc=redhat,dc=com'
USERS_BASE = 'ou=users,dc=redhat,dc=com'

# ISO 3166-1 alpha-3 codes that Red Hat LDAP returns in the 'co' field
ISO3_TO_COUNTRY = {
    'USA': 'United States', 'CZE': 'Czech Republic', 'GBR': 'United Kingdom',
    'DEU': 'Germany', 'FRA': 'France', 'IND': 'India', 'AUS': 'Australia',
    'CAN': 'Canada', 'BRA': 'Brazil', 'SGP': 'Singapore', 'JPN': 'Japan',
    'CHN': 'China', 'NLD': 'Netherlands', 'ITA': 'Italy', 'ESP': 'Spain',
    'SWE': 'Sweden', 'POL': 'Poland', 'ISR': 'Israel', 'ZAF': 'South Africa',
    'KOR': 'South Korea', 'TWN': 'Taiwan', 'ARG': 'Argentina', 'MEX': 'Mexico',
    'RUS': 'Russia', 'UKR': 'Ukraine', 'PRT': 'Portugal', 'CHE': 'Switzerland',
    'AUT': 'Austria', 'BEL': 'Belgium', 'DNK': 'Denmark', 'FIN': 'Finland',
    'NOR': 'Norway', 'NZL': 'New Zealand', 'SVK': 'Slovakia', 'HUN': 'Hungary',
    'ROU': 'Romania', 'BGR': 'Bulgaria', 'HRV': 'Croatia', 'SRB': 'Serbia',
    'CHL': 'Chile', 'COL': 'Colombia', 'PHL': 'Philippines', 'MYS': 'Malaysia',
    'THA': 'Thailand', 'IDN': 'Indonesia', 'PAK': 'Pakistan', 'EGY': 'Egypt',
    'NGA': 'Nigeria', 'KEN': 'Kenya', 'MAR': 'Morocco', 'TUR': 'Turkey',
    'SAU': 'Saudi Arabia', 'ARE': 'United Arab Emirates', 'IRN': 'Iran',
}

ATTRIBUTES = [
    'uid', 'cn', 'displayName', 'rhatPreferredLastName',
    'rhatJobTitle', 'rhatJobRole',
    'rhatGeo', 'co', 'c', 'l', 'rhatLocation', 'rhatOfficeLocation',
    'rhatHireDate', 'rhatOriginalHireDate', 'rhatPersonType',
    'rhatWorkerId', 'rhatCostCenter', 'rhatCostCenterDesc',
    'manager',
]

# Map LDAP rhatJobRole values to org-designer jobRole categories.
# Falls back to title-based heuristic if rhatJobRole is absent.
ROLE_MAP = {
    'manager':    'Manager',
    'engineer':   'Engineer',
    'designer':   'Designer',
    'product':    'Product',
    'sales':      'Sales',
    'marketing':  'Marketing',
    'finance':    'Finance',
    'legal':      'Legal',
    'hr':         'HR',
    'operations': 'Operations',
    'executive':  'Executive',
}


def extract_uid_from_dn(dn: str) -> str | None:
    """Extract uid from an LDAP DN like 'uid=jsmith,ou=users,dc=redhat,dc=com'."""
    if not dn:
        return None
    m = re.match(r'uid=([^,]+)', dn, re.IGNORECASE)
    return m.group(1) if m else None


def infer_job_role(title: str) -> str:
    """Derive a jobRole category from a job title string."""
    t = title.lower()
    if any(w in t for w in ('vp ', 'vice president', 'chief ', 'ceo', 'cto', 'coo', 'cfo', 'president')):
        return 'Executive'
    if any(w in t for w in ('manager', 'director', 'head of', 'lead')):
        return 'Manager'
    if any(w in t for w in ('engineer', 'developer', 'architect', 'sre', 'devops', 'qa', 'quality')):
        return 'Engineer'
    if any(w in t for w in ('designer', 'ux', 'ui ')):
        return 'Designer'
    if any(w in t for w in ('product manager', 'product owner', 'pm ')):
        return 'Product'
    if 'sales' in t or 'account' in t:
        return 'Sales'
    if 'market' in t:
        return 'Marketing'
    if 'finance' in t or 'accounting' in t or 'controller' in t:
        return 'Finance'
    if 'legal' in t or 'counsel' in t or 'attorney' in t:
        return 'Legal'
    if any(w in t for w in ('human resources', ' hr ', 'recruiter', 'talent')):
        return 'HR'
    return 'Other'


def str_val(entry, attr: str) -> str:
    """Safely extract a string value from an ldap3 entry attribute."""
    try:
        v = entry[attr].value
        return str(v) if v else ''
    except Exception:
        return ''


def _active_employee_filter(extra: str = '') -> str:
    """LDAP filter for active employees: Employee type AND no past termination date."""
    today = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%SZ')
    # Include people with no rhatTermDate, or whose rhatTermDate is in the future
    return f'(&(rhatPersonType=Employee)(|(!(rhatTermDate=*))(rhatTermDate>={today})){extra})'


def fetch_person(conn: Connection, uid: str) -> dict | None:
    conn.search(LDAP_BASE, _active_employee_filter(f'(uid={uid})'), search_scope=SUBTREE, attributes=ATTRIBUTES)
    if not conn.entries:
        return None
    e = conn.entries[0]

    manager_dn = str_val(e, 'manager')
    manager_uid = extract_uid_from_dn(manager_dn)

    raw_role = str_val(e, 'rhatJobRole').strip()
    title = str_val(e, 'rhatJobTitle').strip()
    job_role = ROLE_MAP.get(raw_role.lower(), None) or infer_job_role(title)

    # 'co' in RH LDAP is ISO 3166-1 alpha-3 code (e.g. 'CZE'), not a full name
    raw_co = str_val(e, 'co') or str_val(e, 'c')
    country = ISO3_TO_COUNTRY.get(raw_co, raw_co)

    return {
        'uid':               uid,
        'cn':                str_val(e, 'cn'),
        'displayName':       str_val(e, 'displayName') or str_val(e, 'cn'),
        'preferredLastName': str_val(e, 'rhatPreferredLastName'),
        'manager':           manager_uid,
        'jobTitle':          title,
        'jobRole':           job_role,
        'geo':               str_val(e, 'rhatGeo'),
        'co':                country,
        'l':                 str_val(e, 'l'),
        'location':          str_val(e, 'rhatLocation') or str_val(e, 'rhatOfficeLocation'),
        'hireDate':          str_val(e, 'rhatHireDate') or str_val(e, 'rhatOriginalHireDate'),
        'workerId':          str_val(e, 'rhatWorkerId'),
        'costCenter':        str_val(e, 'rhatCostCenter'),
        'costCenterDesc':    str_val(e, 'rhatCostCenterDesc'),
    }


def fetch_direct_report_uids(conn: Connection, uid: str) -> list[str]:
    conn.search(
        LDAP_BASE,
        _active_employee_filter(f'(manager=uid={uid},{USERS_BASE})'),
        search_scope=SUBTREE,
        attributes=['uid'],
    )
    return [str_val(e, 'uid') for e in conn.entries if str_val(e, 'uid')]


def fetch_org(conn: Connection, root_uid: str) -> list[dict]:
    """BFS from root, collecting all people in the org subtree."""
    people: dict[str, dict] = {}
    queue = [root_uid]
    total = 0

    while queue:
        uid = queue.pop(0)
        if uid in people:
            continue

        person = fetch_person(conn, uid)
        if not person:
            print(f'  WARNING: uid={uid} not found in LDAP, skipping', file=sys.stderr)
            continue

        people[uid] = person
        total += 1
        if total % 50 == 0:
            print(f'  ... fetched {total} people so far')

        reports = fetch_direct_report_uids(conn, uid)
        queue.extend(r for r in reports if r not in people)

    return list(people.values())


def main():
    parser = argparse.ArgumentParser(description='Fetch Red Hat org from LDAP → all_users.json')
    parser.add_argument('--root', default=os.environ.get('RH_LDAP_ROOT', 'rvokal'),
                        help='Root manager UID (default: rvokal, or RH_LDAP_ROOT env var)')
    parser.add_argument('--out', default=None,
                        help='Output path (default: data/all_users.json relative to project root)')
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    out_path = Path(args.out) if args.out else project_root / 'data' / 'all_users.json'

    print(f'Connecting to {LDAP_HOST} (GSSAPI/Kerberos)...')
    # Pre-fetch the LDAP service ticket so GSSAPI can find it in the cache.
    # On macOS, automatic service-ticket acquisition via gssapi.init_sec_context
    # doesn't always work against the RH IPA NLB — pre-fetching avoids that.
    import subprocess
    subprocess.run(
        ['kinit', '-S', f'ldap/{LDAP_HOST}@IPA.REDHAT.COM'],
        check=False, capture_output=True,
    )

    server = Server(LDAP_HOST)
    conn = Connection(server, authentication=SASL, sasl_mechanism=KERBEROS,
                      sasl_credentials=(ReverseDnsSetting.OFF,))
    try:
        if not conn.bind():
            raise RuntimeError(conn.last_error or 'bind returned False')
    except Exception as e:
        print(f'ERROR: Could not authenticate to {LDAP_HOST}: {e}', file=sys.stderr)
        print('Make sure you are on the Red Hat VPN and have a valid Kerberos ticket (kinit).', file=sys.stderr)
        sys.exit(1)

    print(f'Fetching org tree rooted at uid={args.root}...')
    people = fetch_org(conn, args.root)
    conn.unbind()

    # The root person's manager is outside the exported subtree — null it out
    # so the import script can detect them as the org root.
    for p in people:
        if p['uid'] == args.root:
            p['manager'] = None
            break

    print(f'Fetched {len(people)} people total.')

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(people, f, indent=2)

    print(f'Written to {out_path}')
    print()
    print('Next steps:')
    print('  make import   # build data/baseline.json')
    print('  make dev      # start the app')


if __name__ == '__main__':
    main()
