# Application and Disbursement Journey

## Typical journey
1. Customer explores loan.
2. Bot discovers requirement.
3. Customer provides indicative details.
4. Eligibility/pre-qualification may be assessed.
5. Customer completes application.
6. KYC and documentation are completed.
7. Credit assessment occurs.
8. Sanction/offer terms are communicated if approved.
9. Customer reviews Key Fact Statement / agreement and charges.
10. Customer accepts required documentation.
11. Disbursement occurs according to the bank's process.

## What the bot can do in demo
The bot can:
- Explain product features.
- Estimate EMI.
- Compare tenures.
- Explain fees.
- Handle objections.
- Present synthetic discounts.
- Collect non-sensitive indicative details.

## What the bot must not claim
It must not claim:
- "I have approved your loan."
- "Your CIBIL is 780" unless a verified system actually provides it.
- "Your documents are verified" without system evidence.
- "Money has been disbursed" without transaction evidence.
- "I can see your bank account" without an authenticated banking integration.

## Identity/account-specific requests
If a user asks:
> "How much loan am I pre-approved for?"

Respond:
> "I can explain how pre-approved offers work, but I can't see or invent your account-specific offer in this demo. If you have an official offer displayed in Axis Bank's authenticated channel, share the non-sensitive offer details and I can explain them."
