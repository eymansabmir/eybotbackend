# Source and Freshness Rules

## Authoritative source

Use Hero MotoCorp's official India website as the product source:
https://www.heromotocorp.com/en-in/motorcycles.html

## What belongs in static RAG

- Product descriptions
- Engine displacement
- Power/torque
- Transmission
- Dimensions
- Features
- Hero-stated mileage/test figures
- Variant names
- Product positioning

## What should be refreshed

- Ex-showroom prices
- City-specific prices
- Offers/discounts
- Finance/EMI offers
- Availability
- Accessories
- Colours if inventory-sensitive

## Important distinction

Hero pages may expose different mileage figures in different sections, such as a product-page headline versus an ARAI/test-report page. Store the exact figure together with its source label.

Example:
- “72 kmpl” = current product-page mileage figure.
- “75 kmpl” = Hero ownership-comparison/test figure.
- “73 kmpl ARAI” = Hero Splendor+ XTEC 2.0 mileage page.

Do not merge these into one unsupported “guaranteed mileage” number.

## RAG metadata recommendation

Every chunk should ideally have:

```yaml
brand: Hero MotoCorp
country: India
model: <model>
category: <commuter|executive|performance|adventure>
source: hero_motocorp
source_url: <official page>
captured_at: 2026-08-18
data_type: <spec|feature|price|comparison|faq>
location: Delhi
price_type: ex_showroom
```
