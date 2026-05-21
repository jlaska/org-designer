#!/usr/bin/env python3
"""Convert directs_exported_data.csv → all_users.json for org-designer.

CSV columns: Name, User ID, Job Title, Location, Email, Manager UID
"""
import csv
import json
import sys
from pathlib import Path


def split_name(full: str):
    parts = full.strip().split()
    return parts[-1] if parts else ""


def infer_role(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ("director", "manager", "lead", "head", "chief", "vp", "vice president", "president")):
        return "Manager"
    if "designer" in t:
        return "Designer"
    if any(k in t for k in ("engineer", "developer", "sre", "architect", "qe ", " qe", "quality")):
        return "Engineer"
    if any(k in t for k in ("product", "program", "project")):
        return "Product"
    if "data" in t or "analyst" in t or "scientist" in t:
        return "Data"
    return "Other"


def infer_geo_country(location: str):
    """Best-effort geo/country inference from RH location strings."""
    if not location:
        return "", "", ""
    s = location.replace("RH - ", "").strip()
    # Map of city-keywords → (geo, country, city)
    mapping = [
        ("Brno",        "EMEA", "Czech Republic", "Brno"),
        ("Prague",      "EMEA", "Czech Republic", "Prague"),
        ("Raleigh",     "NA",   "United States",  "Raleigh"),
        ("Boston",      "NA",   "United States",  "Boston"),
        ("Westford",    "NA",   "United States",  "Westford"),
        ("New York",    "NA",   "United States",  "New York"),
        ("Mountain View", "NA", "United States",  "Mountain View"),
        ("San Francisco", "NA", "United States",  "San Francisco"),
        ("Toronto",     "NA",   "Canada",         "Toronto"),
        ("Mexico",      "LATAM","Mexico",         "Mexico City"),
        ("Brasil",      "LATAM","Brazil",         "Brasilia"),
        ("Brazil",      "LATAM","Brazil",         "Brasilia"),
        ("Sao Paulo",   "LATAM","Brazil",         "São Paulo"),
        ("São Paulo",   "LATAM","Brazil",         "São Paulo"),
        ("London",      "EMEA", "United Kingdom", "London"),
        ("Farnborough", "EMEA", "United Kingdom", "Farnborough"),
        ("Munich",      "EMEA", "Germany",        "Munich"),
        ("Stuttgart",   "EMEA", "Germany",        "Stuttgart"),
        ("Berlin",      "EMEA", "Germany",        "Berlin"),
        ("Grenoble",    "EMEA", "France",         "Grenoble"),
        ("Paris",       "EMEA", "France",         "Paris"),
        ("Madrid",      "EMEA", "Spain",          "Madrid"),
        ("Milan",       "EMEA", "Italy",          "Milan"),
        ("Rome",        "EMEA", "Italy",          "Rome"),
        ("Amsterdam",   "EMEA", "Netherlands",    "Amsterdam"),
        ("Stockholm",   "EMEA", "Sweden",         "Stockholm"),
        ("Helsinki",    "EMEA", "Finland",        "Helsinki"),
        ("Dublin",      "EMEA", "Ireland",        "Dublin"),
        ("Tel Aviv",    "EMEA", "Israel",         "Tel Aviv"),
        ("Israel",      "EMEA", "Israel",         "Tel Aviv"),
        ("Bangalore",   "APAC", "India",          "Bangalore"),
        ("Bengaluru",   "APAC", "India",          "Bengaluru"),
        ("Pune",        "APAC", "India",          "Pune"),
        ("India",       "APAC", "India",          ""),
        ("Beijing",     "APAC", "China",          "Beijing"),
        ("Shanghai",    "APAC", "China",          "Shanghai"),
        ("Tokyo",       "APAC", "Japan",          "Tokyo"),
        ("Japan",       "APAC", "Japan",          ""),
        ("Singapore",   "APAC", "Singapore",      "Singapore"),
        ("Sydney",      "APAC", "Australia",      "Sydney"),
        ("Australia",   "APAC", "Australia",      ""),
        ("Seoul",       "APAC", "South Korea",    "Seoul"),
        ("Korea",       "APAC", "South Korea",    ""),
    ]
    for kw, geo, country, city in mapping:
        if kw.lower() in s.lower():
            return geo, country, city
    return "", "", s.split(" - ")[0] if " - " in s else s


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/home/scuppett/Documents/directs_exported_data.csv")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/all_users.json")
    out.parent.mkdir(parents=True, exist_ok=True)

    people = []
    seen_uids = set()
    manager_uids = set()

    with src.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            uid = (row.get("User ID") or "").strip()
            if not uid:
                continue
            cn = (row.get("Name") or "").strip()
            title = (row.get("Job Title") or "").strip()
            loc = (row.get("Location") or "").strip()
            mgr = (row.get("Manager UID") or "").strip() or None
            geo, country, city = infer_geo_country(loc)
            people.append({
                "uid": uid,
                "cn": cn,
                "displayName": cn,
                "manager": mgr,
                "preferredLastName": split_name(cn),
                "jobTitle": title,
                "jobRole": infer_role(title),
                "geo": geo,
                "co": country,
                "l": city,
                "location": loc,
                "hireDate": "",
            })
            seen_uids.add(uid)
            if mgr:
                manager_uids.add(mgr)

    # Add synthetic root nodes for any manager UIDs not in the CSV.
    missing_roots = manager_uids - seen_uids
    for mgr_uid in sorted(missing_roots):
        people.append({
            "uid": mgr_uid,
            "cn": mgr_uid,
            "displayName": mgr_uid,
            "manager": None,
            "preferredLastName": mgr_uid,
            "jobTitle": "Senior Director / VP (root)",
            "jobRole": "Manager",
            "geo": "",
            "co": "",
            "l": "",
            "location": "",
            "hireDate": "",
        })

    # Compute direct + total report counts.
    by_mgr = {}
    for p in people:
        by_mgr.setdefault(p["manager"], []).append(p["uid"])

    direct = {p["uid"]: len(by_mgr.get(p["uid"], [])) for p in people}

    def total(uid, memo={}):
        if uid in memo:
            return memo[uid]
        n = 0
        for c in by_mgr.get(uid, []):
            n += 1 + total(c)
        memo[uid] = n
        return n

    for p in people:
        p["directReports"] = direct[p["uid"]]
        p["totalReports"] = total(p["uid"])

    with out.open("w", encoding="utf-8") as f:
        json.dump(people, f, indent=2, ensure_ascii=False)
    print(f"wrote {len(people)} people → {out} (synthetic roots: {sorted(missing_roots)})")


if __name__ == "__main__":
    main()
