# Managed Services Expert Handoff Contacts

Curated contact index for chatbot expert routing (*Talk to an expert*). Keep this file authoritative for named people; do not invent emails. Categories marked TBD must show the fallback message until filled.

## Contact table

| Category | Name | Role | Email | Region | Route when user asks about |
|---|---|---|---|---|---|
| India PRC / Pursuit | TBD | TBD | TBD | India | India pursuit materials, proposal assets, India MS resources |
| USLI PRC / Pursuit | Sabrina Custer | PRC USLI Managed Services Lead | Sabrina.Custer@ey.com | USLI / PRC | USLI pursuit materials, PRC MS resources, proposal assets |
| Technology Managed Services | Milan Sheth | EY Global Technology Managed Services Leader | milan.sheth@in.ey.com | India / Global | Tech Operations, AMS, SAP, Oracle, Microsoft, Salesforce, Cloud (service code 11182) |
| Cyber Managed Services | Tapan Shah | Global Cybersecurity Managed Services Leader | tapan.shah@ey.com | Global / India | Cyber Operations, SOC, TDR, cyber platforms (service code 111822) |
| Learning Managed Services | Savvas Koufou | EY Global Managed Learning Services Leader | Savvas.Koufou@uk.ey.com | Global | Managed Learning Services |
| HRMS / Payroll | TBD | TBD | TBD | India / Global | HR helpdesk, payroll, employee-service operations |
| Data and AI Managed Services | TBD | TBD | TBD | India / Global | AI agents, analytics, data ops, AIOps |
| Tax Operate (TFO) | Stuart Lang | Global TFO Leader | slang1@uk.ey.com | Global | Tax managed services / Tax Operate (service code 10691) |
| Finance Operate (TFO) | Stuart Lang | Global TFO Leader | slang1@uk.ey.com | Global | Finance managed services / Finance Operate (service code 10691) |
| Supply Chain and Operations | TBD | TBD | TBD | India / Global | Supply chain / operations MS |
| Risk and Compliance | TBD | TBD | TBD | India / Global | Digital risk, risk and compliance MS |

## Routing rules for the assistant

1. India pursuit / India PRC → **India PRC / Pursuit** (TBD until named — do not invent).
2. USLI PRC / US pursuit materials → **USLI PRC / Pursuit** (Sabrina Custer — Sabrina.Custer@ey.com).
3. Technology / Tech Operations → **Milan Sheth** (milan.sheth@in.ey.com).
4. Cyber Operations / Cybersecurity MS → **Tapan Shah** (tapan.shah@ey.com).
5. Managed Learning Services → **Savvas Koufou** (Savvas.Koufou@uk.ey.com). HRMS/payroll remains TBD until a named owner is added.
6. Tax Operate **and** Finance Operate (TFO) → **Stuart Lang** (slang1@uk.ey.com).
7. If the category is TBD → say clearly that a named contact is not yet in the approved directory; ask the user’s Managed Services pursuit lead to route them.
8. Never invent a name or email that is not in this table.
9. Office address / phone lists from playbooks are not substitutes for named MS handoff contacts.

## Fallback wording

When no named contact exists for the requested category:

"A named contact is not configured for this tower in the approved directory yet. Ask your Managed Services pursuit lead to route you. For USLI PRC pursuit materials only, Sabrina Custer (PRC USLI Managed Services Lead) is listed at Sabrina.Custer@ey.com."
