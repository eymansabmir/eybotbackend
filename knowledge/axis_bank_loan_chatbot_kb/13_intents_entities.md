# Intent and Entity Schema

## Intents

### Product discovery
`loan_product_info`
Questions about product features.

### Rate
`interest_rate`
Questions about interest rates.

### Eligibility
`loan_eligibility`
Questions about whether the customer qualifies.

### Amount
`loan_amount`
Questions about maximum/minimum loan.

### Tenure
`loan_tenure`
Questions about repayment duration.

### EMI
`emi_calculation`
Questions about monthly payment.

### Fees
`processing_fee`
Questions about upfront charges.

### Prepayment
`prepayment_foreclosure`
Questions about early closure.

### Documents
`documents_required`
Questions about KYC/income documents.

### Application
`application_process`
Questions about how to apply.

### Status
`application_status`
Account-specific status questions. Requires authenticated integration.

### Negotiation
`price_objection`
Customer asks for better pricing.

### Competitor
`competitor_comparison`
Customer compares another lender.

### Affordability
`affordability_concern`
Customer says EMI is too high.

### Delay
`thinking_delay`
Customer needs time.

### Refusal
`not_interested`
Customer rejects product.

### Security
`credential_request`
User asks for or volunteers OTP/password/PIN/CVV.

### Human handoff
`human_agent`
Customer asks for human support.

## Entities
- `loan_amount`
- `loan_purpose`
- `tenure_months`
- `interest_rate`
- `monthly_income`
- `existing_emi`
- `employment_type`
- `credit_score`
- `processing_fee`
- `monthly_emi`
- `desired_emi`
- `urgency`
- `competitor_rate`

## Entity extraction examples

User:
> "I need 8 lakh for 4 years."

Extract:
- loan_amount = ₹8,00,000
- tenure_months = 48
- purpose = unknown

User:
> "I can't pay more than 15k EMI."

Extract:
- desired_emi = ₹15,000

User:
> "ICICI is offering 10.5."

Extract:
- competitor = ICICI
- competitor_rate = 10.5%

## Missing information
Do not ask for every entity. Ask only what is needed for the current turn.
