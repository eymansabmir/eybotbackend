# Hero Pricing and On-Road Price Knowledge

## Core rule

Hero product pages generally display **ex-showroom** prices. Hero city pages explicitly state that on-road price varies with city, road tax/RTO, registration, insurance and accessories.

Therefore:

> Never answer an exact on-road price from an ex-showroom number alone.

## Required inputs for an on-road quote

Ask for:
- City
- State if ambiguous
- Model
- Variant
- Whether the user wants standard insurance or a particular insurance/add-on setup
- Whether accessories are included

## Current Delhi examples captured in this KB

| Product | Ex-showroom range captured |
|---|---:|
| Splendor+ | ₹77,777–₹80,531 |
| HF 100 | ₹59,839 for retrieved listed variant |
| Super Splendor XTEC | ₹84,448–₹88,044 |
| Super Splendor XTEC 2.0 | ₹86,500–₹90,000 |
| Glamour X | ₹88,517–₹96,836 |
| Xtreme 125R | ₹91,500–₹1,08,300 |
| Xtreme 160R | ₹1,09,329–₹1,13,846 |
| Xtreme 160R 4V | ₹1,33,195–₹1,38,180 |
| Xpulse 210 | ₹1,66,745–₹1,75,963 |

## RAG response template

If city is missing:

“I can give you the Hero ex-showroom price, but for an on-road price I need your city because RTO/road tax, registration and insurance vary by location. Which city are you buying in?”

If city is present but exact price is not in KB:

“Hero's current city quote isn't available in my knowledge base for that exact model/variant. I don't want to guess the on-road price. I can give you the available ex-showroom price and tell you what charges make up the on-road amount.”

## Important freshness rule

Prices are dynamic. For a production bot, price retrieval should be refreshed from Hero's live city/variant pages rather than treated as permanent RAG knowledge.
