#!/usr/bin/env python3
"""
Enrich user data with computed fields:
- Geocoding: Add lat/lng coordinates (offline, no API calls)
- Report counts: Add directReports and totalReports counts
"""

import sys
import json

try:
    import geonamescache
except ImportError:
    print("ERROR: geonamescache not installed. Install with: pip install geonamescache", file=sys.stderr)
    sys.exit(1)

# Initialize geonamescache
gc = geonamescache.GeonamesCache()
cities = gc.get_cities()
countries = gc.get_countries()

# Build city lookup by name (lowercase)
city_lookup = {}
for gid, city in cities.items():
    city_name = city['name'].lower()
    # Store multiple cities with same name (we'll pick the largest by population)
    if city_name not in city_lookup:
        city_lookup[city_name] = []
    city_lookup[city_name].append({
        'name': city['name'],
        'lat': city['latitude'],
        'lng': city['longitude'],
        'country': city['countrycode'],
        'population': city['population']
    })

# Country center coordinates (geonamescache doesn't include lat/lng for countries)
country_lookup = {
    'US': {'lat': 39.8283, 'lng': -98.5795},
    'CA': {'lat': 56.1304, 'lng': -106.3468},
    'GB': {'lat': 55.3781, 'lng': -3.4360},
    'IE': {'lat': 53.1424, 'lng': -7.6921},
    'DE': {'lat': 51.1657, 'lng': 10.4515},
    'FR': {'lat': 46.2276, 'lng': 2.2137},
    'CZ': {'lat': 49.8175, 'lng': 15.4730},
    'IN': {'lat': 20.5937, 'lng': 78.9629},
    'CN': {'lat': 35.8617, 'lng': 104.1954},
    'AU': {'lat': -25.2744, 'lng': 133.7751},
    'BR': {'lat': -14.2350, 'lng': -51.9253},
    'BE': {'lat': 50.5039, 'lng': 4.4699},
    'NL': {'lat': 52.1326, 'lng': 5.2913},
    'NO': {'lat': 60.4720, 'lng': 8.4689},
    'SE': {'lat': 60.1282, 'lng': 18.6435},
    'DK': {'lat': 56.2639, 'lng': 9.5018},
    'FI': {'lat': 61.9241, 'lng': 25.7482},
    'ES': {'lat': 40.4637, 'lng': -3.7492},
    'IT': {'lat': 41.8719, 'lng': 12.5674},
    'PL': {'lat': 51.9194, 'lng': 19.1451},
    'AT': {'lat': 47.5162, 'lng': 14.5501},
    'CH': {'lat': 46.8182, 'lng': 8.2275},
    'SG': {'lat': 1.3521, 'lng': 103.8198},
    'IL': {'lat': 31.0461, 'lng': 34.8516},
    'MX': {'lat': 23.6345, 'lng': -102.5528},
    'AR': {'lat': -38.4161, 'lng': -63.6167},
    'JP': {'lat': 36.2048, 'lng': 138.2529},
    'KR': {'lat': 35.9078, 'lng': 127.7669},
    'NZ': {'lat': -40.9006, 'lng': 174.8860},
    'ZA': {'lat': -30.5595, 'lng': 22.9375},
    'RU': {'lat': 61.5240, 'lng': 105.3188},
    'UA': {'lat': 48.3794, 'lng': 31.1656},
    'TR': {'lat': 38.9637, 'lng': 35.2433},
    'SA': {'lat': 23.8859, 'lng': 45.0792},
    'AE': {'lat': 23.4241, 'lng': 53.8478},
    'EG': {'lat': 26.8206, 'lng': 30.8025},
    'PK': {'lat': 30.3753, 'lng': 69.3451},
    'BD': {'lat': 23.6850, 'lng': 90.3563},
    'TH': {'lat': 15.8700, 'lng': 100.9925},
    'VN': {'lat': 14.0583, 'lng': 108.2772},
    'PH': {'lat': 12.8797, 'lng': 121.7740},
    'ID': {'lat': -0.7893, 'lng': 113.9213},
    'MY': {'lat': 4.2105, 'lng': 101.9758},
    'CL': {'lat': -35.6751, 'lng': -71.5430},
    'CO': {'lat': 4.5709, 'lng': -74.2973},
    'PE': {'lat': -9.1900, 'lng': -75.0152},
    'PT': {'lat': 39.3999, 'lng': -8.2245},
    'GR': {'lat': 39.0742, 'lng': 21.8243},
    'RO': {'lat': 45.9432, 'lng': 24.9668},
    'HU': {'lat': 47.1625, 'lng': 19.5033},
    'BG': {'lat': 42.7339, 'lng': 25.4858},
    'HR': {'lat': 45.1, 'lng': 15.2},
    'SK': {'lat': 48.6690, 'lng': 19.6990},
    'SI': {'lat': 46.1512, 'lng': 14.9955},
    'HK': {'lat': 22.3193, 'lng': 114.1694},
    'TW': {'lat': 23.6978, 'lng': 120.9605},
}

def geocode_city(city_name, country_code=None):
    """Geocode a city name, optionally filtered by country code."""
    if not city_name:
        return None
    
    city_name_lower = city_name.lower()
    
    if city_name_lower not in city_lookup:
        return None
    
    candidates = city_lookup[city_name_lower]
    
    # If country code provided, filter by it
    if country_code:
        candidates = [c for c in candidates if c['country'] == country_code]
    
    if not candidates:
        return None
    
    # Return the most populous match
    best = max(candidates, key=lambda c: c['population'])
    return {
        'lat': best['lat'],
        'lng': best['lng'],
        'source': 'city'
    }

def geocode_country(country_code):
    """Geocode a country by ISO code."""
    if not country_code:
        return None
    
    if country_code in country_lookup:
        country = country_lookup[country_code]
        return {
            'lat': country['lat'],
            'lng': country['lng'],
            'source': 'country'
        }
    
    return None

def geocode_user(user):
    """Geocode a user and add lat/lng fields."""
    city = user.get('l')
    country_code = user.get('c')
    
    # Try city-level geocoding first
    if city:
        result = geocode_city(city, country_code)
        if result:
            user['lat'] = result['lat']
            user['lng'] = result['lng']
            user['geoSource'] = result['source']
            return True
    
    # Fall back to country-level
    if country_code:
        result = geocode_country(country_code)
        if result:
            user['lat'] = result['lat']
            user['lng'] = result['lng']
            user['geoSource'] = result['source']
            return True
    
    return False

def compute_report_counts(users):
    """Compute direct and total report counts for all users with caching."""
    # Build manager -> direct reports mapping
    manager_to_directs = {}
    uid_set = set()

    for user in users:
        uid = user.get('uid')
        if uid:
            uid_set.add(uid)

    for user in users:
        manager = user.get('manager')
        if manager and manager in uid_set:
            if manager not in manager_to_directs:
                manager_to_directs[manager] = []
            manager_to_directs[manager].append(user.get('uid'))

    # Cache for total reports computation
    total_reports_cache = {}

    def get_total_reports(uid, visiting=None):
        """Recursively compute total reports with memoization and cycle detection."""
        if uid in total_reports_cache:
            return total_reports_cache[uid]

        # Cycle detection: track nodes being visited in current recursion path
        if visiting is None:
            visiting = set()

        if uid in visiting:
            # Cycle detected! Return 0 to break the cycle
            return 0

        visiting.add(uid)

        directs = manager_to_directs.get(uid, [])
        total = len(directs)

        for direct_uid in directs:
            total += get_total_reports(direct_uid, visiting)

        visiting.remove(uid)
        total_reports_cache[uid] = total
        return total

    # Add counts to each user
    managers_count = 0
    for user in users:
        uid = user.get('uid')
        if not uid:
            continue

        direct_count = len(manager_to_directs.get(uid, []))
        user['directReports'] = direct_count
        user['totalReports'] = get_total_reports(uid)

        if direct_count > 0:
            managers_count += 1

    return managers_count

def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            users = json.load(f)
    else:
        users = json.load(sys.stdin)

    total = len(users)

    # Geocode users
    geocoded = 0
    city_geocoded = 0
    country_geocoded = 0

    for user in users:
        if geocode_user(user):
            geocoded += 1
            if user.get('geoSource') == 'city':
                city_geocoded += 1
            else:
                country_geocoded += 1

    pct = geocoded * 100 // total if total else 0
    print(f"Total: {total} users, {geocoded} geocoded ({pct}%)", file=sys.stderr)
    print(f"  - City-level: {city_geocoded}", file=sys.stderr)
    print(f"  - Country-level: {country_geocoded}", file=sys.stderr)
    print(f"  - Not geocoded: {total - geocoded}", file=sys.stderr)

    # Compute report counts
    managers_count = compute_report_counts(users)
    print(f"Report counts: {managers_count} managers identified", file=sys.stderr)

    # Output JSON
    print(json.dumps(users, separators=(',', ':')))

if __name__ == '__main__':
    main()
