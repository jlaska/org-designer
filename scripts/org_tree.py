#!/usr/bin/env python3
"""
org_tree.py — print a tree-style org chart for any user.

Usage:
    org_tree.py [options] <identifier> [data_file]

identifier: email address, uid, or full/partial name (case-insensitive)
data_file:  path to JSON user list (default: data/all_users.json)

Options:
    --show-title      Show abbreviated job title (e.g. SSE, ME)
    --show-location   Show geo and country (e.g. NA * USA)
    --show-tenure     Show years of service based on original hire date
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path


_SKIP_WORDS = {"a", "an", "the", "and", "or", "of", "for", "in", "to", "at"}


def role_abbreviation(title: str) -> str:
    if not title:
        return "—"
    words = re.split(r"[\s\-/]+", title.replace(",", " ").replace(";", " "))
    return "".join(w[0].upper() for w in words if w and w.lower() not in _SKIP_WORDS)


def parse_ldap_date(raw: str) -> date | None:
    """Parse LDAP generalized time (e.g. '20021216050000Z') to a date."""
    if not raw:
        return None
    try:
        return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
    except (ValueError, IndexError):
        return None


def tenure_years(raw: str) -> str:
    d = parse_ldap_date(raw)
    if d is None:
        return "—"
    years = (date.today() - d).days / 365.25
    return f"{years:.1f}y"


def load_data(path: str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        print(f"error: data file not found: {path}", file=sys.stderr)
        sys.exit(1)
    with open(p) as f:
        return json.load(f)


def find_user(users: list[dict], query: str) -> dict:
    q = query.strip().lower()
    for u in users:
        if u.get("uid", "").lower() == q:
            return u
    for u in users:
        if u.get("primaryMail", "").lower() == q:
            return u
    for u in users:
        if u.get("cn", "").lower() == q:
            return u
    matches = [u for u in users if q in u.get("cn", "").lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        names = ", ".join(f"{u['cn']} ({u['uid']})" for u in matches)
        print(f"error: ambiguous query '{query}' — {len(matches)} matches: {names}", file=sys.stderr)
        sys.exit(1)
    print(f"error: no user found matching '{query}'", file=sys.stderr)
    sys.exit(1)


def build_reports_map(users: list[dict]) -> dict[str, list[str]]:
    m: dict[str, list[str]] = defaultdict(list)
    for u in users:
        mgr = u.get("manager")
        uid = u.get("uid")
        if mgr and uid:
            m[mgr].append(uid)
    return m


def build_tree(uid: str, uid_map: dict, reports_map: dict, depth: int = 0, visited: set | None = None) -> dict | None:
    if visited is None:
        visited = set()
    if uid in visited:
        return None
    visited.add(uid)
    u = uid_map.get(uid)
    if not u:
        return None
    node = {
        "uid": uid,
        "cn": u.get("cn", "?"),
        "title": u.get("jobTitle") or u.get("title", ""),
        "geo": u.get("geo", ""),
        "co": u.get("co", ""),
        "hire_date": u.get("originalHireDate") or u.get("hireDate", ""),
        "depth": depth,
        "reports": [],
    }
    for r in sorted(reports_map.get(uid, [])):
        child = build_tree(r, uid_map, reports_map, depth + 1, visited)
        if child is not None:
            node["reports"].append(child)
    return node


def format_label(node: dict, opts: argparse.Namespace) -> str:
    is_manager = bool(node["reports"])
    name = node["cn"] + ("/" if is_manager else "")
    parts = [f"{name} ({node['uid']})"]
    if opts.show_title:
        parts.append(role_abbreviation(node["title"]))
    if opts.show_location:
        geo = node["geo"] or "?"
        co = node["co"] or "?"
        parts.append(f"{geo} * {co}")
    if opts.show_tenure:
        parts.append(tenure_years(node["hire_date"]))
    return " -- ".join(parts) if len(parts) > 1 else parts[0]


def print_tree(node: dict, opts: argparse.Namespace, prefix: str = "", is_last: bool = True) -> None:
    label = format_label(node, opts)
    if node["depth"] == 0:
        print(label)
    else:
        connector = "└── " if is_last else "├── "
        print(f"{prefix}{connector}{label}")

    child_prefix = prefix + ("    " if is_last else "│   ")
    ics = [c for c in node["reports"] if not c["reports"]]
    managers = [c for c in node["reports"] if c["reports"]]
    for i, child in enumerate(ics + managers):
        print_tree(child, opts, child_prefix, i == len(node["reports"]) - 1)


def compute_metrics(node: dict) -> tuple[int, int, int]:
    """Return (total_reports, sub_manager_count, max_depth).

    Mirrors org-designer: ratio = total_ICs / total_managers where total_managers
    includes the root if it has reports (getSubtreePeople is inclusive of root).
    """
    total = 0
    sub_manager_count = 0
    max_depth = node["depth"]

    def walk(n: dict) -> None:
        nonlocal total, sub_manager_count, max_depth
        for child in n["reports"]:
            total += 1
            max_depth = max(max_depth, child["depth"])
            if child["reports"]:
                sub_manager_count += 1
            walk(child)

    walk(node)
    return total, sub_manager_count, max_depth


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Print a tree-style org chart for any user.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("identifier", help="email, uid, or name")
    parser.add_argument("data_file", nargs="?", help="path to JSON user list")
    parser.add_argument("--show-title", action="store_true", help="show abbreviated job title")
    parser.add_argument("--show-location", action="store_true", help="show geo and country (e.g. NA * USA)")
    parser.add_argument("--show-tenure", action="store_true", help="show years of service")
    opts = parser.parse_args()

    script_dir = Path(__file__).parent
    default_data = script_dir.parent / "data" / "all_users.json"
    data_file = opts.data_file or str(default_data)

    users = load_data(data_file)
    uid_map = {u["uid"]: u for u in users if u.get("uid")}
    reports_map = build_reports_map(users)

    user = find_user(users, opts.identifier)
    uid = user["uid"]

    tree = build_tree(uid, uid_map, reports_map)
    if tree is None:
        print(f"error: could not build tree for '{uid}'", file=sys.stderr)
        sys.exit(1)

    print_tree(tree, opts)
    print()

    total, sub_manager_count, max_depth = compute_metrics(tree)
    root_is_manager = bool(tree["reports"])
    manager_count = sub_manager_count + (1 if root_is_manager else 0)
    ic_count = total - sub_manager_count
    avg_ics = (ic_count / manager_count) if manager_count else 0.0
    org_depth = max_depth - tree["depth"]

    print(f"{total} total associates ({manager_count} managers, {ic_count} ICs)")
    print(f"{avg_ics:.1f} average ICs per manager")
    print(f"{org_depth} org depth")


if __name__ == "__main__":
    main()
