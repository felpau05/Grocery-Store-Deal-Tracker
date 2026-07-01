import json

# 1. Load your scraped data
"""with open('enriched_items.json', 'r', encoding='utf-8') as f:
    items = json.load(f)"""

with open('test_outputs/1_raw_flyers.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

total_items = len(items)

# 2. First pass: Find EVERY unique key that exists in any item
all_keys = set()
for item in items:
    all_keys.update(item.keys())

# Initialize our tracking dictionary
stats = {key: {"valid": 0, "null": 0, "missing": 0} for key in all_keys}

# 3. Second pass: Grade every key across every item
for item in items:
    for key in all_keys:
        if key in item:
            val = item[key]
            # Check if it's explicitly None (null in JSON) or an empty string
            if val is None or val == "":
                stats[key]["null"] += 1
            else:
                stats[key]["valid"] += 1
        else:
            # The key doesn't even exist in this item's dictionary
            stats[key]["missing"] += 1

# 4. Sort and Print the Results
print(f"Total items analyzed: {total_items}\n")
print("-" * 50)

always_perfect = []
always_present_but_sometimes_null = []
sometimes_missing = []

for key, data in stats.items():
    if data["valid"] == total_items:
        always_perfect.append(key)
    elif data["missing"] == 0:
        always_present_but_sometimes_null.append((key, data))
    else:
        sometimes_missing.append((key, data))

print("✅ 1. ALWAYS PERFECT (100% Present, Never Null/Empty):")
# These are your safest fields. You don't need Optional or defaults for these.
for key in sorted(always_perfect):
    print(f"  - {key}")

print("\n⚠️ 2. ALWAYS PRESENT, BUT SOMETIMES NULL (Missing = 0):")
# The key won't throw a KeyError, but you need to handle `None` values.
for key, data in sorted(always_present_but_sometimes_null):
    print(f"  - {key} (Valid: {data['valid']} | Null/Empty: {data['null']})")

print("\n❌ 3. SOMETIMES COMPLETELY MISSING:")
# You MUST use .get() or provide a default value in your dataclass for these.
for key, data in sorted(sometimes_missing):
    print(f"  - {key} (Valid: {data['valid']} | Null: {data['null']} | Missing: {data['missing']})")

print("-" * 50)