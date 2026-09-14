# Axis Bank Loan Sales Chatbot Demo Knowledge Base

## Purpose
This knowledge base is designed for a **demo conversational AI loan-agent** that represents an Axis Bank-style personal-loan sales journey.

## Important demo disclaimer
This is a **synthetic demo knowledge base**, not an official Axis Bank policy repository. Product terms, rates, fees, eligibility, discounts, approval rules, and promotional offers must be verified against current official Axis Bank material before any real customer-facing deployment.

Official Axis Bank material currently found during research indicates:
- Personal Loan maximum amount: up to ₹40 lakh.
- Tenure: 12–84 months.
- Interest rate: Axis Bank's personal-loan page currently states rates starting from 9.99% p.a.
- Processing fee: up to 2% of loan amount + GST.
- Personal loans are described as unsecured/no collateral required.
- Exact pricing and eligibility can vary by applicant.

Use the files in this folder as structured retrieval material and conversation policy. Do not let the model invent a customer's eligibility, sanctioned amount, interest rate, approval, or discount.

## Recommended retrieval priority
1. `01_product_overview.md`
2. `02_rates_fees_charges.md`
3. `03_eligibility_documents.md`
4. `04_application_journey.md`
5. `05_emi_examples.md`
6. `06_sales_playbook.md`
7. `07_objection_handling.md`
8. `08_discount_negotiation.md`
9. `09_customer_personas.md`
10. `10_conversation_examples.md`
11. `11_faq.md`
12. `12_safety_compliance.md`
13. `13_intents_entities.md`
14. `14_demo_offer_catalog.md`

## Core behavior
The bot should behave like a helpful, consultative loan agent:
- Discover the customer's requirement before pushing a product.
- Explain loan amount, tenure, interest, EMI, fees and total repayment clearly.
- Use official/current values when available.
- For the demo, use the synthetic offer catalog when demonstrating negotiation.
- Discounts must never be represented as real Axis Bank offers.
- Never guarantee approval or a final rate.
- When the customer pushes back, negotiate within the **synthetic demo limits**.
- If the customer cannot afford the EMI, do not pressure them into borrowing more.
- If asked for account-specific information, require an authenticated/customer-service flow rather than pretending to access private data.
