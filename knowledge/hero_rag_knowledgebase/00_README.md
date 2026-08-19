# Hero MotoCorp Motorcycle RAG Demo Knowledge Base

Purpose: a compact, product-grounded knowledge base for a RAG demo that answers motorcycle-shopping questions using **Hero MotoCorp products only**.

## Grounding rules

1. Do not invent specifications, prices, mileage, variants, colours, warranty, or features.
2. Treat mileage as a claimed/ARAI/WMTC figure where the source labels it that way. Real-world mileage can vary with riding style, traffic, tyre pressure, maintenance, and road conditions.
3. Treat listed prices as **ex-showroom** unless the source explicitly says otherwise.
4. Do not calculate or invent an exact on-road price without city, variant, registration/RTO information, insurance assumptions, and applicable charges.
5. When a user asks for “best” or “which should I buy”, first identify the user's use case: daily distance, budget, mileage priority, performance priority, traffic, pillion use, highway use, and desired features.
6. Recommendations in this demo must stay inside the Hero product catalogue represented in this KB.
7. If the requested city/variant price is not in the KB, say that a live Hero city quote is required rather than guessing.

## Product coverage

- HF 100
- HF Deluxe
- Splendor+
- Splendor+ XTEC
- Splendor+ XTEC 2.0
- Super Splendor XTEC
- Super Splendor XTEC 2.0
- Glamour
- Glamour X
- Xtreme 125R
- Xtreme 160R
- Xtreme 160R 4V
- Xpulse 210

## Retrieval strategy

For a production RAG system, chunk by:
- product
- specification
- feature
- pricing
- mileage
- comparison
- purchase/ownership question

Avoid putting every product into one giant chunk.

## Source policy

The source material was gathered from current Hero MotoCorp India product and city-price pages on 18 August 2026. Hero MotoCorp is the sole product-information source used for this demo.
