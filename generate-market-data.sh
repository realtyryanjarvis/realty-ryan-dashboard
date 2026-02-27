#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-market-data.sh
# Usage: ./generate-market-data.sh presentations/my-listing/market-data.json
# Outputs: presentations/my-listing/market-data.html
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$REPO_DIR/_template/market-data-template.html"
DATA_FILE="${1:-}"

if [[ -z "$DATA_FILE" ]]; then
  echo "❌  Usage: $0 presentations/<slug>/market-data.json"
  exit 1
fi

if [[ ! -f "$DATA_FILE" ]]; then
  echo "❌  Data file not found: $DATA_FILE"
  exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
  echo "❌  Template not found: $TEMPLATE"
  exit 1
fi

# Read slug from JSON
SLUG=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['slug'])" "$DATA_FILE")

if [[ -z "$SLUG" ]]; then
  echo "❌  'slug' field missing from $DATA_FILE"
  exit 1
fi

OUT_DIR="$REPO_DIR/presentations/$SLUG"
OUT_FILE="$OUT_DIR/market-data.html"
mkdir -p "$OUT_DIR"

echo "🏗   Building market data report for slug: $SLUG"
echo "    Template : $TEMPLATE"
echo "    Data     : $DATA_FILE"
echo "    Output   : $OUT_FILE"

# ── Token replacement via Python (handles multi-line HTML values safely) ──
python3 - "$TEMPLATE" "$DATA_FILE" "$OUT_FILE" <<'PYEOF'
import sys, json, re

template_path, data_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(template_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open(data_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Replace all {{TOKEN}} placeholders with values from JSON
for key, value in data.items():
    if key.startswith('_') or key == 'slug':
        continue
    placeholder = '{{' + key + '}}'
    content = content.replace(placeholder, str(value))

# Warn about any unreplaced tokens
remaining = re.findall(r'\{\{[A-Z_]+\}\}', content)
if remaining:
    print(f"⚠️   Unreplaced tokens: {set(remaining)}", file=sys.stderr)

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✅  Written: {out_path}")
PYEOF

ADDRESS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('PROPERTY_ADDRESS',''))" "$DATA_FILE")

echo ""
echo "📦  Committing to git..."
cd "$REPO_DIR"
git add -A
git commit -m "Add market data report: $ADDRESS ($SLUG)"
git push

echo ""
echo "🌐  Live URL:"
echo "    https://homes.realtyryan.com/presentations/$SLUG/market-data.html"
echo ""
echo "🖨️   To save as PDF: Open the URL → File → Print → Save as PDF"
echo "     (Use 'Letter' paper, default margins, Background graphics ON)"
