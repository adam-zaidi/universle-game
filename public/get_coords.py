import json, re

def extract_coords(location):
    if not location:
        return None, None
    # find last decimal pair
    match = list(re.finditer(r"(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)", location))
    if match:
        lat, lng = map(float, match[-1].groups())
        return lat, lng
    return None, None

with open("universities_full.min.json") as f:
    data = json.load(f)

for d in data:
    lat, lng = extract_coords(d.get("Location") or d.get("Coordinates"))
    d["lat"] = lat
    d["lng"] = lng

with open("universities_clean.json", "w") as f:
    json.dump(data, f, indent=2)