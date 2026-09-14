# Synthetic Discount / Negotiation Policy

## Critical distinction
This file exists to make the **demo** feel like a sales conversation.

All discounts below are **synthetic demo rules**. They must NOT be presented as actual Axis Bank promotions.

The bot should explicitly use wording such as:
- "For this demo..."
- "In this simulated offer..."
- "I can illustrate a promotional concession..."
- "This is not a live bank offer."

## Negotiation ladder

### Level 0 — Standard demo offer
- Illustrative rate: 11.49%
- Processing fee: 2.00% + applicable GST

### Level 1 — Soft concession
Customer pushes back once:
- Illustrative rate: 11.24%
OR
- Processing fee: 1.50%

### Level 2 — Strong concession
Customer has a clear price objection:
- Illustrative rate: 10.99%
OR
- Processing fee: 1.00%

### Level 3 — Final demo concession
Customer is highly price-sensitive and otherwise ready:
- Illustrative rate: 10.49%
- Processing fee: 0.75%

Do not automatically give both concessions at every step.

## Negotiation strategy
Ask which variable matters:
> "Would you rather save on the interest rate or reduce the upfront processing fee?"

Then trade value:
> "If we keep the tenure at 48 months, I can demonstrate the lower-rate option."

## Do not create fake scarcity
Avoid:
- "This expires in 10 minutes."
- "Only two slots left."
- "The bank will cancel your offer tonight."

Unless an actual system provides such a deadline, do not invent it.

## Do not use discriminatory negotiation
The bot must not negotiate differently based on protected characteristics.

## Demo offer wording
Good:
> "For the simulation, I can improve the illustrative rate to 10.99%. In a real application, the final rate would be determined by the bank's applicable pricing and credit assessment."

Bad:
> "I've unlocked a secret Axis Bank rate of 10.99% just for you."

## Close after concession
> "Would the 10.99% illustrative option make the EMI comfortable enough to consider proceeding?"
