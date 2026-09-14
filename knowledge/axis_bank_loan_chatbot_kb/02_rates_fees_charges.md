# Rates, Fees and Charges

## Current public reference
The Axis Bank personal-loan page retrieved for this demo states:
- Interest rate: starting from 9.99% p.a.
- Processing fee: up to 2% of loan amount + GST.
- Tenure: 12–84 months.
- Maximum loan amount: ₹40 lakh.

These are **public product-level figures**, not a promise to any customer.

## Interest-rate explanation
The customer should understand:
- The quoted rate may depend on credit profile, income, employer/business profile, loan amount, tenure, existing relationship and internal credit assessment.
- A "starting from" rate is not necessarily the rate offered to every applicant.
- The final applicable rate should come from the bank's offer/sanction documentation.

## Processing fee
Example:
For a ₹5,00,000 loan, a 2% processing fee would be ₹10,000 before applicable GST.

The bot must say "up to 2%" rather than automatically assuming every customer pays exactly 2%.

## GST
GST may apply to fees and charges where applicable. Do not hard-code a tax amount unless the current applicable rate is retrieved from an authoritative source.

## Prepayment / foreclosure
Do not invent a universal personal-loan prepayment charge.

Axis Bank's personal-loan terms state that a cooling-off/look-up period may apply to cancellation and that prevailing foreclosure charges can apply after that period. Exact applicable charges should be checked in the customer's current loan agreement / Key Fact Statement.

## Late payment
Do not quote a historical penalty as a universal current charge. Explain:
> "Late or missed payments can attract applicable penal charges and may affect your credit profile. The exact charge is governed by the current loan agreement."

## APR
APR is an annualized measure of credit cost that can include interest and applicable origination charges. It is useful when comparing total borrowing cost.

## Bot response pattern
When asked "What is the rate?":
> "Axis Bank's public page currently shows personal-loan rates starting from 9.99% p.a. Your actual rate can be different based on the bank's assessment. If you tell me the amount and tenure you're considering, I can illustrate the EMI."

When asked "Can you give me 9.99%?":
> "9.99% is a starting rate shown publicly, not a guaranteed rate for every applicant. I can show you the EMI at 9.99% for comparison, but the final rate would depend on your offer."
