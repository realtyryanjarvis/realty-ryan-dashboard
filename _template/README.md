# Listing Presentation Generator

Ryan Palmer · Realty Ryan & Associates · Corcoran HM Properties

---

## Workflow

### 1. Create a new data file

Copy the sample data file and give it a slug (URL-friendly name for the listing):

```bash
mkdir -p presentations/168-broad-sound
cp _template/sample-data.json presentations/168-broad-sound/data.json
```

### 2. Fill in the data

Edit `presentations/<slug>/data.json` with the real values for this listing:

| Field | Example | Notes |
|---|---|---|
| `slug` | `"168-broad-sound"` | URL slug — no spaces |
| `CLIENT_NAME` | `"The Johnsons"` | Seller's name |
| `PROPERTY_ADDRESS` | `"168 Broad Sound Place"` | Full street address |
| `PROPERTY_CITY` | `"Mooresville"` | City |
| `PROPERTY_STATE` | `"NC"` | State abbreviation |
| `PRICE_POINT` | `"$8M+"` | Price segment |
| `PRICE_RADIUS` | `"25 Miles"` | ShowingTime radius |
| `PRICE_RADIUS_REFERENCE` | `"168 Broad Sound"` | Radius anchor address |
| `MARKET_TOTAL_SHOWINGS` | `"12"` | ShowingTime total showings (90 days) |
| `MARKET_ACTIVE_LISTINGS` | `"7"` | Active listings in segment |
| `MARKET_SHOWINGS_PER_LISTING` | `"~1.7"` | Calculated: showings ÷ listings |
| `MARKET_STRATEGY_SHOWINGS_PER_MONTH` | `"~1"` | Avg showings/month expected |
| `MARKET_STRATEGY_DOM_RANGE` | `"6–12"` | Expected months on market |
| `MARKET_STRATEGY_CONTRACT_PCT` | `"26%"` | % of listings that go under contract |
| `MARKET_STRATEGY_MEDIAN_DAYS` | `"279"` | Median days on market |
| `ACTIVE_COMPS_HTML` | _(raw HTML)_ | Full HTML block for active competition cards |
| `CLOSED_COMPS_HTML` | _(raw HTML)_ | Full HTML block for closed/sold comp cards |
| `LAUNCH_EVENT_ADDRESS` | `"168 Broad Sound Place"` | Address on invitation card |
| `LAUNCH_EVENT_CITY` | `"Mooresville, NC"` | City on invitation card |
| `LAUNCH_EVENT_DAY` | `"Thursday Evening"` | Day of launch event |
| `SPRING_LISTING_REASON` | _(HTML string)_ | "Why Spring?" text — can include `<strong>` tags |
| `CTA_EMAIL_SUBJECT` | `"Pricing Deep Dive — 168 Broad Sound"` | Email subject line for pricing CTA |
| `PROPERTY_WEBSITE_URL` | `"https://homes.realtyryan.com/626shelton/"` | Custom property website URL |
| `PROPERTY_WEBSITE_LABEL` | `"See Live Example — 626 Shelton St ↗"` | Button label |

For `ACTIVE_COMPS_HTML` and `CLOSED_COMPS_HTML`: copy the card HTML from a previous presentation
or build new cards using the pattern in `sample-data.json`.

### 3. Generate the presentation

```bash
./generate-listing-presentation.sh presentations/<slug>/data.json
```

This will:
- Replace all `{{TOKEN}}` placeholders in the template
- Write the output to `presentations/<slug>/listing-presentation.html`
- Commit and push to GitHub

### 4. Share the live URL

```
https://homes.realtyryan.com/presentations/<slug>/listing-presentation.html
```

---

## Template Location

`_template/listing-presentation-template.html`

All design, CSS, animations, Ryan's bio, credentials, and accolades are baked in — they never change.
Only the property-specific, market-specific, and client-specific content is tokenized.

## Assets

All static assets (images, video) live in `listing-presentation-assets/` and are referenced
by relative path from the repo root — they're shared across all presentations.

---

## Tips

- **Comp cards**: Copy card HTML from `sample-data.json` as your starting template for new listings.
  Just swap the address, price, DOM, image path, and bedroom/bath/SF details.
- **Image paths**: For comp photos, add images to `listing-presentation-assets/` with a descriptive name
  and reference them as `listing-presentation-assets/comp-your-address.jpg`.
- **Multi-line HTML in JSON**: Use `\n` for newlines in JSON strings, or just keep it on one line —
  the generator handles both safely via Python.
