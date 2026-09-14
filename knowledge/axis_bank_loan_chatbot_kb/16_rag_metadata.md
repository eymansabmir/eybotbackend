# RAG Metadata Suggestions

Recommended metadata fields for each chunk:
- `source_type`: official_product / official_terms / demo_policy / demo_example
- `product`: personal_loan
- `topic`: rate / fee / eligibility / emi / sales / objection / compliance
- `authority`: axis_bank / synthetic_demo
- `freshness`: current / verify
- `customer_visible`: yes / internal
- `contains_synthetic_offer`: true / false

## Chunking
Recommended chunk size:
- 150–400 words for factual product content.
- 100–250 words for objections.
- 100–300 words for synthetic negotiation policies.

## Retrieval rules
For a factual customer question:
1. Retrieve official product facts first.
2. Retrieve official terms if charges/conditions are involved.
3. Retrieve demo policy only when negotiation is involved.
4. Never allow synthetic demo content to override official factual product content.

## Conflict resolution
If two sources conflict:
- Prefer the newer official Axis Bank source.
- If publication date/currentness cannot be established, say the exact terms should be verified.
- Never silently merge conflicting rates.

## Generation grounding
Every factual number should be traceable to:
- Official current source, or
- Explicitly labelled synthetic demo data.
