# Browser-Based Work Across 100 Industries — and Where CONXA Fits First

**Prepared:** 2026-09-23 · **For:** CONXA sales & go-to-market · **Status:** research synthesis. It is decision-ready for *where to look first*. It does not size the market.

> **How to read the numbers in this report.** Every "% of work in browsers" figure below is a **reasoned inference (RI)**. That includes the numbers in the master tables, and it is deliberate. We found **no credible, verifiable public measurement of browser/web-app time share for any single industry**. The one widely repeated headline figure ("~85% of knowledge-worker time is in the browser") **failed adversarial verification 0–3**: it traces back to a vendor blog with no primary study behind it (see §9). The numbers here are structured estimates with their reasoning shown. The **workflow-level evidence** (prior-authorisation volumes, payer-portal burden, EDI mandates, multi-tool sprawl) *is* sourced, and it is what the CONXA ranking leans on.

---

## 1. Executive Summary

**Browser share is the wrong thing to rank by, and the data confirms it.** Heavily browser-based industries such as SaaS, cloud, EdTech and FinTech rank *low* for CONXA, because their systems have APIs and engineers who use them. The best-fit industries are the ones whose employees are forced to work inside **other organisations' web portals**: payers, carriers, customers' procurement systems, client VMS, OEMs, utilities, government agencies. They re-key the same data into systems they don't own and can't integrate with. That is the "no realistic API path" condition in CONXA's own qualifying shape (PRD §6) [S14], and it predicts fit better than browser share.

**Target first (Tier A, in order):**


1. **Medical Administration & Billing (RCM)** — Best-evidenced fit in the study. The work runs through dozens of payer portals with no API, at very high volume. Existing RPA breaks when a portal changes [S3], which is the failure Conxa's self-healing targets.

2. **Insurance Brokerage & Agencies** — Textbook Conxa shape: an agency re-keys one risk into many carrier portals it doesn't own. The work is daily and has no API path.

3. **Consumer Goods (CPG suppliers)** — Retailers dictate the portals, and suppliers lose real money on deductions they don't dispute. High value and repetitive, with no API on the supplier's side.

4. **Recruitment & Staffing** — Staffing firms (suppliers) must use each client's VMS portal, and they don't own those portals. That's the no-API, cross-system pattern Conxa is built for, at weekly timesheet scale.

5. **Human Resources Services (PEO, payroll, benefits admin)** — Each employer event fans out to carrier and state portals with no common API, and repeats for every client.

6. **Logistics (3PL, freight brokerage)** — The brokerage desk lives in browser tabs, across shipper, carrier and board portals the broker doesn't own. Very high load volume.

7. **Property Management (residential)** — Hundreds of units multiply into many utility and municipal portals with no API. Monthly and highly repetitive.

8. **Tax Services (incl. indirect tax, payroll tax)** — One filing multiplies across jurisdictions, each with its own portal and no API, and repeats every period.

9. **Procurement & Vendor Management** — The best target is a supplier's AR team uploading invoices to dozens of customer procurement portals it doesn't control.

10. **Automotive Dealerships** — Dealers sit between OEM, lender and DMV portals none of which they control. The volume is per vehicle and the claim dollars are real.

11. **Clinics (outpatient, dental, therapy, specialty)** — Browser-based practice systems plus payer portals, and no in-house engineering. Best reached through practice-management and RCM vendors (Rung 3).

12. **Accounting Firms** — Every client adds another set of bank, payroll and tax portals. The work is monthly and repetitive, and firms are Windows shops.

13. **Insurance Claims Processing (carriers, TPAs, adjusting firms)** — Claims work crosses several external portals for every claim. TPAs and independent adjusters are easier to deploy into than carriers.

14. **Freight & Shipping (forwarders, customs brokers, NVOCCs)** — Forwarders touch dozens of carrier and customs portals for every shipment. The CargoWise native client limits end-to-end coverage.


**The best-evidenced beachhead is healthcare revenue-cycle work** (medical billing companies, clinic billing offices, lab billing). It is the only area where the fit rests on primary, measured data rather than inference:
- The AMA's 2025 survey of 1,000 physicians: practices complete **~40 prior authorisations per physician per week**, and physicians and staff spend **~13 hours a week** on them. **Only 24%** of physicians say their EHR offers electronic PA for prescriptions [S1].
- 67% of payer executives say manual platforms reduce efficiency [S3].
- CAQH puts the industry's administrative savings opportunity at **$21B** [S2].
- Existing RPA bots **break when a payer changes its portal** [S3]. That is the exact failure mode CONXA's self-healing, multi-signal element identity is designed for.

**The second pattern: industries built around brokering, staffing and servicing other companies.** Insurance agencies (carrier portals), staffing firms (client VMS), 3PLs and forwarders (carrier and shipper portals), PEOs (benefit-carrier and state portals), accounting and tax firms (client banks, jurisdictions), and CPG suppliers (retailer portals). Each client, carrier or jurisdiction adds another portal, so the manual work grows with the business. APIs never catch up because the intermediary doesn't own any of the systems.

**Channel beats direct in most Tier-A industries.** Many Tier-A buyers are small or mid-sized firms with no IT staff: practices, agencies, brokerages, property managers. The highest-leverage route is PRD Rung 3 [S14]. Sell to the **vertical SaaS vendors and IT-services firms that already serve them**: RCM/PM vendors, agency-management-system vendors, staffing ATS/VMS vendors, TMS vendors, property-management platforms, practice-management vendors for accounting. They ship CONXA skills to their customer base.

**Three structural disqualifiers came up repeatedly and should be screened in week one:**
1. **Citrix/VDI or mainframe delivery** of the core system: hospital EHRs, bank cores, airline PSS, BPOs working inside client VDI.
2. **Native thick clients** doing the core work: CAD, SAP GUI, CargoWise, dealer DMS screens, tax-prep software.
3. **Non-Windows fleets**: ChromeOS in K-12, Macs in creative agencies and media.

These are CONXA's documented out-of-scope conditions [S14], and they explain most of the gap between "high browser share" and "high CONXA fit".

**What this report cannot tell you:** market size, willingness to pay, or measured browser time per industry. §9 lists the gaps and the fastest ways to close them. The cheapest is measuring browser time directly on the machines of 3–5 design partners.

---

## 2. Research Methodology

### 2.1 Process
1. **Automated deep-research pass.** A multi-agent workflow searched five angles in parallel:
   - aggregate browser/SaaS time share;
   - industry web/SaaS adoption and thick-client prevalence;
   - RPA deployment evidence by industry and workflow;
   - API gaps and legacy portals;
   - quantified time/cost of manual web work.

   It fetched 22 sources and extracted 78 falsifiable claims. The top 25 went through **3-vote adversarial verification**: a claim survived only if at most one of three independent verifiers could refute it. **5 claims survived and 20 were refuted.** Every surviving claim is marked *(verified)* in this report. Refuted claims are listed in §9 so nobody reuses them by accident.
2. **Targeted primary-source retrieval.** We fetched primary documents directly: the AMA 2025 prior-authorisation survey (PDF, read in full) and CAQH/DataSpring's 2025 Index landing page. Several other primaries were paywalled or gated and could not be read: HBR's full text, Okta's full report, BLS OEWS tables, Emergence Capital. Figures from those are marked as coming via secondary sources.
3. **Structured estimation** for the 100 industries (§2.2) and **rubric scoring** for CONXA fit (§2.3).

### 2.2 How the browser-share estimates were built
Each industry gets **two** estimates, because CONXA sells into the back office, not the whole workforce:
- **Org-wide %:** estimated share of *all* paid work hours in the industry spent in a browser or web app.

  Formula: *(desk-based share of workforce) × (web share of that computer time)*, plus a small allowance for frontline mobile-web use.

  The desk-based share is bounded by the widely cited finding that roughly 80% of the global workforce is deskless [S10] (cited via secondary sources, not re-verified here). A second anchor: roughly half the US workforce uses a keyboard as its primary work instrument [S9] (secondary).
- **Back-office %:** estimated share of *office and back-office staff* computer time spent in a browser or web app. This comes from the industry's dominant application architecture:
  - SaaS/web: high.
  - Mixed web and native ERP: medium.
  - Terminal, mainframe, Citrix or CAD: low.

  The architecture assessment comes from public vendor product information and practitioner knowledge, marked **[K]**.

**Evidence labels used throughout:**

| Label | Meaning |
|---|---|
| **M: Measured** | A survey or telemetry measurement of the quantity itself (e.g., AMA physician survey [S1]) |
| **SB: Source-backed** | A cited source supports the claim directly, but it is secondary or not a measurement |
| **RI: Reasoned inference** | Derived by the method above; no direct measurement exists |
| **[K]** | Practitioner/industry knowledge (application names, workflow descriptions) not re-verified in this study. Treat as a hypothesis for discovery calls |

**All 200 percentage estimates (100 org-wide + 100 back-office) are RI.** Bands are 15–20 points wide on purpose. False precision would be worse than a range.

### 2.3 How CONXA fit was scored
The scoring derives from CONXA's own ICP filter (PRD §6: ≥3 browser systems, repeats daily or weekly, a person does it today, no realistic API path, stable login, Windows) [S14] plus the factors in the research brief. Each industry gets seven 1–5 scores:

| Code | Factor | Weight | 5 means… |
|---|---|---|---|
| BS | Back-office browser share | 10% | Back-office work is almost entirely in web apps/portals |
| REP | Repetition & volume | 20% | Many executions per day, same steps each time |
| MS | Multi-system | 15% | Routinely crosses ≥3 web systems owned by different parties |
| MAN | Manual re-keying / download / upload / reconciliation | 10% | Staff copy data between systems all day |
| API | Absence of a practical API path | 20% | The worker doesn't own the target system and no integration is realistic |
| DEP | Deployability | 15% | Windows fleet, stable login, no VDI/mainframe/air-gap, reachable buyer |
| VAL | Value | 10% | High labour cost × volume, or direct money recovered (claims, deductions, reimbursements) |

**Fit score** = weighted mean × 20 (0–100). **Tiers:** A ≥ 88 · B 80–87 · C 70–79 · D < 70.

REP and API carry the most weight. Repetition is what pays back a compile. The absence of an API is what makes CONXA the right tool rather than an integration. **The scores are judgments, not measurements.** Each one is explained in the industry's "Fit reasoning" line. Use them to sequence discovery calls, not as forecasts.

---

## 3. Master Table: All 100 Industries (in the brief's order)

Browser % columns are **RI** (see §2.2). Conf. = confidence in the browser % estimate. Fit scores follow the §2.3 rubric (BS·REP·MS·MAN·API·DEP·VAL).

| # | Industry | Org-wide browser % | Back-office browser % | Conf. | Systems | Automation potential | Scores | Fit | Tier | Rank |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Software Development | 40-60% | 50-70% | Low | 5-10, almost all with APIs | Low-Med | 3212142 | 41 | D | 100 |
| 2 | IT Services | 55-75% | 65-80% | Low | 4-8 | Med-High | 4443343 | 72 | C | 45 |
| 3 | SaaS Companies | 65-85% | 75-90% | Low-Med | 6-15, mostly with APIs | Medium | 5343243 | 66 | D | 64 |
| 4 | Cybersecurity | 60-80% | 70-85% | Low | 5-12 | Medium | 4443233 | 65 | D | 65 |
| 5 | Cloud Computing | 55-75% | 70-85% | Low | 4-8, API-native | Low | 4232142 | 49 | D | 95 |
| 6 | Data & AI Services | 60-80% | 70-85% | Low | 4-8 | Low-Med | 4333232 | 56 | D | 82 |
| 7 | IT Support & Managed Services | 65-80% | 75-90% | Low-Med | 8-20 across clients | High | 5554344 | 85 | B | 20 |
| 8 | Digital Marketing | 70-85% | 75-90% | Low-Med | 5-12 | Medium | 5454233 | 72 | C | 46 |
| 9 | Advertising Agencies | 55-75% | 65-80% | Low | 5-10 | Medium | 4343223 | 58 | D | 79 |
| 10 | Management Consulting | 45-60% | 50-65% | Low | 3-6 | Low | 3132322 | 45 | D | 98 |
| 11 | Business Process Outsourcing (BPO) | 60-85% | 65-85% | Low-Med | 5-15 (client-dependent) | High | 4555434 | 86 | B | 18 |
| 12 | Recruitment & Staffing | 65-80% | 70-85% | Low-Med | 6-12 | High | 5555444 | 91 | A | 4 |
| 13 | Human Resources Services (PEO, payroll, benefits admin) | 60-80% | 70-85% | Low-Med | 6-15 (many carriers x states) | High | 5555444 | 91 | A | 5 |
| 14 | Healthcare Providers (umbrella) | 20-35% | 55-75% | Low (%), Med (workflow evidence) | 4-10, plus 10-40+ payer portals [S7] | High | 4554435 | 86 | B | 17 |
| 15 | Hospitals | 15-30% | 50-70% | Low | 8-15 [S16] | High | 3554425 | 81 | B | 26 |
| 16 | Clinics (outpatient, dental, therapy, specialty) | 25-40% | 65-80% | Low-Med | 5-10 + many payer portals | High | 4555444 | 89 | A | 11 |
| 17 | Diagnostic Laboratories | 15-30% | 50-70% | Low | 5-10 | High | 3454434 | 78 | C | 31 |
| 18 | Telemedicine | 60-80% | 75-90% | Low-Med | 5-10 + dozens of state boards | Med-High | 5443443 | 78 | C | 32 |
| 19 | Health Insurance (payers) | 45-65% | 55-75% | Low | 5-12 | High | 3544334 | 75 | C | 39 |
| 20 | Medical Devices | 25-40% | 50-70% | Low | 5-10 | Medium | 3344333 | 65 | D | 66 |
| 21 | Pharmaceuticals | 25-40% | 50-70% | Low | 6-12 | Medium | 3344324 | 64 | D | 68 |
| 22 | Biotechnology | 25-45% | 45-65% | Low | 4-8 | Low-Med | 3233323 | 53 | D | 88 |
| 23 | Clinical Research (CROs & trial sites) | 40-60% | 65-85% | Low-Med | 5-10 (each sponsor mandates its own EDC) | High | 5455434 | 84 | B | 23 |
| 24 | E-Commerce (brands & merchants) | 55-75% | 70-85% | Low-Med | 6-12 | High | 5554433 | 84 | B | 24 |
| 25 | Online Marketplaces (operators) | 60-80% | 70-85% | Low | 4-8 | Medium | 4433233 | 62 | D | 74 |
| 26 | Retail Stores | 10-20% | 55-70% | Low | 5-10 | Medium | 3443333 | 67 | D | 59 |
| 27 | Wholesale Distribution | 25-40% | 50-70% | Low | 5-10 | High | 3555434 | 84 | B | 22 |
| 28 | Consumer Goods (CPG suppliers) | 20-35% | 55-75% | Low | 5-10 retailer portals | High | 4555445 | 91 | A | 3 |
| 29 | Banking (retail & commercial ops) | 35-55% | 45-65% | Low | 6-15 | High | 3555335 | 82 | B | 25 |
| 30 | Corporate Banking | 40-60% | 50-70% | Low | 6-12 | Med-High | 3545334 | 77 | C | 35 |
| 31 | Investment Banking | 35-55% | 40-55% | Low | 4-8 | Low | 2233333 | 54 | D | 86 |
| 32 | FinTech | 65-85% | 75-90% | Low | 5-10 | Medium | 5443243 | 70 | C | 50 |
| 33 | Payments & Payment Processing | 60-80% | 70-85% | Low | 5-10 | High | 4544344 | 80 | B | 27 |
| 34 | Wealth Management (RIAs, broker-dealers) | 55-75% | 65-80% | Low-Med | 6-10 (multi-custodian) | High | 5455444 | 87 | B | 15 |
| 35 | Asset Management | 45-65% | 55-70% | Low | 5-10 | Medium | 3344334 | 67 | D | 58 |
| 36 | Insurance (carriers) | 45-65% | 55-75% | Low | 6-12 | High | 4444334 | 73 | C | 41 |
| 37 | Insurance Brokerage & Agencies | 70-85% | 70-85% | Low-Med | 5-15 (AMS + many carrier portals) | High | 5555544 | 95 | A | 2 |
| 38 | Insurance Claims Processing (carriers, TPAs, adjusting firms) | 50-70% | 65-80% | Low | 6-12 | High | 4555435 | 88 | A | 13 |
| 39 | Telecommunications | 35-55% | 50-70% | Low | 6-12 | High | 3554334 | 78 | C | 30 |
| 40 | Internet Service Providers | 35-55% | 55-75% | Low | 5-10 | Med-High | 4444443 | 78 | C | 33 |
| 41 | Schools (K-12) | 25-40% | 60-75% | Low | 4-8 | Medium | 4333312 | 54 | D | 87 |
| 42 | Universities & Colleges | 40-60% | 60-75% | Low | 6-12 | Med-High | 4444433 | 75 | C | 40 |
| 43 | EdTech | 65-85% | 75-90% | Low | 4-8 | Low | 5332242 | 59 | D | 77 |
| 44 | Professional Training | 55-75% | 65-80% | Low | 4-8 | Medium | 4444442 | 76 | C | 38 |
| 45 | Government Administration | 35-55% | 45-65% | Low | 5-12 | Medium | 3444413 | 67 | D | 60 |
| 46 | Public Services (benefits, licensing agencies) | 30-50% | 45-65% | Low | 5-10 | Medium | 3544413 | 71 | C | 48 |
| 47 | Municipal Services | 25-45% | 45-65% | Low | 4-8 | Medium | 3444422 | 68 | D | 57 |
| 48 | Logistics (3PL, freight brokerage) | 30-50% | 70-85% | Low-Med | 6-15 | High | 5555444 | 91 | A | 6 |
| 49 | Freight & Shipping (forwarders, customs brokers, NVOCCs) | 35-55% | 70-85% | Low-Med | 6-15 | High | 5555434 | 88 | A | 14 |
| 50 | Warehousing | 10-25% | 55-70% | Low | 4-8 | Medium | 3444333 | 69 | D | 53 |
| 51 | Courier & Delivery | 5-15% | 55-70% | Low | 3-6 | Low-Med | 3433332 | 62 | D | 75 |
| 52 | Airlines | 15-30% | 40-60% | Low | 6-12 | Medium | 2444323 | 64 | D | 69 |
| 53 | Railways | 10-25% | 40-60% | Low | 4-8 | Low | 2333322 | 53 | D | 89 |
| 54 | Public Transportation | 10-20% | 45-60% | Low | 3-6 | Low | 2333312 | 50 | D | 94 |
| 55 | Hotels | 10-25% | 55-75% | Low | 5-8 | Medium | 4444333 | 71 | C | 49 |
| 56 | Resorts | 8-20% | 55-70% | Low | 5-8 | Medium | 4344333 | 67 | D | 62 |
| 57 | Travel Agencies & TMCs | 55-75% | 60-80% | Low | 6-12 | Med-High | 4455433 | 80 | B | 29 |
| 58 | Online Travel Agencies | 65-85% | 75-90% | Low | 5-10 | Medium | 5443243 | 70 | C | 51 |
| 59 | Restaurants & Food Services | 3-10% | 50-70% | Low | 5-8 | Medium | 4444332 | 69 | D | 55 |
| 60 | Real Estate Agencies (brokerages) | 55-75% | 65-80% | Low | 5-8 | Medium | 5454432 | 78 | C | 34 |
| 61 | Property Management (residential) | 45-65% | 70-85% | Low-Med | 6-15 (utilities x municipalities) | High | 5555444 | 91 | A | 7 |
| 62 | Commercial Real Estate | 50-70% | 60-80% | Low | 6-12 | Med-High | 4455444 | 85 | B | 21 |
| 63 | Construction | 8-20% | 55-70% | Low | 6-12 | Medium | 3354433 | 72 | C | 47 |
| 64 | Architecture & Engineering | 25-40% | 45-60% | Low | 3-6 | Low | 2233332 | 52 | D | 93 |
| 65 | Infrastructure Projects | 10-25% | 45-65% | Low | 4-8 | Low-Med | 3343323 | 60 | D | 76 |
| 66 | Oil & Gas | 10-25% | 45-65% | Low | 5-10 | Medium | 3444433 | 73 | C | 43 |
| 67 | Electricity & Power | 15-30% | 45-65% | Low | 5-10 | Medium | 3444323 | 66 | D | 63 |
| 68 | Renewable Energy (incl. solar installers) | 20-40% | 55-75% | Low | 6-15 | Med-High | 4455543 | 87 | B | 16 |
| 69 | Water & Utilities | 10-25% | 45-60% | Low | 3-6 | Low | 2333322 | 53 | D | 90 |
| 70 | Waste Management | 5-15% | 50-65% | Low | 3-6 | Low-Med | 3333332 | 58 | D | 80 |
| 71 | General Manufacturing | 8-20% | 40-60% | Low | 5-10 | Medium | 2444333 | 67 | D | 61 |
| 72 | Electronics Manufacturing | 10-20% | 45-65% | Low | 5-8 | Medium | 3444333 | 69 | D | 54 |
| 73 | Automotive Manufacturing (incl. tier suppliers) | 8-18% | 40-60% | Low | 5-10 | Medium | 3454433 | 76 | C | 37 |
| 74 | Aerospace Manufacturing | 10-20% | 40-55% | Low | 4-8 | Low | 2343313 | 55 | D | 85 |
| 75 | Industrial Equipment Manufacturing | 10-20% | 45-60% | Low | 4-8 | Medium | 3344333 | 65 | D | 67 |
| 76 | Chemicals Manufacturing | 10-20% | 40-60% | Low | 4-8 | Low-Med | 2344333 | 63 | D | 71 |
| 77 | Textile Manufacturing | 5-15% | 35-55% | Low | 3-6 | Low | 2333322 | 53 | D | 91 |
| 78 | Food & Beverage Manufacturing | 8-18% | 45-65% | Low | 5-8 | Medium | 3444433 | 73 | C | 44 |
| 79 | Automotive Dealerships | 25-40% | 60-80% | Low | 6-12 | High | 4555534 | 90 | A | 10 |
| 80 | Auto Repair & Services | 10-25% | 55-75% | Low | 4-8 | Medium | 4443342 | 70 | C | 52 |
| 81 | Agriculture | 3-10% | 35-55% | Low | 3-5 | Low | 2233221 | 43 | D | 99 |
| 82 | AgriTech | 55-75% | 65-80% | Low | 3-6 | Low | 4333242 | 59 | D | 78 |
| 83 | Food Processing | 5-15% | 40-60% | Low | 4-6 | Low-Med | 2333332 | 56 | D | 83 |
| 84 | Mining | 5-15% | 40-55% | Low | 3-6 | Low | 2333322 | 53 | D | 92 |
| 85 | Aerospace & Defense | 10-25% | 40-55% | Low | 4-8 | Low-Med | 3344413 | 63 | D | 72 |
| 86 | Legal Services & Law Firms | 45-65% | 55-75% | Low | 6-10 | Med-High | 4454434 | 80 | B | 28 |
| 87 | Accounting Firms | 60-80% | 65-80% | Low-Med | 6-15 (per client stack) | High | 4555444 | 89 | A | 12 |
| 88 | Auditing | 55-75% | 60-75% | Low | 5-8 | Medium | 4444334 | 73 | C | 42 |
| 89 | Tax Services (incl. indirect tax, payroll tax) | 55-75% | 65-80% | Low-Med | 10+ jurisdiction portals | High | 5555444 | 91 | A | 8 |
| 90 | Media & Publishing | 55-70% | 65-80% | Low | 4-8 | Medium | 4343222 | 56 | D | 84 |
| 91 | Broadcasting | 30-50% | 45-65% | Low | 4-8 | Medium | 3444322 | 64 | D | 70 |
| 92 | Film & Entertainment | 20-40% | 45-65% | Low | 3-6 | Low | 2233312 | 46 | D | 97 |
| 93 | Gaming | 35-55% | 55-70% | Low | 4-8 | Low | 3232232 | 48 | D | 96 |
| 94 | Sports & Sports Management | 30-50% | 60-75% | Low | 4-8 | Medium | 4343332 | 63 | D | 73 |
| 95 | Nonprofit Organizations | 40-60% | 60-80% | Low | 5-10 | Medium | 4344432 | 69 | D | 56 |
| 96 | Research & Scientific Services | 25-45% | 50-65% | Low | 4-8 | Low-Med | 3333332 | 58 | D | 81 |
| 97 | Pharmaceuticals Distribution | 25-40% | 55-70% | Low | 6-12 (50 state boards) | High | 4444434 | 77 | C | 36 |
| 98 | Medical Administration & Billing (RCM) | 70-85% | 70-85% | Med (workflow), Low-Med (%) | 8-15 + 10-40+ payer portals [S7][S16] | Very High | 5555545 | 97 | A | 1 |
| 99 | Supply Chain Management | 35-55% | 65-80% | Low | 6-12 | High | 4555434 | 86 | B | 19 |
| 100 | Procurement & Vendor Management | 60-80% | 70-85% | Low-Med | 6-12 | High | 5555444 | 91 | A | 9 |

## 4. Master Table Sorted: Best → Lowest CONXA Fit

| Rank | Industry | Fit | Tier | Back-office browser % | Typical repetitive browser workflow | Main constraint |
|---|---|---|---|---|---|---|
| 1 | Medical Administration & Billing (RCM) | 97 | A | 70-85% | Eligibility/benefits verification; PA submission and status; claim status; denial research and appeal submission; credentialing and payer enrolment | Phone/fax share of PA not browser [S1]; payer-portal MFA; CMS payer PA APIs due Jan 2027 may shrink parts of the gap [S1][S7] |
| 2 | Insurance Brokerage & Agencies | 95 | A | 70-85% | Re-entering the same risk into 3-10 carrier portals to quote; downloading policies/endorsements into the AMS; issuing COIs; carrier-by-carrier commission statement reconciliation | IVANS download and comparative raters cover parts of personal lines; commercial lines largely portal-only |
| 3 | Consumer Goods (CPG suppliers) | 91 | A | 55-75% | Researching and disputing retailer deductions portal-by-portal; weekly POS/inventory downloads; new-item setup forms | Deduction specialist software exists (e.g., HighRadius, iNymbus) and some overlaps |
| 4 | Recruitment & Staffing | 91 | A | 70-85% | Posting the same job to many boards; submitting candidates into client VMS; entering/approving timesheets in client VMS; background-check ordering; onboarding forms | Some VMS offer supplier APIs only to large agencies; job boards have partial APIs |
| 5 | Human Resources Services (PEO, payroll, benefits admin) | 91 | A | 70-85% | Enrol/terminate employees in each carrier's portal, register employers in state tax portals, respond to UI claims, process garnishments | Large carriers accept EDI 834 feeds; small carriers and state agencies are often portal-only |
| 6 | Logistics (3PL, freight brokerage) | 91 | A | 70-85% | Posting loads to boards; check-calls and tracking lookups on carrier sites; uploading PODs/invoices to shipper portals; booking DC appointments | Drivers/warehouse are deskless; some TMS native; big shippers use EDI |
| 7 | Property Management (residential) | 91 | A | 70-85% | Downloading bills from dozens of utility portals and entering them for rebilling; move-in/out utility transfers; rental registrations/inspections; vendor invoice entry | Utility bill-pay aggregators exist but coverage of small utilities is patchy |
| 8 | Tax Services (incl. indirect tax, payroll tax) | 91 | A | 65-80% | Filing and paying sales/use tax portal by portal each month; retrieving notices; registrations | Filing services cover many but not all jurisdictions; seasonal peaks |
| 9 | Procurement & Vendor Management | 91 | A | 70-85% | Supplier onboarding checks across registries; supplier-side AR uploading invoices into each customer's procurement portal; remittance retrieval | Buyer side is well served by S2P suites; the pain is on the supplier side |
| 10 | Automotive Dealerships | 90 | A | 60-80% | Warranty and incentive claim submission per OEM portal; funding packages to lenders; title/registration filings; inventory updates | DMS vendors restrict third-party data access; some DMS screens native |
| 11 | Clinics (outpatient, dental, therapy, specialty) | 89 | A | 65-80% | Checking eligibility for tomorrow's schedule, PA submissions/status, claim status and resubmission | Small IT capacity; payer-portal MFA varies; dental PM systems are often native |
| 12 | Accounting Firms | 89 | A | 65-80% | Downloading statements from many client bank portals; reconciliations; payroll filings; notice retrieval | Tax prep software is native; seasonal peaks |
| 13 | Insurance Claims Processing (carriers, TPAs, adjusting firms) | 88 | A | 65-80% | Ordering police/medical records on portals, subrogation filings, claim status updates to other carriers, document indexing | Estimating platforms are semi-native; carriers have IT gatekeeping |
| 14 | Freight & Shipping (forwarders, customs brokers, NVOCCs) | 88 | A | 70-85% | Pulling B/L, arrival notices and tracking from each carrier's site; booking on portals; customs entries; D&D disputes | CargoWise is a native Windows client (outside browser capture); large carriers now offer APIs |
| 15 | Wealth Management (RIAs, broker-dealers) | 87 | B | 65-80% | Re-keying client data from CRM into each custodian's forms; moving money; fee-billing reconciliation; account maintenance | Custodian integrations exist for data feeds but many service requests remain portal-only |
| 16 | Renewable Energy (incl. solar installers) | 87 | B | 55-75% | Filing interconnection and permit applications per utility/jurisdiction; incentive claims; REC issuance/transfer | Varies heavily by market; small installers |
| 17 | Healthcare Providers (umbrella) | 86 | B | 55-75% | Eligibility & benefits verification per visit; PA submission & follow-up; claim status; denial appeals; credentialing re-attestation | Clinical care is deskless; EHRs are often delivered via Citrix; phone/fax still carry a share of PAs [S1] |
| 18 | Business Process Outsourcing (BPO) | 86 | B | 65-85% | Portal data entry, document indexing, eligibility checks, order entry, account updates | Frequently works inside client Citrix/VDI (outside Conxa's capture scope today); FTE-based billing models can resist automation |
| 19 | Supply Chain Management | 86 | B | 65-80% | Chasing PO confirmations in supplier portals; tracking shipments across carrier sites; downloading forecasts from customer portals | Visibility platforms cover big carriers; ERPs native |
| 20 | IT Support & Managed Services | 85 | B | 75-90% | New-starter / leaver checklists across 10+ admin consoles per client, license true-ups, renewal quotes from distributor portals | Many consoles have APIs, but coverage per client stack is patchy; MSPs are cost-sensitive |
| 21 | Commercial Real Estate | 85 | B | 60-80% | Property tax bill retrieval/payment across county portals; utility bills; tenant COI collection | Lower transaction volume than residential |
| 22 | Wholesale Distribution | 84 | B | 50-70% | Entering POs received by email/portal, uploading invoices to customers' procurement portals, supplier rebate claim filing | ERPs often native/thick; EDI covers large trading partners |
| 23 | Clinical Research (CROs & trial sites) | 84 | B | 65-85% | Transcribing source data from the EHR into each sponsor's EDC; query resolution; eTMF document filing; IRB submissions | 21 CFR Part 11 validation; sponsors may restrict automation in EDC |
| 24 | E-Commerce (brands & merchants) | 84 | B | 70-85% | Listing updates across marketplaces, reimbursement claims and case logs, chargeback responses, PO entry with suppliers | Major marketplaces have APIs (e.g., Amazon SP-API) but many seller actions (cases, claims) are UI-only |
| 25 | Banking (retail & commercial ops) | 82 | B | 45-65% | KYC lookups across registries and watchlists; ordering appraisals/flood certs; loan document gathering; card dispute entry | Core banking often terminal/mainframe (outside scope); strict change control |
| 26 | Hospitals | 81 | B | 50-70% | Eligibility, PA, claim status, denial management, transfer-centre portal lookups | EHR access often via Citrix (outside capture scope); large IT gatekeeping; RCM often outsourced |
| 27 | Payments & Payment Processing | 80 | B | 70-85% | Assembling dispute evidence and submitting per portal; merchant website/registry checks during underwriting | Large processors have dispute APIs; small ISOs do not |
| 28 | Legal Services & Law Firms | 80 | B | 55-75% | Filing and retrieving docket documents; submitting invoices into client e-billing portals; records searches; IP maintenance filings | Lawyer-driven buying; courts vary by jurisdiction |
| 29 | Travel Agencies & TMCs | 80 | B | 60-80% | Refunds/exchanges on airline sites; settlement reconciliation; chasing hotel commissions; visa applications | GDS terminals out of scope; small agencies with thin margins |
| 30 | Telecommunications | 78 | C | 50-70% | Swivel-chair order entry across BSS/OSS, ordering circuits in other carriers' portals, port requests | Large legacy estates; some OSS is native |
| 31 | Diagnostic Laboratories | 78 | C | 50-70% | PA for genetic/molecular tests, eligibility, missing-info chasing, claim follow-up | Bench work is not computer-based; LIS usually native |
| 32 | Telemedicine | 78 | C | 75-90% | State licence applications/renewals, payer enrolment in every state, eligibility checks | Clinical platforms are API-native; licensing is portal-per-state |
| 33 | Internet Service Providers | 78 | C | 55-75% | Permit/pole applications per municipality/utility, order provisioning, porting | Smaller regional ISPs have little IT staff |
| 34 | Real Estate Agencies (brokerages) | 78 | C | 65-80% | Listing input and updates in MLS; transaction file compliance checks; commission processing | RESO Web API covers MLS data reads, not listing entry; agents are independent contractors |
| 35 | Corporate Banking | 77 | C | 50-70% | Periodic KYC refresh pulling registry filings; onboarding document collection; trade doc checks | Token-based MFA on banking platforms; heavy compliance review |
| 36 | Pharmaceuticals Distribution | 77 | C | 55-70% | Verifying customer licences on state board sites; chargeback and contract eligibility checks; returns | Validated systems; large distributors have in-house IT |
| 37 | Automotive Manufacturing (incl. tier suppliers) | 76 | C | 40-60% | Downloading releases and quality claims from each OEM portal; PPAP submissions | EDI covers core schedules |
| 38 | Professional Training | 76 | C | 65-80% | Reporting completions to each licensing board, enrolment admin, certificate issuance | Small organisations; low value per task |
| 39 | Health Insurance (payers) | 75 | C | 55-75% | Provider roster updates, claim pend resolution, eligibility files exceptions, regulatory portal submissions | Payers own their core systems (API path exists internally); core admin often native/mainframe |
| 40 | Universities & Colleges | 75 | C | 60-75% | Transcript/credential evaluation, financial-aid verification, grant submissions and reporting across federal portals | Slow procurement; decentralised IT |
| 41 | Insurance (carriers) | 73 | C | 55-75% | Pulling third-party data into underwriting; rate/form filings; agent appointment/licensing; bordereaux processing | Legacy PAS on mainframe; carriers can build integrations |
| 42 | Auditing | 73 | C | 60-75% | Sending/tracking confirmations; pulling evidence from client portals | Independence/evidence-integrity rules; seasonal |
| 43 | Oil & Gas | 73 | C | 45-65% | Downloading revenue/JIB statements from many operator portals; state production filings; lease record searches | Field ops deskless; ERP native |
| 44 | Food & Beverage Manufacturing | 73 | C | 45-65% | Deductions disputes; retailer item setup; audit document uploads | Plant workforce deskless |
| 45 | IT Services | 72 | C | 65-80% | Dual timesheet entry (own PSA + client portal), invoice upload per client portal, status report compilation | Internal volume per firm is moderate; real value is as a reseller channel |
| 46 | Digital Marketing | 72 | C | 75-90% | Weekly client report compilation from 5-10 platforms, campaign duplication across accounts, listing updates | Major ad platforms have APIs and connector tools (Supermetrics); Mac-heavy fleets |
| 47 | Construction | 72 | C | 55-70% | Collecting COIs and prequal docs; submitting certified payroll to agency portals; downloading bid documents; permit applications | Field workforce deskless; accounting systems native |
| 48 | Public Services (benefits, licensing agencies) | 71 | C | 45-65% | Cross-checking applicant data across agency databases and portals | Mainframe back ends; accreditation |
| 49 | Hotels | 71 | C | 55-75% | Charging OTA virtual cards one by one; reconciling OTA commissions; group rooming lists; responding to reviews | Rate/availability already automated via channel-manager APIs |
| 50 | FinTech | 70 | C | 75-90% | KYC manual review lookups, partner-bank portal reconciliations, state licence renewals (NMLS) | Engineering-led; will build APIs where possible |
| 51 | Online Travel Agencies | 70 | C | 75-90% | Manual refunds and changes on supplier sites where APIs don't support the action | API-native core business |
| 52 | Auto Repair & Services | 70 | C | 55-75% | Parts price/availability checks, insurer estimate uploads | Technicians deskless; parts aggregators exist |
| 53 | Warehousing | 69 | D | 55-70% | Inventory reports to customer portals, appointment booking, billing prep | Floor work deskless; WMS RF-driven |
| 54 | Electronics Manufacturing | 69 | D | 45-65% | BOM availability/price checks, customer portal forecast downloads | Distributor APIs exist |
| 55 | Restaurants & Food Services | 69 | D | 50-70% | Disputing delivery-app error charges; menu/price sync across delivery portals; payout reconciliation; supplier ordering | Deskless workforce; small single-unit budgets |
| 56 | Nonprofit Organizations | 69 | D | 60-80% | Grant reporting in each funder's portal; multistate charitable-solicitation renewals; gift entry | Low budgets |
| 57 | Municipal Services | 68 | D | 45-65% | Permit intake from email to system, state report submissions | Small IT, low budgets |
| 58 | Asset Management | 67 | D | 55-70% | Downloading statements/reports from fund-admin and counterparty portals; regulatory form filing | Core OMS/PMS often native; large firms have data feeds |
| 59 | Retail Stores | 67 | D | 55-70% | Item setup, price changes across channels, vendor compliance chargebacks | Store staff are deskless; EDI covers core supplier transactions |
| 60 | Government Administration | 67 | D | 45-65% | Cross-agency lookups, grants reporting, procurement entry | Security accreditation, procurement cycles, on-prem mandates |
| 61 | General Manufacturing | 67 | D | 40-60% | Downloading POs and uploading ASNs/invoices to customer portals; supplier quality claims | SAP GUI and MES are native; shop floor deskless |
| 62 | Resorts | 67 | D | 55-70% | Virtual-card processing, group/event admin, OTA reconciliations | Mostly deskless workforce |
| 63 | Electricity & Power | 66 | D | 45-65% | Customer transfer exceptions in market portals, regulatory submissions | Critical-infrastructure security; native cores |
| 64 | SaaS Companies | 66 | D | 75-90% | Customer onboarding config, account provisioning, support-to-billing handoffs | Internal automation usually solved via APIs/iPaaS (Zapier, Workato) |
| 65 | Cybersecurity | 65 | D | 70-85% | Alert enrichment lookups, access reviews, audit evidence screenshots/exports, questionnaire filling | SOAR platforms and APIs already cover much of SOC; security buyers are sceptical of agents |
| 66 | Medical Devices | 65 | D | 50-70% | Keeping sales reps' credentials current across hospital portals; distributor sales/chargeback data; regulatory submissions | GxP/QMS validation friction; regulatory systems often validated and locked |
| 67 | Industrial Equipment Manufacturing | 65 | D | 45-60% | Warranty claim processing, parts orders from dealer portals | Often the portal owner, not user |
| 68 | Pharmaceuticals | 64 | D | 50-70% | Adverse-event case intake from many sources, state price-transparency filings, chargeback validation | Validated (GxP/Part 11) systems slow any new automation |
| 69 | Airlines | 64 | D | 40-60% | Refund processing, ADM handling in BSP Link, interline billing | Terminal/cryptic PSS and native MRO are out of scope |
| 70 | Broadcasting | 64 | D | 45-65% | Order entry from agency portals, make-goods, affidavits | Core systems native |
| 71 | Chemicals Manufacturing | 63 | D | 40-60% | Regulatory submissions, customer compliance questionnaires | Native ERP |
| 72 | Aerospace & Defense | 63 | D | 40-55% | Invoice and receiving-report submission in government invoicing portals; supplier compliance | CMMC/ITAR; classified networks air-gapped |
| 73 | Sports & Sports Management | 63 | D | 60-75% | Player registrations/transfers on federation portals, ticket ops, sponsor reports | Seasonal; small back offices |
| 74 | Online Marketplaces (operators) | 62 | D | 70-85% | Seller KYC lookups on business registries, dispute handling | Operators own their platform and build internal tools |
| 75 | Courier & Delivery | 62 | D | 55-70% | Damage/loss claims, customer account onboarding | Overwhelmingly deskless workforce |
| 76 | Infrastructure Projects | 60 | D | 45-65% | Progress/compliance reporting to agency portals | Public procurement |
| 77 | EdTech | 59 | D | 75-90% | District onboarding, content uploads | API-native; rostering via Clever APIs |
| 78 | AgriTech | 59 | D | 65-80% | Onboarding and data imports | API-native |
| 79 | Advertising Agencies | 58 | D | 65-80% | Insertion-order entry, trafficking to publisher portals, billing reconciliation | Creative work is native/Mac; many DSPs have APIs |
| 80 | Waste Management | 58 | D | 50-65% | Manifest submissions, municipal billing reconciliations | Deskless workforce |
| 81 | Research & Scientific Services | 58 | D | 50-65% | Sample intake from client portals, grant reporting | Lab work non-computer |
| 82 | Data & AI Services | 56 | D | 70-85% | Dataset pulls from client portals, QA checks, report generation | Engineering-heavy; APIs and scripts preferred |
| 83 | Food Processing | 56 | D | 40-60% | Traceability record submissions; retailer portal work | Deskless workforce |
| 84 | Media & Publishing | 56 | D | 65-80% | Cross-posting content, ad-ops trafficking, permissions logging | Mac-heavy editorial fleets |
| 85 | Aerospace Manufacturing | 55 | D | 40-55% | Supplier portal quality/delivery updates | ITAR, air-gapped networks |
| 86 | Investment Banking | 54 | D | 40-55% | Comparable-company data pulls, data-room indexing | Core tools are native terminals and Office |
| 87 | Schools (K-12) | 54 | D | 60-75% | Attendance/state reporting, enrolment records, IEP compliance forms | ChromeOS fleets (not Windows); low budgets |
| 88 | Biotechnology | 53 | D | 45-65% | Sample/vendor ordering, CRO data pulls, grant reporting | Low transaction volume; lab work is not computer-based |
| 89 | Railways | 53 | D | 40-60% | Freight billing and car tracking lookups | Legacy native systems; safety-critical ops |
| 90 | Water & Utilities | 53 | D | 45-60% | Regulatory sampling/report submissions | Public entities; native systems |
| 91 | Textile Manufacturing | 53 | D | 35-55% | Compliance questionnaires for buyers; export filings | Emerging-market SMEs; low digital budgets |
| 92 | Mining | 53 | D | 40-55% | Safety/environmental filings | Deskless, remote sites |
| 93 | Architecture & Engineering | 52 | D | 45-60% | Permit submissions and resubmittals | CAD/BIM native |
| 94 | Public Transportation | 50 | D | 45-60% | Federal/state ridership and grant reporting | Public procurement; deskless workforce |
| 95 | Cloud Computing | 49 | D | 70-85% | Quota requests, partner-portal deal registration, marketplace listings | Almost everything is API/IaC-driven |
| 96 | Gaming | 48 | D | 55-70% | Store page updates, build submissions, support triage | Engineering-led |
| 97 | Film & Entertainment | 46 | D | 45-65% | Deliverables uploads, residual reporting | Project-based; Mac fleets |
| 98 | Management Consulting | 45 | D | 50-65% | Data collection from public databases, timesheets/expenses | Work is non-repetitive and document-centric |
| 99 | Agriculture | 43 | D | 35-55% | Programme applications and compliance reporting | Overwhelmingly deskless |
| 100 | Software Development | 41 | D | 50-70% | Release notes, ticket triage, access requests, license/seat admin | Core work (coding) happens in native IDE/terminal; Mac-heavy fleets |

## 5. Top 20 Industries for CONXA

The umbrella row *Healthcare Providers* is left out because its fit is counted in Clinics, Hospitals and Medical Administration & Billing. **Entry route**: *Direct* = Rung 2 (the organisation automates its own work). *Channel* = Rung 3 (a vertical SaaS vendor or IT-services firm distributes skills to many organisations) [S14].

| # | Industry | Fit | Entry route | Who to approach | Why it ranks here |
|---|---|---|---|---|---|
| 1 | **Medical Administration & Billing (RCM)** | 97 | Direct (RCM/billing companies) + Channel | RCM platforms, clearinghouses, practice-management vendors | Best-evidenced fit in the study. The work runs through dozens of payer portals with no API, at very high volume. Existing RPA breaks when a portal changes [S3], which is the failure Conxa's self-healing targets. |
| 2 | **Insurance Brokerage & Agencies** | 95 | Channel first, Direct for large agencies | Agency-management-system vendors, agency networks/aggregators | Textbook Conxa shape: an agency re-keys one risk into many carrier portals it doesn't own. The work is daily and has no API path. |
| 3 | **Consumer Goods (CPG suppliers)** | 91 | Direct | Deduction-management and trade-promotion vendors, retail-sales brokers | Retailers dictate the portals, and suppliers lose real money on deductions they don't dispute. High value and repetitive, with no API on the supplier's side. |
| 4 | **Recruitment & Staffing** | 91 | Direct + Channel | Staffing ATS/back-office vendors, VMS-supplier tooling | Staffing firms (suppliers) must use each client's VMS portal, and they don't own those portals. That's the no-API, cross-system pattern Conxa is built for, at weekly timesheet scale. |
| 5 | **Human Resources Services (PEO, payroll, benefits admin)** | 91 | Direct | PEOs themselves; payroll/HCM platforms | Each employer event fans out to carrier and state portals with no common API, and repeats for every client. |
| 6 | **Logistics (3PL, freight brokerage)** | 91 | Direct + Channel | TMS vendors for brokers | The brokerage desk lives in browser tabs, across shipper, carrier and board portals the broker doesn't own. Very high load volume. |
| 7 | **Property Management (residential)** | 91 | Channel first | Property-management software platforms, utility-billing service providers | Hundreds of units multiply into many utility and municipal portals with no API. Monthly and highly repetitive. |
| 8 | **Tax Services (incl. indirect tax, payroll tax)** | 91 | Direct | Tax-compliance firms, accounting networks | One filing multiplies across jurisdictions, each with its own portal and no API, and repeats every period. |
| 9 | **Procurement & Vendor Management** | 91 | Direct | Supplier AR teams at mid-market manufacturers/distributors; AP/AR outsourcers | The best target is a supplier's AR team uploading invoices to dozens of customer procurement portals it doesn't control. |
| 10 | **Automotive Dealerships** | 90 | Direct (dealer groups) + Channel | Dealer groups, dealership software vendors | Dealers sit between OEM, lender and DMV portals none of which they control. The volume is per vehicle and the claim dollars are real. |
| 11 | **Clinics (outpatient, dental, therapy, specialty)** | 89 | Channel | Practice-management and RCM vendors | Browser-based practice systems plus payer portals, and no in-house engineering. Best reached through practice-management and RCM vendors (Rung 3). |
| 12 | **Accounting Firms** | 89 | Channel + Direct | Practice-management vendors, accounting networks and IT-services firms | Every client adds another set of bank, payroll and tax portals. The work is monthly and repetitive, and firms are Windows shops. |
| 13 | **Insurance Claims Processing (carriers, TPAs, adjusting firms)** | 88 | Direct | TPAs and independent adjusting firms | Claims work crosses several external portals for every claim. TPAs and independent adjusters are easier to deploy into than carriers. |
| 14 | **Freight & Shipping (forwarders, customs brokers, NVOCCs)** | 88 | Direct | Mid-size forwarders and customs brokers | Forwarders touch dozens of carrier and customs portals for every shipment. The CargoWise native client limits end-to-end coverage. |
| 15 | **Wealth Management (RIAs, broker-dealers)** | 87 | Direct + Channel | Multi-custodian RIAs; wealth-tech platforms | Multi-custodian RIAs re-key the same client into systems they don't control. Regulated clients favour local execution. |
| 16 | **Renewable Energy (incl. solar installers)** | 87 | Direct | Residential solar installers and developers | Each utility and jurisdiction runs its own portal with no API, and installers file every project through them. |
| 17 | **Business Process Outsourcing (BPO)** | 86 | Channel | Outcome-priced BPOs (also a delivery partner) | BPO staff are, by definition, people doing repetitive browser work. The fit is strongest with outcome-priced BPOs, and they double as a Rung-3 channel. Citrix is the main disqualifier. |
| 18 | **Supply Chain Management** | 86 | Direct | Mid-market manufacturers/distributors' supply-chain teams | The job is coordinating across partners' portals. The large carriers are covered by visibility platforms; the long tail isn't. |
| 19 | **IT Support & Managed Services** | 85 | Channel | MSPs themselves resell to their clients | Every client is a different stack, so the same process crosses many admin consoles, and MSPs are Windows shops. Also a natural Rung-3 reseller. |
| 20 | **Commercial Real Estate** | 85 | Direct | CRE owners/operators, lease-admin outsourcers | Same portal-sprawl pattern as residential property management, with fewer transactions and higher value. |

## 6. Top 10 Workflows to Look For

When talking to companies in the top industries, listen for these workflows. For each one, qualify with the PRD §6 checks [S14]: ≥3 systems, daily or weekly, done by a person today, no API path, stable login, Windows.

| # | Workflow | Industries | Shape (systems crossed) | Why CONXA fits | Evidence | Qualify / watch for |
|---|---|---|---|---|---|---|
| 1 | **Payer eligibility & benefits verification** before each visit | Medical billing, clinics, labs, telemedicine | PM/EHR → 10–40+ payer portals → PM/EHR [S7] | Per-patient, daily, same steps each time, no API on the provider side. Bots break when portals change [S3] | **SB**: RCM workflows automated by RPA (verified) [S3]; portal counts from a vendor source [S7] | Payer-portal MFA; whether a clearinghouse's 270/271 eligibility transaction already covers that payer |
| 2 | **Prior authorisation submission & status checks** | Medical billing, clinics, labs | EHR → payer portal/ePA tool → document upload → status polling | ~40 PAs/physician/week and ~13 h/week of physician and staff time [S1] | **M**: AMA 2025 survey, n=1,000 [S1] | Phone is the most common channel for medical-service PAs [S1], so CONXA only covers the portal slice. CMS payer PA APIs are due Jan 2027 [S1][S7]: sell on 2026–28 relief |
| 3 | **Claim status, denial research & appeal submission** | Medical billing, clinics, hospitals' RCM | Clearinghouse → payer portal → PM system → appeal upload | Continuous per claim; manual and error-prone | **SB**: verified 3-0/2-1 [S3][S6] | Existing RPA vendor in place? Pitch self-healing against bot-maintenance cost [S3] |
| 4 | **Multi-carrier quoting, policy/endorsement download & commission reconciliation** | Insurance agencies & brokers | AMS → 3–10 carrier portals → AMS | The same risk re-keyed into every carrier; commissions reconciled carrier by carrier | **RI/[K]** | Which carriers already come through IVANS/comparative raters, since those are excluded; commercial lines are the gap |
| 5 | **Timesheet, submittal & invoice entry into client VMS portals** | Staffing & recruitment | ATS/back office → each client's VMS (Fieldglass, Beeline…) → payroll/billing | Weekly per worker, portals the agency doesn't own | **RI/[K]** | VMS supplier APIs (large agencies only); login/MFA policy per VMS |
| 6 | **Shipment tracking, document retrieval & POD/invoice upload** | 3PL/brokerage, forwarders, supply chain | TMS → carrier sites → shipper/customer portals → TMS | Per load or shipment, dozens of counterparties | **RI/[K]** | Big carriers covered by visibility platforms and APIs; the long tail is the target. CargoWise screens are native |
| 7 | **Supplier-side invoice submission & remittance retrieval in customer procurement portals** | Procurement/AR, wholesale, manufacturing | ERP → Ariba/Coupa/Jaggaer/Tungsten (per customer) → ERP | Each customer mandates its own portal or format | **SB**: buyers mandate EDI/cXML/APIs for suppliers (core claim verified 3-0) [S5] | Customers already on EDI are out; count the portal-only customers |
| 8 | **Retailer deduction/chargeback research & disputes** | CPG, F&B manufacturing | Retailer portals (Retail Link/Luminate, Vendor Central…) → ERP → dispute submission | Money recovered per dispute; time limits on disputes | **SB/RI**: retail is EDI-embedded [S5]; deduction volume [K] | Deduction-management software already in use? |
| 9 | **Multi-jurisdiction filings & registrations** (sales tax, new-hire reporting, licence renewals, charity registrations) | Tax services, HR services/PEO, accounting, pharma distribution, nonprofits | Source data → one portal per state/jurisdiction → confirmation archive | Monthly or quarterly × many jurisdictions, each with its own portal | **RI/[K]** | Filing-service APIs cover some jurisdictions; seasonal peaks |
| 10 | **Utility & property-tax bill retrieval, payment and transfers** | Residential & commercial property management | PM platform → dozens of utility/county portals → PM platform | Monthly per property; aggregators miss small utilities | **RI/[K]** | Aggregator coverage; one login per property vs. shared accounts |

**Also worth listening for:** dealer warranty and incentive claims on OEM portals (automotive dealerships), user on/offboarding across each client's SaaS admin consoles (MSPs), custodian account opening and money movement (wealth management), EDC data transcription (clinical research sites), and interconnection and permit applications (solar installers).

---

## 7. Industry-by-Industry Analysis

Grouped by sector. Each entry lists browser % (RI), typical browser work, common applications, repetitive workflows, frequency, systems involved, automation potential, evidence, confidence, limitations, and CONXA fit reasoning. Application names and workflow descriptions marked [K] are practitioner knowledge to confirm in discovery.

### Technology

#### 1. Software Development: Fit 41 (Tier D, rank 100)

- **Browser/web share (RI):** org-wide 40-60%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Issue tracking, code review, CI dashboards, cloud consoles, docs, SaaS admin.
- **Common applications [K]:** GitHub/GitLab, Jira, Confluence, AWS/Azure/GCP consoles, Slack; IDEs and terminals are native (not browser).
- **Repetitive, rules-based workflows:** Release notes, ticket triage, access requests, license/seat admin.
- **Frequency:** Daily, low per-task volume. **Systems per workflow:** 5-10, almost all with APIs. **Automation potential:** Low-Med.
- **Evidence:** [K]; SaaS-heavy sector per [S13] (low-quality, directional).
- **Limitations / assumptions:** Core work (coding) happens in native IDE/terminal; Mac-heavy fleets.
- **Fit scores:** BS 3 · REP 2 · MS 1 · MAN 2 · API 1 · DEP 4 · VAL 2.
- **Fit reasoning:** Engineers already script against APIs; Conxa's no-API advantage is irrelevant. Treat as a channel (SaaS vendors, #3), not a buyer.

#### 2. IT Services: Fit 72 (Tier C, rank 45)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** Timesheets in client portals, invoicing into client procurement portals, client reporting, ticketing.
- **Common applications [K]:** ServiceNow, Jira, client VMS/timesheet portals, SAP Ariba/Coupa (supplier side), Salesforce, ERP (Odoo, NetSuite).
- **Repetitive, rules-based workflows:** Dual timesheet entry (own PSA + client portal), invoice upload per client portal, status report compilation.
- **Frequency:** Weekly (timesheets), monthly (invoicing). **Systems per workflow:** 4-8. **Automation potential:** Med-High.
- **Evidence:** [K]; Conxa pilot evidence on services firms [S14].
- **Limitations / assumptions:** Internal volume per firm is moderate; real value is as a reseller channel.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 3 · API 3 · DEP 4 · VAL 3.
- **Fit reasoning:** PRD Rung 3: one services relationship reaches many client enterprises [S14]. Internal timesheet/invoice work is the demo; client cross-system processes are the sale.

#### 3. SaaS Companies: Fit 66 (Tier D, rank 64)

- **Browser/web share (RI):** org-wide 65-85%; back-office 75-90%. Confidence: Low-Med.
- **Typical browser work:** CRM, support desk, billing, customer onboarding, product admin consoles.
- **Common applications [K]:** Salesforce, HubSpot, Zendesk, Intercom, Stripe, Gainsight, Notion, Google Workspace/M365.
- **Repetitive, rules-based workflows:** Customer onboarding config, account provisioning, support-to-billing handoffs.
- **Frequency:** Daily. **Systems per workflow:** 6-15, mostly with APIs. **Automation potential:** Medium.
- **Evidence:** [S4] enterprises run parallel web tools (48% of M365 customers also use Google Workspace); [K].
- **Limitations / assumptions:** Internal automation usually solved via APIs/iPaaS (Zapier, Workato).
- **Fit scores:** BS 5 · REP 3 · MS 4 · MAN 3 · API 2 · DEP 4 · VAL 3.
- **Fit reasoning:** Weak as an internal-automation buyer, strongest as a distribution channel: the vendor records its own product's workflows and ships them to customers [S14].

#### 4. Cybersecurity: Fit 65 (Tier D, rank 65)

- **Browser/web share (RI):** org-wide 60-80%; back-office 70-85%. Confidence: Low.
- **Typical browser work:** SOC alert triage across consoles, threat-intel lookups, vendor-risk questionnaires, compliance evidence collection.
- **Common applications [K]:** SIEM/EDR consoles (Splunk, CrowdStrike, Sentinel), VirusTotal, OneTrust, Vanta/Drata, ServiceNow.
- **Repetitive, rules-based workflows:** Alert enrichment lookups, access reviews, audit evidence screenshots/exports, questionnaire filling.
- **Frequency:** Daily (SOC), quarterly (audits). **Systems per workflow:** 5-12. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** SOAR platforms and APIs already cover much of SOC; security buyers are sceptical of agents.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 3 · API 2 · DEP 3 · VAL 3.
- **Fit reasoning:** Compliance evidence collection (screenshots/exports from many consoles) is a real niche, but buyers have API-first alternatives.

#### 5. Cloud Computing: Fit 49 (Tier D, rank 95)

- **Browser/web share (RI):** org-wide 55-75%; back-office 70-85%. Confidence: Low.
- **Typical browser work:** Consoles, billing, support, partner portals.
- **Common applications [K]:** AWS/Azure/GCP consoles, Terraform Cloud, Datadog, Salesforce.
- **Repetitive, rules-based workflows:** Quota requests, partner-portal deal registration, marketplace listings.
- **Frequency:** Weekly. **Systems per workflow:** 4-8, API-native. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Almost everything is API/IaC-driven.
- **Fit scores:** BS 4 · REP 2 · MS 3 · MAN 2 · API 1 · DEP 4 · VAL 2.
- **Fit reasoning:** API-native industry; browser automation is the wrong tool.

#### 6. Data & AI Services: Fit 56 (Tier D, rank 82)

- **Browser/web share (RI):** org-wide 60-80%; back-office 70-85%. Confidence: Low.
- **Typical browser work:** Labelling tools, notebooks, client data portals, cloud consoles.
- **Common applications [K]:** Labelbox/Scale-type tools, Databricks, Snowflake, Jupyter, client SFTP/portals.
- **Repetitive, rules-based workflows:** Dataset pulls from client portals, QA checks, report generation.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Low-Med.
- **Evidence:** [K].
- **Limitations / assumptions:** Engineering-heavy; APIs and scripts preferred.
- **Fit scores:** BS 4 · REP 3 · MS 3 · MAN 3 · API 2 · DEP 3 · VAL 2.
- **Fit reasoning:** Some client-portal data retrieval, but engineers self-serve with code.

#### 7. IT Support & Managed Services: Fit 85 (Tier B, rank 20)

- **Browser/web share (RI):** org-wide 65-80%; back-office 75-90%. Confidence: Low-Med.
- **Typical browser work:** User on/offboarding across each client's SaaS admin consoles, license management, distributor ordering, ticket work.
- **Common applications [K]:** ConnectWise/Autotask/HaloPSA, NinjaOne/Datto RMM, M365 & Google admin, Pax8/TD SYNNEX/Ingram portals, vendor license portals.
- **Repetitive, rules-based workflows:** New-starter / leaver checklists across 10+ admin consoles per client, license true-ups, renewal quotes from distributor portals.
- **Frequency:** Daily, per ticket. **Systems per workflow:** 8-20 across clients. **Automation potential:** High.
- **Evidence:** [K]; multi-tool sprawl consistent with [S4].
- **Limitations / assumptions:** Many consoles have APIs, but coverage per client stack is patchy; MSPs are cost-sensitive.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 4 · API 3 · DEP 4 · VAL 4.
- **Fit reasoning:** Every client is a different stack, so the same process crosses many admin consoles, and MSPs are Windows shops. Also a natural Rung-3 reseller.

### Business & Professional Services

#### 8. Digital Marketing: Fit 72 (Tier C, rank 46)

- **Browser/web share (RI):** org-wide 70-85%; back-office 75-90%. Confidence: Low-Med.
- **Typical browser work:** Campaign setup, reporting pulls, listings management, QA across ad platforms.
- **Common applications [K]:** Google Ads, Meta Ads Manager, LinkedIn Campaign Manager, GA4, HubSpot, Semrush, Google Business Profile.
- **Repetitive, rules-based workflows:** Weekly client report compilation from 5-10 platforms, campaign duplication across accounts, listing updates.
- **Frequency:** Daily/weekly. **Systems per workflow:** 5-12. **Automation potential:** Medium.
- **Evidence:** [K]; SaaS-heavy sector per [S13].
- **Limitations / assumptions:** Major ad platforms have APIs and connector tools (Supermetrics); Mac-heavy fleets.
- **Fit scores:** BS 5 · REP 4 · MS 5 · MAN 4 · API 2 · DEP 3 · VAL 3.
- **Fit reasoning:** Browser share is very high, but the biggest platforms have APIs and reporting connectors already exist. Mid-tier fit.

#### 9. Advertising Agencies: Fit 58 (Tier D, rank 79)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** Trafficking, media buying portals, client approvals, time/billing.
- **Common applications [K]:** Adobe CC (native), DSPs (The Trade Desk, DV360), Workamajig/Advantage, publisher portals.
- **Repetitive, rules-based workflows:** Insertion-order entry, trafficking to publisher portals, billing reconciliation.
- **Frequency:** Weekly. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Creative work is native/Mac; many DSPs have APIs.
- **Fit scores:** BS 4 · REP 3 · MS 4 · MAN 3 · API 2 · DEP 2 · VAL 3.
- **Fit reasoning:** Creative work runs in native Mac apps; media operations is a smaller slice.

#### 10. Management Consulting: Fit 45 (Tier D, rank 98)

- **Browser/web share (RI):** org-wide 45-60%; back-office 50-65%. Confidence: Low.
- **Typical browser work:** Research, data gathering from public sites, client portals, collaboration.
- **Common applications [K]:** Excel/PowerPoint (native), M365, Capital IQ, Statista, client SharePoint.
- **Repetitive, rules-based workflows:** Data collection from public databases, timesheets/expenses.
- **Frequency:** Ad hoc. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Work is non-repetitive and document-centric.
- **Fit scores:** BS 3 · REP 1 · MS 3 · MAN 2 · API 3 · DEP 2 · VAL 2.
- **Fit reasoning:** Low repetition: a compile never pays back on one-off analysis.

#### 11. Business Process Outsourcing (BPO): Fit 86 (Tier B, rank 18)

- **Browser/web share (RI):** org-wide 60-85%; back-office 65-85%. Confidence: Low-Med.
- **Typical browser work:** Executing clients' back-office processes: data entry, claims, collections, order management, KYC.
- **Common applications [K]:** Client systems (often via Citrix/VDI), client web portals, CRM/ticketing, Excel.
- **Repetitive, rules-based workflows:** Portal data entry, document indexing, eligibility checks, order entry, account updates.
- **Frequency:** Continuous, high volume (per-transaction). **Systems per workflow:** 5-15 (client-dependent). **Automation potential:** High.
- **Evidence:** [K]; RPA investment by GBS/BPO providers noted in [S3]-adjacent Everest material (not verified).
- **Limitations / assumptions:** Frequently works inside client Citrix/VDI (outside Conxa's capture scope today); FTE-based billing models can resist automation.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** BPO staff are, by definition, people doing repetitive browser work. The fit is strongest with outcome-priced BPOs, and they double as a Rung-3 channel. Citrix is the main disqualifier.

#### 12. Recruitment & Staffing: Fit 91 (Tier A, rank 4)

- **Browser/web share (RI):** org-wide 65-80%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Job posting, candidate sourcing, VMS submittals, onboarding checks, timesheets and invoicing.
- **Common applications [K]:** Bullhorn, Avionté, JobAdder, Indeed, LinkedIn Recruiter, SAP Fieldglass, Beeline, VNDLY, Sterling/HireRight, E-Verify.
- **Repetitive, rules-based workflows:** Posting the same job to many boards; submitting candidates into client VMS; entering/approving timesheets in client VMS; background-check ordering; onboarding forms.
- **Frequency:** Daily, per requisition/candidate/week. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Some VMS offer supplier APIs only to large agencies; job boards have partial APIs.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Staffing firms (suppliers) must use each client's VMS portal, and they don't own those portals. That's the no-API, cross-system pattern Conxa is built for, at weekly timesheet scale.

#### 13. Human Resources Services (PEO, payroll, benefits admin): Fit 91 (Tier A, rank 5)

- **Browser/web share (RI):** org-wide 60-80%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Benefits enrolment into carrier portals, state new-hire and tax registrations, unemployment claim responses, garnishments.
- **Common applications [K]:** ADP/Paychex/isolved, benefits carrier portals, state workforce/tax agency portals, E-Verify, Workday/BambooHR.
- **Repetitive, rules-based workflows:** Enrol/terminate employees in each carrier's portal, register employers in state tax portals, respond to UI claims, process garnishments.
- **Frequency:** Daily (enrolment events), monthly/quarterly (filings). **Systems per workflow:** 6-15 (many carriers x states). **Automation potential:** High.
- **Evidence:** [K]; HR named as fastest-growing RPA function in a (refuted-as-a-whole) market report [S17], so treat that as directional only.
- **Limitations / assumptions:** Large carriers accept EDI 834 feeds; small carriers and state agencies are often portal-only.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Each employer event fans out to carrier and state portals with no common API, and repeats for every client.

#### 95. Nonprofit Organizations: Fit 69 (Tier D, rank 56)

- **Browser/web share (RI):** org-wide 40-60%; back-office 60-80%. Confidence: Low.
- **Typical browser work:** Grant applications/reporting, donor CRM, gift entry, charity registrations.
- **Common applications [K]:** Raiser's Edge NXT, Salesforce NPSP, Bloomerang, Grants.gov, foundation portals, state charity registration portals.
- **Repetitive, rules-based workflows:** Grant reporting in each funder's portal; multistate charitable-solicitation renewals; gift entry.
- **Frequency:** Monthly/annual. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Low budgets.
- **Fit scores:** BS 4 · REP 3 · MS 4 · MAN 4 · API 4 · DEP 3 · VAL 2.
- **Fit reasoning:** The workflows fit well, but budgets are too small.

### Healthcare & Life Sciences

#### 14. Healthcare Providers (umbrella): Fit 86 (Tier B, rank 17)

- **Browser/web share (RI):** org-wide 20-35%; back-office 55-75%. Confidence: Low (%), Med (workflow evidence).
- **Typical browser work:** Eligibility checks, prior authorisation, claim status, referrals, credentialing, records requests.
- **Common applications [K]:** Epic/Oracle Health, athenahealth, eClinicalWorks, NextGen, Availity, payer portals (UHC, Aetna, Cigna, BCBS plans), CAQH ProView, Waystar.
- **Repetitive, rules-based workflows:** Eligibility & benefits verification per visit; PA submission & follow-up; claim status; denial appeals; credentialing re-attestation.
- **Frequency:** Daily, per patient; ~40 PAs per physician per week [S1]. **Systems per workflow:** 4-10, plus 10-40+ payer portals [S7]. **Automation potential:** High.
- **Evidence:** [S1] AMA 2025; [S2] CAQH/DataSpring 2025; [S3] PYMNTS 2025; [S6] RevCycle 2025; [S7] (vendor).
- **Limitations / assumptions:** Clinical care is deskless; EHRs are often delivered via Citrix; phone/fax still carry a share of PAs [S1].
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 5.
- **Fit reasoning:** Umbrella row. See Clinics (#16), Hospitals (#15), and Medical Administration & Billing (#98), where the fit concentrates.

#### 15. Hospitals: Fit 81 (Tier B, rank 26)

- **Browser/web share (RI):** org-wide 15-30%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Revenue-cycle work in payer portals, bed/transfer coordination, supply ordering, credentialing.
- **Common applications [K]:** Epic/Oracle Health (frequently via Citrix), payer portals, clearinghouses, Workday/Infor, GHX, Symplr.
- **Repetitive, rules-based workflows:** Eligibility, PA, claim status, denial management, transfer-centre portal lookups.
- **Frequency:** Continuous, very high volume. **Systems per workflow:** 8-15 [S16]. **Automation potential:** High.
- **Evidence:** [S1]; [S3] (hospitals must standardise workflows before bots work); [S16] (vendor).
- **Limitations / assumptions:** EHR access often via Citrix (outside capture scope); large IT gatekeeping; RCM often outsourced.
- **Fit scores:** BS 3 · REP 5 · MS 5 · MAN 4 · API 4 · DEP 2 · VAL 5.
- **Fit reasoning:** Volume and value are enormous, but deployment is hard (Citrix, IT gates, existing RPA). Sell to the RCM department's browser-side portal work, not the EHR.

#### 16. Clinics (outpatient, dental, therapy, specialty): Fit 89 (Tier A, rank 11)

- **Browser/web share (RI):** org-wide 25-40%; back-office 65-80%. Confidence: Low-Med.
- **Typical browser work:** Front-desk eligibility checks, PA, claims follow-up, referrals, scheduling.
- **Common applications [K]:** athenahealth, eClinicalWorks, NextGen, Dentrix/Open Dental (native), Availity, payer portals, Weave.
- **Repetitive, rules-based workflows:** Checking eligibility for tomorrow's schedule, PA submissions/status, claim status and resubmission.
- **Frequency:** Daily, per appointment. **Systems per workflow:** 5-10 + many payer portals. **Automation potential:** High.
- **Evidence:** [S1] (~40 PAs/physician/week, 13 h/week); [S7] (vendor, 10-40+ portals).
- **Limitations / assumptions:** Small IT capacity; payer-portal MFA varies; dental PM systems are often native.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Browser-based practice systems plus payer portals, and no in-house engineering. Best reached through practice-management and RCM vendors (Rung 3).

#### 17. Diagnostic Laboratories: Fit 78 (Tier C, rank 31)

- **Browser/web share (RI):** org-wide 15-30%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Requisition intake from provider portals, eligibility/PA (esp. molecular tests), billing, results delivery.
- **Common applications [K]:** LIS (Orchard, Sunquest; mostly native), payer portals, clearinghouses, XiFin/Telcor billing.
- **Repetitive, rules-based workflows:** PA for genetic/molecular tests, eligibility, missing-info chasing, claim follow-up.
- **Frequency:** Daily, per requisition. **Systems per workflow:** 5-10. **Automation potential:** High.
- **Evidence:** [S1]-adjacent (PA burden); [K].
- **Limitations / assumptions:** Bench work is not computer-based; LIS usually native.
- **Fit scores:** BS 3 · REP 4 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** Lab billing hits the same payer-portal wall as clinics, with a heavy prior-auth load for molecular tests.

#### 18. Telemedicine: Fit 78 (Tier C, rank 32)

- **Browser/web share (RI):** org-wide 60-80%; back-office 75-90%. Confidence: Low-Med.
- **Typical browser work:** Virtual visits, e-prescribing, multistate licensing and payer enrolment, eligibility.
- **Common applications [K]:** Proprietary web platforms, DrFirst/Surescripts, CAQH ProView, state medical board portals, payer portals.
- **Repetitive, rules-based workflows:** State licence applications/renewals, payer enrolment in every state, eligibility checks.
- **Frequency:** Daily (eligibility), monthly (licensing). **Systems per workflow:** 5-10 + dozens of state boards. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Clinical platforms are API-native; licensing is portal-per-state.
- **Fit scores:** BS 5 · REP 4 · MS 4 · MAN 3 · API 4 · DEP 4 · VAL 3.
- **Fit reasoning:** Web-native already. The Conxa-shaped work is multistate licensing, credentialing, and payer enrolment.

#### 19. Health Insurance (payers): Fit 75 (Tier C, rank 39)

- **Browser/web share (RI):** org-wide 45-65%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Claims adjudication exceptions, provider data management, member services, regulatory reporting.
- **Common applications [K]:** Facets, QNXT, HealthEdge (mix of native/web), CMS portals, state Medicaid portals, broker portals, Salesforce.
- **Repetitive, rules-based workflows:** Provider roster updates, claim pend resolution, eligibility files exceptions, regulatory portal submissions.
- **Frequency:** Continuous. **Systems per workflow:** 5-12. **Automation potential:** High.
- **Evidence:** [S3] 67% of payer execs say manual payment platforms reduce efficiency (PYMNTS, verified 3-0).
- **Limitations / assumptions:** Payers own their core systems (API path exists internally); core admin often native/mainframe.
- **Fit scores:** BS 3 · REP 5 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 4.
- **Fit reasoning:** Manual pain is verified [S3], but payers can build internal integrations, so the fit is middling.

#### 20. Medical Devices: Fit 65 (Tier D, rank 66)

- **Browser/web share (RI):** org-wide 25-40%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Hospital vendor-credentialing portals, complaint/MDR filing, GUDID, GPO/distributor portals.
- **Common applications [K]:** Salesforce, SAP, Symplr/Vendormate/Reptrax, FDA eMDR/GUDID, GHX.
- **Repetitive, rules-based workflows:** Keeping sales reps' credentials current across hospital portals; distributor sales/chargeback data; regulatory submissions.
- **Frequency:** Weekly/monthly. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** GxP/QMS validation friction; regulatory systems often validated and locked.
- **Fit scores:** BS 3 · REP 3 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Rep-credentialing and distributor portals are genuine no-API work, but volume per company is moderate.

#### 21. Pharmaceuticals: Fit 64 (Tier D, rank 68)

- **Browser/web share (RI):** org-wide 25-40%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Pharmacovigilance intake, government price reporting, contract/chargeback admin, regulatory.
- **Common applications [K]:** Veeva Vault, Oracle Argus, SAP, IQVIA, Model N, state/Medicaid portals.
- **Repetitive, rules-based workflows:** Adverse-event case intake from many sources, state price-transparency filings, chargeback validation.
- **Frequency:** Daily (PV), quarterly (price reporting). **Systems per workflow:** 6-12. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Validated (GxP/Part 11) systems slow any new automation.
- **Fit scores:** BS 3 · REP 3 · MS 4 · MAN 4 · API 3 · DEP 2 · VAL 4.
- **Fit reasoning:** High value, but validation overhead and existing enterprise vendors lengthen the sale.

#### 22. Biotechnology: Fit 53 (Tier D, rank 88)

- **Browser/web share (RI):** org-wide 25-45%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** ELN/LIMS, grants, CRO/vendor portals, regulatory.
- **Common applications [K]:** Benchling, LIMS, Veeva, CRO portals, Grants.gov.
- **Repetitive, rules-based workflows:** Sample/vendor ordering, CRO data pulls, grant reporting.
- **Frequency:** Weekly. **Systems per workflow:** 4-8. **Automation potential:** Low-Med.
- **Evidence:** [K].
- **Limitations / assumptions:** Low transaction volume; lab work is not computer-based.
- **Fit scores:** BS 3 · REP 2 · MS 3 · MAN 3 · API 3 · DEP 2 · VAL 3.
- **Fit reasoning:** Low repetition and small back offices.

#### 23. Clinical Research (CROs & trial sites): Fit 84 (Tier B, rank 23)

- **Browser/web share (RI):** org-wide 40-60%; back-office 65-85%. Confidence: Low-Med.
- **Typical browser work:** EDC data entry, CTMS, eTMF filing, IRB submissions, site payments, sponsor portals.
- **Common applications [K]:** Medidata Rave, Veeva CDMS/Vault, Oracle InForm/Clinical One, Florence eBinders, IRB portals (e.g., WCG), EHRs.
- **Repetitive, rules-based workflows:** Transcribing source data from the EHR into each sponsor's EDC; query resolution; eTMF document filing; IRB submissions.
- **Frequency:** Daily, per patient visit. **Systems per workflow:** 5-10 (each sponsor mandates its own EDC). **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** 21 CFR Part 11 validation; sponsors may restrict automation in EDC.
- **Fit scores:** BS 5 · REP 4 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** Sites are forced to re-key data into systems they don't control (each sponsor's EDC). That's the swivel-chair pattern, but validation adds sales friction.

#### 96. Research & Scientific Services: Fit 58 (Tier D, rank 81)

- **Browser/web share (RI):** org-wide 25-45%; back-office 50-65%. Confidence: Low.
- **Typical browser work:** LIMS/ELN, sample intake, grant and client portals.
- **Common applications [K]:** LIMS (native/web), ELN, grant portals, client portals.
- **Repetitive, rules-based workflows:** Sample intake from client portals, grant reporting.
- **Frequency:** Weekly. **Systems per workflow:** 4-8. **Automation potential:** Low-Med.
- **Evidence:** [K].
- **Limitations / assumptions:** Lab work non-computer.
- **Fit scores:** BS 3 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Low-moderate fit.

#### 97. Pharmaceuticals Distribution: Fit 77 (Tier C, rank 36)

- **Browser/web share (RI):** org-wide 25-40%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** Customer licence verification, DSCSA verification, chargebacks, GPO contracts.
- **Common applications [K]:** SAP, state pharmacy board lookups, DEA verification, DSCSA/VRS tools, GPO portals, Model N.
- **Repetitive, rules-based workflows:** Verifying customer licences on state board sites; chargeback and contract eligibility checks; returns.
- **Frequency:** Daily. **Systems per workflow:** 6-12 (50 state boards). **Automation potential:** High.
- **Evidence:** [S5] healthcare distribution is EDI-embedded (verified); [K].
- **Limitations / assumptions:** Validated systems; large distributors have in-house IT.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** Licence verification across many state boards is no-API work that repeats for every customer.

#### 98. Medical Administration & Billing (RCM): Fit 97 (Tier A, rank 1)

- **Browser/web share (RI):** org-wide 70-85%; back-office 70-85%. Confidence: Med (workflow), Low-Med (%).
- **Typical browser work:** Eligibility, PA, claim submission/status, denials and appeals, payer enrolment, patient statements.
- **Common applications [K]:** Clearinghouses (Waystar, Availity, Change), payer portals (UHC, Aetna, Cigna, BCBS, Medicaid MCOs), PM/EHR systems, CAQH ProView, Excel.
- **Repetitive, rules-based workflows:** Eligibility/benefits verification; PA submission and status; claim status; denial research and appeal submission; credentialing and payer enrolment.
- **Frequency:** Continuous, per claim; ~40 PAs/physician/week at client practices [S1]. **Systems per workflow:** 8-15 + 10-40+ payer portals [S7][S16]. **Automation potential:** Very High.
- **Evidence:** [S1] AMA 2025: ~40 PAs/physician/week, 13 h/week, only 24% of EHRs support ePA for Rx; [S2] CAQH 2025: $21B savings opportunity; [S3] 67% payer execs + bots break when portals change; [S6]; [S7].
- **Limitations / assumptions:** Phone/fax share of PA not browser [S1]; payer-portal MFA; CMS payer PA APIs due Jan 2027 may shrink parts of the gap [S1][S7].
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 5 · DEP 4 · VAL 5.
- **Fit reasoning:** Best-evidenced fit in the study. The work runs through dozens of payer portals with no API, at very high volume. Existing RPA breaks when a portal changes [S3], which is the failure Conxa's self-healing targets.

### Commerce & Consumer

#### 24. E-Commerce (brands & merchants): Fit 84 (Tier B, rank 24)

- **Browser/web share (RI):** org-wide 55-75%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Storefront admin, marketplace seller centres, 3PL portals, returns, chargebacks, supplier ordering.
- **Common applications [K]:** Shopify, Amazon Seller Central, Walmart Seller Center, eBay, 3PL portals, ShipStation, Gorgias, Stripe/PayPal.
- **Repetitive, rules-based workflows:** Listing updates across marketplaces, reimbursement claims and case logs, chargeback responses, PO entry with suppliers.
- **Frequency:** Daily. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Major marketplaces have APIs (e.g., Amazon SP-API) but many seller actions (cases, claims) are UI-only.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** High browser share and lots of repetition. The Conxa gap is the seller-centre actions the APIs don't expose.

#### 25. Online Marketplaces (operators): Fit 62 (Tier D, rank 74)

- **Browser/web share (RI):** org-wide 60-80%; back-office 70-85%. Confidence: Low.
- **Typical browser work:** Seller onboarding/verification, trust & safety review, support.
- **Common applications [K]:** Internal tools, Zendesk, registries for seller verification, payment provider dashboards.
- **Repetitive, rules-based workflows:** Seller KYC lookups on business registries, dispute handling.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Operators own their platform and build internal tools.
- **Fit scores:** BS 4 · REP 4 · MS 3 · MAN 3 · API 2 · DEP 3 · VAL 3.
- **Fit reasoning:** The operator is API-native. Its sellers (#24) are the better fit.

#### 26. Retail Stores: Fit 67 (Tier D, rank 59)

- **Browser/web share (RI):** org-wide 10-20%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** HQ merchandising, vendor setup, e-commerce listings, store compliance.
- **Common applications [K]:** POS (native), Oracle/SAP retail, supplier portals, Shopify/Salesforce Commerce.
- **Repetitive, rules-based workflows:** Item setup, price changes across channels, vendor compliance chargebacks.
- **Frequency:** Daily (HQ). **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [S5] retail is EDI-embedded (verified 3-0).
- **Limitations / assumptions:** Store staff are deskless; EDI covers core supplier transactions.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 3 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Large deskless share; HQ has a moderate fit. Retailers are more often the portal owner than the portal user.

#### 27. Wholesale Distribution: Fit 84 (Tier B, rank 22)

- **Browser/web share (RI):** org-wide 25-40%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Order entry, customer procurement portals, supplier ordering, rebate claims, pricing updates.
- **Common applications [K]:** Epicor Prophet 21/Eclipse, Infor, SAP Business One, NetSuite, customer portals (Ariba, Coupa), supplier portals.
- **Repetitive, rules-based workflows:** Entering POs received by email/portal, uploading invoices to customers' procurement portals, supplier rebate claim filing.
- **Frequency:** Daily, per order. **Systems per workflow:** 5-10. **Automation potential:** High.
- **Evidence:** [S5] EDI embedded; suppliers juggle EDI, cXML and APIs for different buyers (extracted, not verified).
- **Limitations / assumptions:** ERPs often native/thick; EDI covers large trading partners.
- **Fit scores:** BS 3 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** Sits between EDI-capable giants and portal-only small partners. The non-EDI long tail is Conxa's opening.

#### 28. Consumer Goods (CPG suppliers): Fit 91 (Tier A, rank 3)

- **Browser/web share (RI):** org-wide 20-35%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Retailer portal work: POS data pulls, deductions/chargeback disputes, promotions, item setup.
- **Common applications [K]:** Walmart Retail Link/Luminate, Target Partners Online, Amazon Vendor Central, Kroger/Albertsons portals, SAP, TPM tools.
- **Repetitive, rules-based workflows:** Researching and disputing retailer deductions portal-by-portal; weekly POS/inventory downloads; new-item setup forms.
- **Frequency:** Daily/weekly. **Systems per workflow:** 5-10 retailer portals. **Automation potential:** High.
- **Evidence:** [S5] retail EDI mandates (verified); [K].
- **Limitations / assumptions:** Deduction specialist software exists (e.g., HighRadius, iNymbus) and some overlaps.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 5.
- **Fit reasoning:** Retailers dictate the portals, and suppliers lose real money on deductions they don't dispute. High value and repetitive, with no API on the supplier's side.

### Financial Services & Insurance

#### 29. Banking (retail & commercial ops): Fit 82 (Tier B, rank 25)

- **Browser/web share (RI):** org-wide 35-55%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** KYC/AML checks, loan processing with third-party portals, account maintenance, dispute handling.
- **Common applications [K]:** FIS/Fiserv/Jack Henry cores (often terminal/native), nCino, Salesforce FSC, credit bureaus, appraisal/flood/title portals, sanctions lists.
- **Repetitive, rules-based workflows:** KYC lookups across registries and watchlists; ordering appraisals/flood certs; loan document gathering; card dispute entry.
- **Frequency:** Continuous, high volume. **Systems per workflow:** 6-15. **Automation potential:** High.
- **Evidence:** [S4]; [K]. A BFSI RPA-share figure was REFUTED in verification [S17], so it's not used.
- **Limitations / assumptions:** Core banking often terminal/mainframe (outside scope); strict change control.
- **Fit scores:** BS 3 · REP 5 · MS 5 · MAN 5 · API 3 · DEP 3 · VAL 5.
- **Fit reasoning:** Very high volume and value. Local-only execution suits bank security reviews [S14]; mainframe cores and the long sales cycle hold it back.

#### 30. Corporate Banking: Fit 77 (Tier C, rank 35)

- **Browser/web share (RI):** org-wide 40-60%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Corporate KYC refresh, trade finance documents, credit memos, client onboarding.
- **Common applications [K]:** Company registries (Companies House, SEC EDGAR), sanctions tools, Finastra/trade platforms, Salesforce, Moody's.
- **Repetitive, rules-based workflows:** Periodic KYC refresh pulling registry filings; onboarding document collection; trade doc checks.
- **Frequency:** Daily. **Systems per workflow:** 6-12. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Token-based MFA on banking platforms; heavy compliance review.
- **Fit scores:** BS 3 · REP 5 · MS 4 · MAN 5 · API 3 · DEP 3 · VAL 4.
- **Fit reasoning:** KYC refresh across public registries is a strong use case. Volume is lower than retail banking.

#### 31. Investment Banking: Fit 54 (Tier D, rank 86)

- **Browser/web share (RI):** org-wide 35-55%; back-office 40-55%. Confidence: Low.
- **Typical browser work:** Data rooms, research databases, deal admin.
- **Common applications [K]:** Bloomberg/FactSet/CapIQ (native terminals), Excel/PowerPoint, Datasite/Intralinks, DealCloud.
- **Repetitive, rules-based workflows:** Comparable-company data pulls, data-room indexing.
- **Frequency:** Ad hoc. **Systems per workflow:** 4-8. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Core tools are native terminals and Office.
- **Fit scores:** BS 2 · REP 2 · MS 3 · MAN 3 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Low repetition; the analyst workflow is bespoke.

#### 32. FinTech: Fit 70 (Tier C, rank 50)

- **Browser/web share (RI):** org-wide 65-85%; back-office 75-90%. Confidence: Low.
- **Typical browser work:** Ops on partner-bank portals, KYC exceptions, disputes, state licensing.
- **Common applications [K]:** Internal admin tools, Unit/Synapse-type BaaS dashboards, Alloy/Persona, NMLS, Zendesk.
- **Repetitive, rules-based workflows:** KYC manual review lookups, partner-bank portal reconciliations, state licence renewals (NMLS).
- **Frequency:** Daily. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Engineering-led; will build APIs where possible.
- **Fit scores:** BS 5 · REP 4 · MS 4 · MAN 3 · API 2 · DEP 4 · VAL 3.
- **Fit reasoning:** Browser share is high, but engineering teams prefer APIs. Partner-bank and regulator portals are the openings.

#### 33. Payments & Payment Processing: Fit 80 (Tier B, rank 27)

- **Browser/web share (RI):** org-wide 60-80%; back-office 70-85%. Confidence: Low.
- **Typical browser work:** Chargeback representment, merchant underwriting, reconciliation, network portals.
- **Common applications [K]:** Processor dashboards, card-network dispute portals, Salesforce, website/registry checks.
- **Repetitive, rules-based workflows:** Assembling dispute evidence and submitting per portal; merchant website/registry checks during underwriting.
- **Frequency:** Daily, high volume. **Systems per workflow:** 5-10. **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Large processors have dispute APIs; small ISOs do not.
- **Fit scores:** BS 4 · REP 5 · MS 4 · MAN 4 · API 3 · DEP 4 · VAL 4.
- **Fit reasoning:** Dispute and underwriting ops are repetitive and cross-portal. The fit is strongest at ISOs, PayFacs and merchants rather than the networks.

#### 34. Wealth Management (RIAs, broker-dealers): Fit 87 (Tier B, rank 15)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low-Med.
- **Typical browser work:** Account opening, money movement, beneficiary/address changes, billing, CRM updates across custodians.
- **Common applications [K]:** Schwab Advisor Center, Fidelity Wealthscape, Pershing NetX360, Salesforce FSC/Redtail/Wealthbox, Orion/Black Diamond, eMoney, DocuSign.
- **Repetitive, rules-based workflows:** Re-keying client data from CRM into each custodian's forms; moving money; fee-billing reconciliation; account maintenance.
- **Frequency:** Daily. **Systems per workflow:** 6-10 (multi-custodian). **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Custodian integrations exist for data feeds but many service requests remain portal-only.
- **Fit scores:** BS 5 · REP 4 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Multi-custodian RIAs re-key the same client into systems they don't control. Regulated clients favour local execution.

#### 35. Asset Management: Fit 67 (Tier D, rank 58)

- **Browser/web share (RI):** org-wide 45-65%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** Fund admin portals, investor portals, regulatory filings, trade ops.
- **Common applications [K]:** Charles River/Aladdin (native/web), Bloomberg, fund-admin portals, EDGAR, investor portals.
- **Repetitive, rules-based workflows:** Downloading statements/reports from fund-admin and counterparty portals; regulatory form filing.
- **Frequency:** Daily/monthly. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Core OMS/PMS often native; large firms have data feeds.
- **Fit scores:** BS 3 · REP 3 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 4.
- **Fit reasoning:** Mid-fit: operations retrieval work exists, but it's smaller than in wealth management.

#### 36. Insurance (carriers): Fit 73 (Tier C, rank 41)

- **Browser/web share (RI):** org-wide 45-65%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Underwriting data gathering, policy servicing, regulatory filings, agent licensing.
- **Common applications [K]:** Guidewire/Duck Creek (web), legacy mainframe PAS, LexisNexis/Verisk, SERFF, NIPR, state DOI portals.
- **Repetitive, rules-based workflows:** Pulling third-party data into underwriting; rate/form filings; agent appointment/licensing; bordereaux processing.
- **Frequency:** Daily. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [S11] insurance cloud adoption (blog, unverified); [K].
- **Limitations / assumptions:** Legacy PAS on mainframe; carriers can build integrations.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 4.
- **Fit reasoning:** Solid, but carriers own their core systems. Their distribution partners (#37) and claims operations (#38) are the better targets.

#### 37. Insurance Brokerage & Agencies: Fit 95 (Tier A, rank 2)

- **Browser/web share (RI):** org-wide 70-85%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Quoting across carrier portals, policy servicing, certificates, renewals, commission reconciliation.
- **Common applications [K]:** Applied Epic, Vertafore AMS360/Sagitta, HawkSoft, EZLynx/PL Rating, carrier portals (Travelers, Hartford, Chubb, Progressive...), IVANS.
- **Repetitive, rules-based workflows:** Re-entering the same risk into 3-10 carrier portals to quote; downloading policies/endorsements into the AMS; issuing COIs; carrier-by-carrier commission statement reconciliation.
- **Frequency:** Daily, per submission/renewal. **Systems per workflow:** 5-15 (AMS + many carrier portals). **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** IVANS download and comparative raters cover parts of personal lines; commercial lines largely portal-only.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 5 · DEP 4 · VAL 4.
- **Fit reasoning:** Textbook Conxa shape: an agency re-keys one risk into many carrier portals it doesn't own. The work is daily and has no API path.

#### 38. Insurance Claims Processing (carriers, TPAs, adjusting firms): Fit 88 (Tier A, rank 13)

- **Browser/web share (RI):** org-wide 50-70%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** FNOL, records retrieval, police reports, estimates, subrogation, regulatory complaints.
- **Common applications [K]:** Guidewire ClaimCenter, CCC ONE/Mitchell, ISO ClaimSearch, police-report and medical-records portals, Arbitration Forums.
- **Repetitive, rules-based workflows:** Ordering police/medical records on portals, subrogation filings, claim status updates to other carriers, document indexing.
- **Frequency:** Continuous, per claim. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [S3]/[S6] claims processing is manual and error-prone (healthcare context, verified); [K].
- **Limitations / assumptions:** Estimating platforms are semi-native; carriers have IT gatekeeping.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 5.
- **Fit reasoning:** Claims work crosses several external portals for every claim. TPAs and independent adjusters are easier to deploy into than carriers.

### Telecom & Media

#### 39. Telecommunications: Fit 78 (Tier C, rank 30)

- **Browser/web share (RI):** org-wide 35-55%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Order provisioning, wholesale ordering on other carriers' portals, number porting, field permits.
- **Common applications [K]:** Amdocs/Netcracker BSS/OSS (often native), carrier wholesale portals, porting portals, Salesforce.
- **Repetitive, rules-based workflows:** Swivel-chair order entry across BSS/OSS, ordering circuits in other carriers' portals, port requests.
- **Frequency:** Daily, per order. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Large legacy estates; some OSS is native.
- **Fit scores:** BS 3 · REP 5 · MS 5 · MAN 4 · API 3 · DEP 3 · VAL 4.
- **Fit reasoning:** Swivel-chair provisioning is a classic automation target, but legacy native OSS limits browser-only coverage.

#### 40. Internet Service Providers: Fit 78 (Tier C, rank 33)

- **Browser/web share (RI):** org-wide 35-55%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Provisioning, porting, pole-attachment and permit applications, billing.
- **Common applications [K]:** Billing/OSS (Sonar, Splynx, Azotel), utility pole-attachment portals, municipal permit portals, wholesale portals.
- **Repetitive, rules-based workflows:** Permit/pole applications per municipality/utility, order provisioning, porting.
- **Frequency:** Daily/weekly. **Systems per workflow:** 5-10. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Smaller regional ISPs have little IT staff.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 4 · VAL 3.
- **Fit reasoning:** Regional ISPs file permits and orders across utility and municipal portals they don't control.

#### 90. Media & Publishing: Fit 56 (Tier D, rank 84)

- **Browser/web share (RI):** org-wide 55-70%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** CMS publishing, ad ops, syndication, rights and permissions.
- **Common applications [K]:** WordPress/Arc XP, Google Ad Manager, syndication portals, Adobe CC (native).
- **Repetitive, rules-based workflows:** Cross-posting content, ad-ops trafficking, permissions logging.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Mac-heavy editorial fleets.
- **Fit scores:** BS 4 · REP 3 · MS 4 · MAN 3 · API 2 · DEP 2 · VAL 2.
- **Fit reasoning:** Mac fleets and API-rich tools limit the fit.

#### 91. Broadcasting: Fit 64 (Tier D, rank 70)

- **Browser/web share (RI):** org-wide 30-50%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Ad sales order entry, traffic, rights, compliance logs.
- **Common applications [K]:** WideOrbit/traffic systems (native), agency e-order portals, playout (native).
- **Repetitive, rules-based workflows:** Order entry from agency portals, make-goods, affidavits.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Core systems native.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 2 · VAL 2.
- **Fit reasoning:** Some order-entry work, but the core systems are native.

#### 92. Film & Entertainment: Fit 46 (Tier D, rank 97)

- **Browser/web share (RI):** org-wide 20-40%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Distribution delivery portals, residuals, production accounting.
- **Common applications [K]:** Mac creative tools (native), distribution/delivery portals, production accounting.
- **Repetitive, rules-based workflows:** Deliverables uploads, residual reporting.
- **Frequency:** Project-based. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Project-based; Mac fleets.
- **Fit scores:** BS 2 · REP 2 · MS 3 · MAN 3 · API 3 · DEP 1 · VAL 2.
- **Fit reasoning:** Project-based work doesn't repeat enough to pay back a compile.

#### 93. Gaming: Fit 48 (Tier D, rank 96)

- **Browser/web share (RI):** org-wide 35-55%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** Store submissions, community/support, live ops dashboards.
- **Common applications [K]:** Game engines (native), Steam/console partner portals, Zendesk, analytics.
- **Repetitive, rules-based workflows:** Store page updates, build submissions, support triage.
- **Frequency:** Weekly. **Systems per workflow:** 4-8. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Engineering-led.
- **Fit scores:** BS 3 · REP 2 · MS 3 · MAN 2 · API 2 · DEP 3 · VAL 2.
- **Fit reasoning:** Low fit.

#### 94. Sports & Sports Management: Fit 63 (Tier D, rank 73)

- **Browser/web share (RI):** org-wide 30-50%; back-office 60-75%. Confidence: Low.
- **Typical browser work:** Registrations, ticketing, league portals, eligibility, sponsorship reporting.
- **Common applications [K]:** Ticketmaster, league registration systems, TeamSnap, federation portals.
- **Repetitive, rules-based workflows:** Player registrations/transfers on federation portals, ticket ops, sponsor reports.
- **Frequency:** Seasonal peaks. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Seasonal; small back offices.
- **Fit scores:** BS 4 · REP 3 · MS 4 · MAN 3 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Some federation-portal work, but it's seasonal and low value.

### Education

#### 41. Schools (K-12): Fit 54 (Tier D, rank 87)

- **Browser/web share (RI):** org-wide 25-40%; back-office 60-75%. Confidence: Low.
- **Typical browser work:** SIS, LMS, state reporting, special-education compliance.
- **Common applications [K]:** PowerSchool, Infinite Campus, Google Classroom, Canvas, state reporting portals.
- **Repetitive, rules-based workflows:** Attendance/state reporting, enrolment records, IEP compliance forms.
- **Frequency:** Daily/termly. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** ChromeOS fleets (not Windows); low budgets.
- **Fit scores:** BS 4 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 1 · VAL 2.
- **Fit reasoning:** Chromebook fleets and tight budgets rule it out today [S14: Windows-only].

#### 42. Universities & Colleges: Fit 75 (Tier C, rank 40)

- **Browser/web share (RI):** org-wide 40-60%; back-office 60-75%. Confidence: Low.
- **Typical browser work:** Admissions, financial aid, registrar, research administration, transcript processing.
- **Common applications [K]:** Banner/PeopleSoft/Workday Student, Slate, Common App, FAFSA/COD, NIH eRA Commons, Grants.gov/Research.gov.
- **Repetitive, rules-based workflows:** Transcript/credential evaluation, financial-aid verification, grant submissions and reporting across federal portals.
- **Frequency:** Daily (peaks by term). **Systems per workflow:** 6-12. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Slow procurement; decentralised IT.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** Research administration and financial aid are genuinely portal-bound and repetitive. Procurement is slow.

#### 43. EdTech: Fit 59 (Tier D, rank 77)

- **Browser/web share (RI):** org-wide 65-85%; back-office 75-90%. Confidence: Low.
- **Typical browser work:** Customer onboarding/rostering, support, content ops.
- **Common applications [K]:** Clever/ClassLink (API rostering), Zendesk, Salesforce, internal admin.
- **Repetitive, rules-based workflows:** District onboarding, content uploads.
- **Frequency:** Weekly. **Systems per workflow:** 4-8. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** API-native; rostering via Clever APIs.
- **Fit scores:** BS 5 · REP 3 · MS 3 · MAN 2 · API 2 · DEP 4 · VAL 2.
- **Fit reasoning:** Low internal fit; possible Rung-3 vendor channel into schools and universities.

#### 44. Professional Training: Fit 76 (Tier C, rank 38)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** LMS admin, CE-credit reporting, certification-body portals, enrolments.
- **Common applications [K]:** Cornerstone/Docebo/Moodle, CE Broker, licensing-board portals, accreditor portals.
- **Repetitive, rules-based workflows:** Reporting completions to each licensing board, enrolment admin, certificate issuance.
- **Frequency:** Weekly/monthly. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Small organisations; low value per task.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 4 · VAL 2.
- **Fit reasoning:** Board-by-board credit reporting fits Conxa, but the economic value is small.

### Government & Public Sector

#### 45. Government Administration: Fit 67 (Tier D, rank 60)

- **Browser/web share (RI):** org-wide 35-55%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Case management, inter-agency portals, procurement, grants.
- **Common applications [K]:** Legacy case systems (mix native/web), Salesforce/ServiceNow public sector, SAM.gov, grants portals.
- **Repetitive, rules-based workflows:** Cross-agency lookups, grants reporting, procurement entry.
- **Frequency:** Daily. **Systems per workflow:** 5-12. **Automation potential:** Medium.
- **Evidence:** [S11] government recalibrating to on-prem/hybrid (blog, unverified); [K].
- **Limitations / assumptions:** Security accreditation, procurement cycles, on-prem mandates.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 1 · VAL 3.
- **Fit reasoning:** Workflows fit, but the buying process doesn't: accreditation and procurement take 12-24 months. Better reached via services firms (Rung 3).

#### 46. Public Services (benefits, licensing agencies): Fit 71 (Tier C, rank 48)

- **Browser/web share (RI):** org-wide 30-50%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Benefits eligibility verification across agency systems, licence processing.
- **Common applications [K]:** Legacy eligibility systems (often mainframe), state/federal verification portals.
- **Repetitive, rules-based workflows:** Cross-checking applicant data across agency databases and portals.
- **Frequency:** Continuous, high volume. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Mainframe back ends; accreditation.
- **Fit scores:** BS 3 · REP 5 · MS 4 · MAN 4 · API 4 · DEP 1 · VAL 3.
- **Fit reasoning:** Very repetitive work, but mainframes and procurement block deployment.

#### 47. Municipal Services: Fit 68 (Tier D, rank 57)

- **Browser/web share (RI):** org-wide 25-45%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Permitting, utility billing, code enforcement, state reporting.
- **Common applications [K]:** Accela, Tyler EnerGov/Munis, state reporting portals.
- **Repetitive, rules-based workflows:** Permit intake from email to system, state report submissions.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Small IT, low budgets.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 2 · VAL 2.
- **Fit reasoning:** Low budgets. Municipalities are more often the portal owner than the portal user.

### Logistics & Transportation

#### 48. Logistics (3PL, freight brokerage): Fit 91 (Tier A, rank 6)

- **Browser/web share (RI):** org-wide 30-50%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Load posting, carrier onboarding/monitoring, tracking, POD and invoice upload to shipper portals, dock appointments.
- **Common applications [K]:** McLeod (native), MercuryGate/Turvo/Aljex (web), DAT, Truckstop, Highway/RMIS/MyCarrierPackets, shipper portals, retailer appointment portals.
- **Repetitive, rules-based workflows:** Posting loads to boards; check-calls and tracking lookups on carrier sites; uploading PODs/invoices to shipper portals; booking DC appointments.
- **Frequency:** Continuous, per load. **Systems per workflow:** 6-15. **Automation potential:** High.
- **Evidence:** [S11] logistics cloud adoption ~40% (blog, unverified); [K].
- **Limitations / assumptions:** Drivers/warehouse are deskless; some TMS native; big shippers use EDI.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** The brokerage desk lives in browser tabs, across shipper, carrier and board portals the broker doesn't own. Very high load volume.

#### 49. Freight & Shipping (forwarders, customs brokers, NVOCCs): Fit 88 (Tier A, rank 14)

- **Browser/web share (RI):** org-wide 35-55%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Carrier bookings, tracking, document retrieval, customs filings, rate management, demurrage disputes.
- **Common applications [K]:** CargoWise (Windows client), Magaya, INTTRA/e2open, ocean/air carrier portals, customs portals (ACE, CDS, ICEGATE), port community systems.
- **Repetitive, rules-based workflows:** Pulling B/L, arrival notices and tracking from each carrier's site; booking on portals; customs entries; D&D disputes.
- **Frequency:** Continuous, per shipment. **Systems per workflow:** 6-15. **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** CargoWise is a native Windows client (outside browser capture); large carriers now offer APIs.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** Forwarders touch dozens of carrier and customs portals for every shipment. The CargoWise native client limits end-to-end coverage.

#### 50. Warehousing: Fit 69 (Tier D, rank 53)

- **Browser/web share (RI):** org-wide 10-25%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** Customer portals, dock appointment scheduling, 3PL billing, inventory reporting.
- **Common applications [K]:** Manhattan/Blue Yonder/Körber WMS (RF + native/web), customer portals, appointment portals.
- **Repetitive, rules-based workflows:** Inventory reports to customer portals, appointment booking, billing prep.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [S10] deskless share (not verified here); [K].
- **Limitations / assumptions:** Floor work deskless; WMS RF-driven.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Small office layer; moderate fit.

#### 51. Courier & Delivery: Fit 62 (Tier D, rank 75)

- **Browser/web share (RI):** org-wide 5-15%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** Claims, account setup, address corrections, customer portals.
- **Common applications [K]:** Proprietary dispatch, carrier claims portals, customer portals.
- **Repetitive, rules-based workflows:** Damage/loss claims, customer account onboarding.
- **Frequency:** Daily. **Systems per workflow:** 3-6. **Automation potential:** Low-Med.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Overwhelmingly deskless workforce.
- **Fit scores:** BS 3 · REP 4 · MS 3 · MAN 3 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Mostly deskless, with a thin back office.

#### 52. Airlines: Fit 64 (Tier D, rank 69)

- **Browser/web share (RI):** org-wide 15-30%; back-office 40-60%. Confidence: Low.
- **Typical browser work:** Revenue accounting, refunds, agency debit memos, crew/MRO admin.
- **Common applications [K]:** Amadeus Altéa/Sabre (terminal/native), BSP Link, MRO systems (native), Salesforce.
- **Repetitive, rules-based workflows:** Refund processing, ADM handling in BSP Link, interline billing.
- **Frequency:** Continuous. **Systems per workflow:** 6-12. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Terminal/cryptic PSS and native MRO are out of scope.
- **Fit scores:** BS 2 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 2 · VAL 3.
- **Fit reasoning:** Core systems are terminal-based. Only the web-portal slice (BSP Link etc.) is addressable.

#### 53. Railways: Fit 53 (Tier D, rank 89)

- **Browser/web share (RI):** org-wide 10-25%; back-office 40-60%. Confidence: Low.
- **Typical browser work:** Scheduling, freight billing, regulatory reporting.
- **Common applications [K]:** Legacy operations systems, customer freight portals.
- **Repetitive, rules-based workflows:** Freight billing and car tracking lookups.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Legacy native systems; safety-critical ops.
- **Fit scores:** BS 2 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 2 · VAL 2.
- **Fit reasoning:** Low fit.

#### 54. Public Transportation: Fit 50 (Tier D, rank 94)

- **Browser/web share (RI):** org-wide 10-20%; back-office 45-60%. Confidence: Low.
- **Typical browser work:** Scheduling, fare ops, grant reporting.
- **Common applications [K]:** Scheduling systems (native), NTD reporting portal, fare systems.
- **Repetitive, rules-based workflows:** Federal/state ridership and grant reporting.
- **Frequency:** Monthly. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Public procurement; deskless workforce.
- **Fit scores:** BS 2 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 1 · VAL 2.
- **Fit reasoning:** Low fit.

### Hospitality, Travel & Food

#### 55. Hotels: Fit 71 (Tier C, rank 49)

- **Browser/web share (RI):** org-wide 10-25%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** OTA extranets, virtual-card charging, group bookings, reviews, revenue management.
- **Common applications [K]:** Oracle Opera Cloud, Mews, SiteMinder/channel managers, Booking.com/Expedia extranets, TripAdvisor.
- **Repetitive, rules-based workflows:** Charging OTA virtual cards one by one; reconciling OTA commissions; group rooming lists; responding to reviews.
- **Frequency:** Daily. **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Rate/availability already automated via channel-manager APIs.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Finance-side reconciliation (virtual cards, commissions) is the gap. Channel managers already cover distribution.

#### 56. Resorts: Fit 67 (Tier D, rank 62)

- **Browser/web share (RI):** org-wide 8-20%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** As hotels plus activities/spa booking.
- **Common applications [K]:** Opera/Agilysys, channel managers, OTA extranets, activity booking platforms.
- **Repetitive, rules-based workflows:** Virtual-card processing, group/event admin, OTA reconciliations.
- **Frequency:** Daily. **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Mostly deskless workforce.
- **Fit scores:** BS 4 · REP 3 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Similar to hotels, with lower volume.

#### 57. Travel Agencies & TMCs: Fit 80 (Tier B, rank 29)

- **Browser/web share (RI):** org-wide 55-75%; back-office 60-80%. Confidence: Low.
- **Typical browser work:** Bookings across supplier sites, GDS, settlement (BSP/ARC), refunds, commission tracking, visas.
- **Common applications [K]:** Sabre/Amadeus/Travelport (native + web), BSP Link/ARC IAR, supplier websites, Lemax/ClientBase, visa portals.
- **Repetitive, rules-based workflows:** Refunds/exchanges on airline sites; settlement reconciliation; chasing hotel commissions; visa applications.
- **Frequency:** Daily. **Systems per workflow:** 6-12. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** GDS terminals out of scope; small agencies with thin margins.
- **Fit scores:** BS 4 · REP 4 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** Supplier portals and settlement portals are no-API work. Margins are thin, so price sensitivity is high.

#### 58. Online Travel Agencies: Fit 70 (Tier C, rank 51)

- **Browser/web share (RI):** org-wide 65-85%; back-office 75-90%. Confidence: Low.
- **Typical browser work:** Supplier onboarding, customer-service fixes on supplier sites, refunds.
- **Common applications [K]:** Internal platforms, supplier extranets, airline websites (for non-GDS/NDC content), Zendesk.
- **Repetitive, rules-based workflows:** Manual refunds and changes on supplier sites where APIs don't support the action.
- **Frequency:** Daily. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** API-native core business.
- **Fit scores:** BS 5 · REP 4 · MS 4 · MAN 3 · API 2 · DEP 4 · VAL 3.
- **Fit reasoning:** API-native core. The service-ops exceptions are real but narrow.

#### 59. Restaurants & Food Services: Fit 69 (Tier D, rank 55)

- **Browser/web share (RI):** org-wide 3-10%; back-office 50-70%. Confidence: Low.
- **Typical browser work:** Delivery-platform merchant portals, supplier ordering, invoice entry, scheduling.
- **Common applications [K]:** Toast/Square (web back office), DoorDash/Uber Eats/Grubhub merchant portals, Sysco/US Foods portals, MarginEdge, 7shifts.
- **Repetitive, rules-based workflows:** Disputing delivery-app error charges; menu/price sync across delivery portals; payout reconciliation; supplier ordering.
- **Frequency:** Daily (multi-unit). **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Deskless workforce; small single-unit budgets.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Viable only for multi-unit operators. Delivery-portal disputes are a known pain.

### Real Estate & Construction

#### 60. Real Estate Agencies (brokerages): Fit 78 (Tier C, rank 34)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** MLS listing entry, transaction management, CRM, compliance review, syndication.
- **Common applications [K]:** MLS systems (Flexmls, Matrix, Paragon), dotloop, SkySlope, Follow Up Boss, DocuSign, showing services.
- **Repetitive, rules-based workflows:** Listing input and updates in MLS; transaction file compliance checks; commission processing.
- **Frequency:** Daily. **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** RESO Web API covers MLS data reads, not listing entry; agents are independent contractors.
- **Fit scores:** BS 5 · REP 4 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 2.
- **Fit reasoning:** High browser share, but fragmented buyers with low value per task. Brokerage back offices are the target.

#### 61. Property Management (residential): Fit 91 (Tier A, rank 7)

- **Browser/web share (RI):** org-wide 45-65%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Utility bill retrieval/transfers, rent-roll ops, tenant screening, municipal registration, vendor invoices, insurance compliance.
- **Common applications [K]:** AppFolio, Yardi Breeze/Voyager, Buildium, RealPage, Entrata, utility company portals, municipal portals, tenant-screening portals.
- **Repetitive, rules-based workflows:** Downloading bills from dozens of utility portals and entering them for rebilling; move-in/out utility transfers; rental registrations/inspections; vendor invoice entry.
- **Frequency:** Daily/monthly, per unit. **Systems per workflow:** 6-15 (utilities x municipalities). **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Utility bill-pay aggregators exist but coverage of small utilities is patchy.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Hundreds of units multiply into many utility and municipal portals with no API. Monthly and highly repetitive.

#### 62. Commercial Real Estate: Fit 85 (Tier B, rank 21)

- **Browser/web share (RI):** org-wide 50-70%; back-office 60-80%. Confidence: Low.
- **Typical browser work:** Lease admin, property tax payments, utility portals, CAM reconciliation, COI tracking.
- **Common applications [K]:** Yardi, MRI, VTS, CoStar, county tax portals, utility portals, COI trackers.
- **Repetitive, rules-based workflows:** Property tax bill retrieval/payment across county portals; utility bills; tenant COI collection.
- **Frequency:** Monthly/annual. **Systems per workflow:** 6-12. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Lower transaction volume than residential.
- **Fit scores:** BS 4 · REP 4 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Same portal-sprawl pattern as residential property management, with fewer transactions and higher value.

#### 63. Construction: Fit 72 (Tier C, rank 47)

- **Browser/web share (RI):** org-wide 8-20%; back-office 55-70%. Confidence: Low.
- **Typical browser work:** Subcontractor compliance, certified payroll, bid portals, permits, lien waivers.
- **Common applications [K]:** Procore, Autodesk Construction Cloud, Sage 300 CRE/Viewpoint Vista (native), LCPtracker, public bid portals, permit portals.
- **Repetitive, rules-based workflows:** Collecting COIs and prequal docs; submitting certified payroll to agency portals; downloading bid documents; permit applications.
- **Frequency:** Weekly (payroll), per project. **Systems per workflow:** 6-12. **Automation potential:** Medium.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Field workforce deskless; accounting systems native.
- **Fit scores:** BS 3 · REP 3 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** The office layer does real portal work (certified payroll, permits), but it's a small share of the workforce.

#### 64. Architecture & Engineering: Fit 52 (Tier D, rank 93)

- **Browser/web share (RI):** org-wide 25-40%; back-office 45-60%. Confidence: Low.
- **Typical browser work:** Permit e-submissions, bid portals, project accounting.
- **Common applications [K]:** Revit/AutoCAD (native), Deltek Vantagepoint, ProjectDox, bid portals.
- **Repetitive, rules-based workflows:** Permit submissions and resubmittals.
- **Frequency:** Per project. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [S11] (blog); [K].
- **Limitations / assumptions:** CAD/BIM native.
- **Fit scores:** BS 2 · REP 2 · MS 3 · MAN 3 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Core work is native CAD, so the fit is low.

#### 65. Infrastructure Projects: Fit 60 (Tier D, rank 76)

- **Browser/web share (RI):** org-wide 10-25%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Document control, government reporting, procurement.
- **Common applications [K]:** Aconex, e-Builder, SAP, agency reporting portals.
- **Repetitive, rules-based workflows:** Progress/compliance reporting to agency portals.
- **Frequency:** Monthly. **Systems per workflow:** 4-8. **Automation potential:** Low-Med.
- **Evidence:** [K].
- **Limitations / assumptions:** Public procurement.
- **Fit scores:** BS 3 · REP 3 · MS 4 · MAN 3 · API 3 · DEP 2 · VAL 3.
- **Fit reasoning:** Low-moderate fit.

### Energy & Utilities

#### 66. Oil & Gas: Fit 73 (Tier C, rank 43)

- **Browser/web share (RI):** org-wide 10-25%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Regulatory production reporting, JIB/revenue statements from operator portals, land/lease records.
- **Common applications [K]:** SAP/Quorum/P2 (native), state regulatory portals (e.g., Texas RRC), EnergyLink/OGSYS operator portals, county records.
- **Repetitive, rules-based workflows:** Downloading revenue/JIB statements from many operator portals; state production filings; lease record searches.
- **Frequency:** Monthly. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Field ops deskless; ERP native.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** Non-operators pull statements from many operator portals. It's a real but narrow niche.

#### 67. Electricity & Power: Fit 66 (Tier D, rank 63)

- **Browser/web share (RI):** org-wide 15-30%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Market operator portals, customer switching/transfer, regulatory reporting.
- **Common applications [K]:** SCADA/EMS (native), SAP IS-U (native), ISO/RTO market portals, retail energy market portals.
- **Repetitive, rules-based workflows:** Customer transfer exceptions in market portals, regulatory submissions.
- **Frequency:** Daily. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [S14] energy clients in pilot channel; [K].
- **Limitations / assumptions:** Critical-infrastructure security; native cores.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 2 · VAL 3.
- **Fit reasoning:** Retail energy back offices have portal work, but security and native cores slow deployment.

#### 68. Renewable Energy (incl. solar installers): Fit 87 (Tier B, rank 16)

- **Browser/web share (RI):** org-wide 20-40%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Utility interconnection applications, permits, incentive/rebate portals, REC registries, financing partner portals.
- **Common applications [K]:** Utility interconnection portals, permit portals, M-RETS/PJM-GATS/WREGIS, lender portals, Salesforce/Enerflo.
- **Repetitive, rules-based workflows:** Filing interconnection and permit applications per utility/jurisdiction; incentive claims; REC issuance/transfer.
- **Frequency:** Daily (residential solar), per project. **Systems per workflow:** 6-15. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Varies heavily by market; small installers.
- **Fit scores:** BS 4 · REP 4 · MS 5 · MAN 5 · API 5 · DEP 4 · VAL 3.
- **Fit reasoning:** Each utility and jurisdiction runs its own portal with no API, and installers file every project through them.

#### 69. Water & Utilities: Fit 53 (Tier D, rank 90)

- **Browser/web share (RI):** org-wide 10-25%; back-office 45-60%. Confidence: Low.
- **Typical browser work:** Billing, regulatory reporting, permits.
- **Common applications [K]:** CIS (native), state regulator portals.
- **Repetitive, rules-based workflows:** Regulatory sampling/report submissions.
- **Frequency:** Monthly. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** Public entities; native systems.
- **Fit scores:** BS 2 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 2 · VAL 2.
- **Fit reasoning:** Low fit.

#### 70. Waste Management: Fit 58 (Tier D, rank 80)

- **Browser/web share (RI):** org-wide 5-15%; back-office 50-65%. Confidence: Low.
- **Typical browser work:** Municipal billing, customer portals, compliance manifests.
- **Common applications [K]:** Route/billing systems (Soft-Pak, AMCS), e-Manifest, municipal portals.
- **Repetitive, rules-based workflows:** Manifest submissions, municipal billing reconciliations.
- **Frequency:** Daily. **Systems per workflow:** 3-6. **Automation potential:** Low-Med.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Deskless workforce.
- **Fit scores:** BS 3 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Low fit.

### Manufacturing & Industrial

#### 71. General Manufacturing: Fit 67 (Tier D, rank 61)

- **Browser/web share (RI):** org-wide 8-20%; back-office 40-60%. Confidence: Low.
- **Typical browser work:** Customer portals (PO/ASN/invoice), supplier portals, quality claims, compliance.
- **Common applications [K]:** SAP GUI/Epicor/Infor (often native), NetSuite, MES (native), customer and supplier portals.
- **Repetitive, rules-based workflows:** Downloading POs and uploading ASNs/invoices to customer portals; supplier quality claims.
- **Frequency:** Daily. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [S11] manufacturing prefers on-prem/edge ERP (blog, unverified); [S10].
- **Limitations / assumptions:** SAP GUI and MES are native; shop floor deskless.
- **Fit scores:** BS 2 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** The customer-portal slice is real, but most back-office time runs in native ERPs.

#### 72. Electronics Manufacturing: Fit 69 (Tier D, rank 54)

- **Browser/web share (RI):** org-wide 10-20%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Component sourcing/quoting across distributors, customer portals, compliance.
- **Common applications [K]:** Digi-Key/Mouser/Arrow (APIs exist), Octopart, ERP, customer portals.
- **Repetitive, rules-based workflows:** BOM availability/price checks, customer portal forecast downloads.
- **Frequency:** Daily. **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Distributor APIs exist.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Moderate fit. Distributor APIs cover much of the sourcing work.

#### 73. Automotive Manufacturing (incl. tier suppliers): Fit 76 (Tier C, rank 37)

- **Browser/web share (RI):** org-wide 8-18%; back-office 40-60%. Confidence: Low.
- **Typical browser work:** OEM supplier portals: releases, ASNs, quality claims, PPAP, packaging.
- **Common applications [K]:** SupplyOn, OEM supplier portals (Ford, GM, Stellantis, VW), SAP, EDI 830/862.
- **Repetitive, rules-based workflows:** Downloading releases and quality claims from each OEM portal; PPAP submissions.
- **Frequency:** Daily. **Systems per workflow:** 5-10. **Automation potential:** Medium.
- **Evidence:** [S5] automotive EDI-embedded (verified 3-0).
- **Limitations / assumptions:** EDI covers core schedules.
- **Fit scores:** BS 3 · REP 4 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** Tier suppliers must work in each OEM's portal. EDI covers the core schedules, and the portal remainder is Conxa's opening.

#### 74. Aerospace Manufacturing: Fit 55 (Tier D, rank 85)

- **Browser/web share (RI):** org-wide 10-20%; back-office 40-55%. Confidence: Low.
- **Typical browser work:** Supplier/customer portals, quality, compliance.
- **Common applications [K]:** SAP/native ERP, customer supplier portals (Boeing, Airbus), quality systems.
- **Repetitive, rules-based workflows:** Supplier portal quality/delivery updates.
- **Frequency:** Weekly. **Systems per workflow:** 4-8. **Automation potential:** Low.
- **Evidence:** [S11] ITAR/air-gap constraints (blog).
- **Limitations / assumptions:** ITAR, air-gapped networks.
- **Fit scores:** BS 2 · REP 3 · MS 4 · MAN 3 · API 3 · DEP 1 · VAL 3.
- **Fit reasoning:** Security constraints dominate.

#### 75. Industrial Equipment Manufacturing: Fit 65 (Tier D, rank 67)

- **Browser/web share (RI):** org-wide 10-20%; back-office 45-60%. Confidence: Low.
- **Typical browser work:** Dealer portals, warranty claims, parts, service.
- **Common applications [K]:** SAP/Infor, dealer/warranty portals, PLM (native).
- **Repetitive, rules-based workflows:** Warranty claim processing, parts orders from dealer portals.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Often the portal owner, not user.
- **Fit scores:** BS 3 · REP 3 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Moderate fit. Their dealers are often the portal users.

#### 76. Chemicals Manufacturing: Fit 63 (Tier D, rank 71)

- **Browser/web share (RI):** org-wide 10-20%; back-office 40-60%. Confidence: Low.
- **Typical browser work:** Regulatory portals, SDS, customer portals.
- **Common applications [K]:** SAP GUI, SDS authoring, EPA CDX, ECHA REACH-IT, customer portals.
- **Repetitive, rules-based workflows:** Regulatory submissions, customer compliance questionnaires.
- **Frequency:** Monthly. **Systems per workflow:** 4-8. **Automation potential:** Low-Med.
- **Evidence:** [K].
- **Limitations / assumptions:** Native ERP.
- **Fit scores:** BS 2 · REP 3 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 3.
- **Fit reasoning:** Low-moderate fit.

#### 77. Textile Manufacturing: Fit 53 (Tier D, rank 91)

- **Browser/web share (RI):** org-wide 5-15%; back-office 35-55%. Confidence: Low.
- **Typical browser work:** Buyer compliance/sustainability portals, export documentation.
- **Common applications [K]:** Local ERP, buyer portals, Higg Index, export/customs portals.
- **Repetitive, rules-based workflows:** Compliance questionnaires for buyers; export filings.
- **Frequency:** Per order. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Emerging-market SMEs; low digital budgets.
- **Fit scores:** BS 2 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 2 · VAL 2.
- **Fit reasoning:** Low fit.

#### 78. Food & Beverage Manufacturing: Fit 73 (Tier C, rank 44)

- **Browser/web share (RI):** org-wide 8-18%; back-office 45-65%. Confidence: Low.
- **Typical browser work:** Retailer portals, deductions, food-safety certification portals.
- **Common applications [K]:** SAP/NetSuite, retailer portals, food safety cert portals.
- **Repetitive, rules-based workflows:** Deductions disputes; retailer item setup; audit document uploads.
- **Frequency:** Weekly. **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [S5] retail EDI (verified).
- **Limitations / assumptions:** Plant workforce deskless.
- **Fit scores:** BS 3 · REP 4 · MS 4 · MAN 4 · API 4 · DEP 3 · VAL 3.
- **Fit reasoning:** Shares the CPG retailer-portal pain (#28) at smaller scale.

#### 83. Food Processing: Fit 56 (Tier D, rank 83)

- **Browser/web share (RI):** org-wide 5-15%; back-office 40-60%. Confidence: Low.
- **Typical browser work:** Retail/distributor portals, regulatory, traceability.
- **Common applications [K]:** ERP, retailer/distributor portals, USDA/FDA portals.
- **Repetitive, rules-based workflows:** Traceability record submissions; retailer portal work.
- **Frequency:** Weekly. **Systems per workflow:** 4-6. **Automation potential:** Low-Med.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Deskless workforce.
- **Fit scores:** BS 2 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 3 · VAL 2.
- **Fit reasoning:** Low-moderate fit.

### Automotive & Primary Sectors

#### 79. Automotive Dealerships: Fit 90 (Tier A, rank 10)

- **Browser/web share (RI):** org-wide 25-40%; back-office 60-80%. Confidence: Low.
- **Typical browser work:** OEM warranty/incentive claims, lender portals, DMV/title registration, inventory syndication, CRM.
- **Common applications [K]:** CDK/Reynolds (native + web), Dealertrack/RouteOne, OEM dealer portals, state DMV/title portals, VinSolutions/DealerSocket, Cars.com/AutoTrader.
- **Repetitive, rules-based workflows:** Warranty and incentive claim submission per OEM portal; funding packages to lenders; title/registration filings; inventory updates.
- **Frequency:** Daily, per deal/repair order. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [S5] automotive EDI (verified); [K].
- **Limitations / assumptions:** DMS vendors restrict third-party data access; some DMS screens native.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 5 · DEP 3 · VAL 4.
- **Fit reasoning:** Dealers sit between OEM, lender and DMV portals none of which they control. The volume is per vehicle and the claim dollars are real.

#### 80. Auto Repair & Services: Fit 70 (Tier C, rank 52)

- **Browser/web share (RI):** org-wide 10-25%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Parts ordering across supplier sites, insurer DRP portals, warranty admin portals.
- **Common applications [K]:** Tekmetric/Shopmonkey (web), Mitchell 1 (native), PartsTech, supplier sites, insurer DRP portals.
- **Repetitive, rules-based workflows:** Parts price/availability checks, insurer estimate uploads.
- **Frequency:** Daily. **Systems per workflow:** 4-8. **Automation potential:** Medium.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Technicians deskless; parts aggregators exist.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 3 · API 3 · DEP 4 · VAL 2.
- **Fit reasoning:** Moderate fit; small shops, low value.

#### 81. Agriculture: Fit 43 (Tier D, rank 99)

- **Browser/web share (RI):** org-wide 3-10%; back-office 35-55%. Confidence: Low.
- **Typical browser work:** Subsidy/programme portals, grain marketing, compliance.
- **Common applications [K]:** USDA/programme portals, farm management software, buyer portals.
- **Repetitive, rules-based workflows:** Programme applications and compliance reporting.
- **Frequency:** Seasonal. **Systems per workflow:** 3-5. **Automation potential:** Low.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Overwhelmingly deskless.
- **Fit scores:** BS 2 · REP 2 · MS 3 · MAN 3 · API 2 · DEP 2 · VAL 1.
- **Fit reasoning:** Lowest fit.

#### 82. AgriTech: Fit 59 (Tier D, rank 78)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** Platform ops, grower onboarding.
- **Common applications [K]:** Internal platforms, Salesforce, APIs.
- **Repetitive, rules-based workflows:** Onboarding and data imports.
- **Frequency:** Weekly. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [K].
- **Limitations / assumptions:** API-native.
- **Fit scores:** BS 4 · REP 3 · MS 3 · MAN 3 · API 2 · DEP 4 · VAL 2.
- **Fit reasoning:** Low internal fit.

#### 84. Mining: Fit 53 (Tier D, rank 92)

- **Browser/web share (RI):** org-wide 5-15%; back-office 40-55%. Confidence: Low.
- **Typical browser work:** Regulatory/safety reporting, procurement.
- **Common applications [K]:** SAP (native), fleet/ops systems (native), regulator portals.
- **Repetitive, rules-based workflows:** Safety/environmental filings.
- **Frequency:** Monthly. **Systems per workflow:** 3-6. **Automation potential:** Low.
- **Evidence:** [S10]; [K].
- **Limitations / assumptions:** Deskless, remote sites.
- **Fit scores:** BS 2 · REP 3 · MS 3 · MAN 3 · API 3 · DEP 2 · VAL 2.
- **Fit reasoning:** Low fit.

#### 85. Aerospace & Defense: Fit 63 (Tier D, rank 72)

- **Browser/web share (RI):** org-wide 10-25%; back-office 40-55%. Confidence: Low.
- **Typical browser work:** Government contracting portals (invoicing, CDRLs), compliance.
- **Common applications [K]:** SAP/Deltek Costpoint, PIEE/WAWF, SAM.gov, supplier portals.
- **Repetitive, rules-based workflows:** Invoice and receiving-report submission in government invoicing portals; supplier compliance.
- **Frequency:** Weekly. **Systems per workflow:** 4-8. **Automation potential:** Low-Med.
- **Evidence:** [S11] ITAR/air-gap (blog).
- **Limitations / assumptions:** CMMC/ITAR; classified networks air-gapped.
- **Fit scores:** BS 3 · REP 3 · MS 4 · MAN 4 · API 4 · DEP 1 · VAL 3.
- **Fit reasoning:** Security rules out most environments. Unclassified contract-admin work is a possible niche.

### Legal, Accounting & Tax

#### 86. Legal Services & Law Firms: Fit 80 (Tier B, rank 28)

- **Browser/web share (RI):** org-wide 45-65%; back-office 55-75%. Confidence: Low.
- **Typical browser work:** Court e-filing, docketing, public-records searches, IP filings, billing.
- **Common applications [K]:** Clio/Elite 3E, iManage/NetDocuments, PACER/CM-ECF, state e-filing (e.g., Tyler Odyssey), USPTO Patent Center, e-billing portals (Legal Tracker).
- **Repetitive, rules-based workflows:** Filing and retrieving docket documents; submitting invoices into client e-billing portals; records searches; IP maintenance filings.
- **Frequency:** Daily. **Systems per workflow:** 6-10. **Automation potential:** Med-High.
- **Evidence:** [K].
- **Limitations / assumptions:** Lawyer-driven buying; courts vary by jurisdiction.
- **Fit scores:** BS 4 · REP 4 · MS 5 · MAN 4 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** Paralegal and legal-ops work spans court, client-billing and records portals. Buyers are conservative, but local execution helps with confidentiality.

#### 87. Accounting Firms: Fit 89 (Tier A, rank 12)

- **Browser/web share (RI):** org-wide 60-80%; back-office 65-80%. Confidence: Low-Med.
- **Typical browser work:** Client bookkeeping, bank/statement downloads, payroll portals, tax portals, document collection.
- **Common applications [K]:** QuickBooks Online, Xero, Karbon/Canopy/CCH Axcess, UltraTax/Lacerte/ProSystem fx (native), bank portals, IRS e-Services, state portals.
- **Repetitive, rules-based workflows:** Downloading statements from many client bank portals; reconciliations; payroll filings; notice retrieval.
- **Frequency:** Daily/monthly, per client. **Systems per workflow:** 6-15 (per client stack). **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Tax prep software is native; seasonal peaks.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** Every client adds another set of bank, payroll and tax portals. The work is monthly and repetitive, and firms are Windows shops.

#### 88. Auditing: Fit 73 (Tier C, rank 42)

- **Browser/web share (RI):** org-wide 55-75%; back-office 60-75%. Confidence: Low.
- **Typical browser work:** Confirmations, PBC request tracking, evidence gathering from client systems.
- **Common applications [K]:** CaseWare (native), Workiva, Confirmation.com, client portals, AuditBoard.
- **Repetitive, rules-based workflows:** Sending/tracking confirmations; pulling evidence from client portals.
- **Frequency:** Seasonal. **Systems per workflow:** 5-8. **Automation potential:** Medium.
- **Evidence:** [K].
- **Limitations / assumptions:** Independence/evidence-integrity rules; seasonal.
- **Fit scores:** BS 4 · REP 4 · MS 4 · MAN 4 · API 3 · DEP 3 · VAL 4.
- **Fit reasoning:** Evidence-gathering is a fit, but independence rules and evidence integrity make buyers cautious.

#### 89. Tax Services (incl. indirect tax, payroll tax): Fit 91 (Tier A, rank 8)

- **Browser/web share (RI):** org-wide 55-75%; back-office 65-80%. Confidence: Low-Med.
- **Typical browser work:** Multi-state/multi-jurisdiction filings and payments, notice handling, registrations.
- **Common applications [K]:** State/local tax portals, IRS/HMRC/GSTN portals, Avalara/Vertex (partial filing APIs), tax software.
- **Repetitive, rules-based workflows:** Filing and paying sales/use tax portal by portal each month; retrieving notices; registrations.
- **Frequency:** Monthly/quarterly per jurisdiction. **Systems per workflow:** 10+ jurisdiction portals. **Automation potential:** High.
- **Evidence:** [K].
- **Limitations / assumptions:** Filing services cover many but not all jurisdictions; seasonal peaks.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** One filing multiplies across jurisdictions, each with its own portal and no API, and repeats every period.

### Supply Chain & Procurement

#### 99. Supply Chain Management: Fit 86 (Tier B, rank 19)

- **Browser/web share (RI):** org-wide 35-55%; back-office 65-80%. Confidence: Low.
- **Typical browser work:** Supplier collaboration, shipment visibility, customer portals, planning data pulls.
- **Common applications [K]:** SAP/Oracle/Kinaxis, supplier and customer portals, carrier tracking sites, project44/FourKites, Excel.
- **Repetitive, rules-based workflows:** Chasing PO confirmations in supplier portals; tracking shipments across carrier sites; downloading forecasts from customer portals.
- **Frequency:** Daily. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [S5] (verified); [K].
- **Limitations / assumptions:** Visibility platforms cover big carriers; ERPs native.
- **Fit scores:** BS 4 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 3 · VAL 4.
- **Fit reasoning:** The job is coordinating across partners' portals. The large carriers are covered by visibility platforms; the long tail isn't.

#### 100. Procurement & Vendor Management: Fit 91 (Tier A, rank 9)

- **Browser/web share (RI):** org-wide 60-80%; back-office 70-85%. Confidence: Low-Med.
- **Typical browser work:** Supplier onboarding/verification, PO/invoice processing; supplier-side invoice submission to customer portals.
- **Common applications [K]:** SAP Ariba, Coupa, Jaggaer, Oracle, Tungsten/Basware, D&B, sanctions/TIN checks, COI trackers.
- **Repetitive, rules-based workflows:** Supplier onboarding checks across registries; supplier-side AR uploading invoices into each customer's procurement portal; remittance retrieval.
- **Frequency:** Daily. **Systems per workflow:** 6-12. **Automation potential:** High.
- **Evidence:** [S5] buyers mandate EDI/cXML/portals (verified core; sub-claim refuted); [K].
- **Limitations / assumptions:** Buyer side is well served by S2P suites; the pain is on the supplier side.
- **Fit scores:** BS 5 · REP 5 · MS 5 · MAN 5 · API 4 · DEP 4 · VAL 4.
- **Fit reasoning:** The best target is a supplier's AR team uploading invoices to dozens of customer procurement portals it doesn't control.

---

## 8. Key Patterns and Conclusions

1. **Fit comes from not owning the systems, not from browser share.** The top of the ranking is dominated by intermediaries: RCM firms, brokers, staffing agencies, 3PLs, forwarders, PEOs, accountants, property managers, and suppliers selling into big retailers and buyers. They do their clients' or partners' work inside portals owned by payers, carriers, customers, OEMs and governments. The portal owner has no reason to give each small counterparty an API, and the intermediary can't build one. PRD §6 describes the same condition: "getting one would mean three vendor roadmaps and a year" [S14].
2. **High browser share often means low fit.** SaaS, cloud, EdTech, FinTech, OTAs and digital marketing are among the most browser-heavy sectors, but they have APIs and engineers who use them. Treat SaaS vendors and IT/MSP firms as **distribution channels** (Rung 3), not automation buyers [S14].
3. **Frontline-heavy industries have small but real back offices.** Construction, logistics, hospitality and manufacturing have low org-wide browser shares because most of their workers are deskless [S10]. Their back offices can still be Tier A: 3PL brokerage desks, certified payroll, OEM warranty claims. Qualify by department, not by industry average.
4. **Legacy delivery is the most common deal-killer.** Citrix/VDI (hospital EHRs, BPOs working in client environments), mainframe or terminal cores (banks, airlines, public benefits), native clients (CargoWise, SAP GUI, CAD, tax-prep software), and non-Windows fleets (K-12 ChromeOS, creative Macs) account for most of the distance between "web-heavy industry" and "CONXA-ready account" [S14][S11].
5. **Self-healing is the wedge against incumbent RPA.** The strongest verified evidence of pain in the study is healthcare RCM, where automation is already bought. The recurring cost there is maintenance: "a simple change to a payer's portal can break a script" [S3]. Pitch CONXA to accounts with existing bots as the answer to that maintenance bill, not as a first automation.
6. **Local execution suits regulated buyers.** Banks, insurers, healthcare and wealth managers are regulated. Execution and credentials stay on the employee's machine [S14], which shortens the IT/security review that normally stalls automation in these sectors.
7. **There is a regulatory clock in healthcare.** Payer prior-authorisation APIs are due from January 2027 [S1][S7]. That will shrink part of the PA gap over time, but adoption by the long tail of payers and providers will be slow (only 24% of EHRs support ePA for prescriptions today [S1]). Eligibility, claim status, denials and payer enrolment are not covered by that mandate. Sell the broader RCM workflow set, not PA alone.

**Recommended sequencing:**
- **Now:** medical billing/RCM firms, insurance agencies, staffing firms, and 3PL/freight brokerages. The pain is strongest and best evidenced, the buyers are reachable, and most run Windows.
- **Next:** PEOs/HR services, property management, CPG deductions, accounting and tax firms.
- **Through channel:** clinics (via PM/RCM vendors), MSP clients (via MSPs), and government, energy and banking (via IT-services firms like the pilot's).

---

## 9. Research Limitations and Data Gaps

- **No measured browser-time data by industry.** We found no credible public telemetry giving browser or web-app time share by industry. All 200 percentage estimates are RI with wide bands. **Fastest fix:** run a 1–2 week time-in-application measurement on 3–5 design-partner machines (per-application foreground time from endpoint telemetry or browser management reporting). The result would replace inference with measurement for the industries that matter most.
- **Healthcare is over-represented in the verified evidence.** Four of the five verified claims concern healthcare or RCM. Tier-A rankings outside healthcare (brokerage, staffing, logistics, PEO, tax, property management) rest mostly on **[K]** workflow knowledge and the CONXA ICP logic. They are strong hypotheses to test in discovery, not established facts.
- **Primary sources that couldn't be read in full:** HBR's app-toggling study (Murty, Dadlani & Das, 2022; 20 teams studied), whose widely quoted figures of ~1,200 toggles a day and ~4 hours a week lost come to us via secondary citations [S8]; Okta *Businesses at Work 2025* (gated; figures via SC Media) [S4]; CAQH Index 2025 details (gated; only the $21B headline read) [S2]; BLS occupational-mix tables; the Emergence Capital deskless-workforce figure [S10].
- **Claims refuted in verification. Do not reuse:**
  - "~85% of knowledge-worker productive time is in the browser" (jimber.io blog, refuted 0–3) [S18]
  - "Employees spend 52% of the day actively on computers / 49% productive" (worktime.com, 0–3) [S19]
  - "RPA market $35.3B (2026) → $247.3B (2035); BFSI = 36.5% share" (GlobeNewswire release, 0–3) [S17]
  - "Up to 70% of company apps are SaaS" and "88% use cloud" (precision.co blog, 0–3)
  - "95% of US healthcare organisations rely on HL7 v2" (vendor blog, 0–3)
  - "Workers are interrupted every 6–12 minutes"; "a 15% reduction in context switching yields 17 hours a week"; attributions of 3-minute task switching to UC Irvine research (super-productivity.com, 0–3)
  - "RPA improves claims data accuracy by 90%" / "claims cut from 5 days to 1" / "70% of health execs plan RPA investment by 2025" (getmagical.com, 0–3)
  - "Average enterprise app count exceeds 100 in 2025" (SC Media summary of Okta, 1–2). The published figure could not be pinned down precisely.
- **Vendor-source bias.** Several usable healthcare figures come from browser-automation vendors: payer-portal counts and PA timing from Skyvern [S7], workflows spanning 8–15 systems from Asteroid [S16]. They are directionally consistent with the AMA and PYMNTS evidence, but they are marketing material and are labelled as such wherever used.
- **Geography.** Most evidence is US-centric (AMA, CAQH, payer portals, US state portals). Portal sprawl exists elsewhere (e.g., GST and customs portals in India, HMRC in the UK), but the specific workflows and rankings will shift by country.
- **Scoring is judgment.** Fit scores encode analyst judgment on seven factors against CONXA's own ICP. Two reasonable analysts could move an industry ±5–8 points. Tier boundaries matter more than exact rank.
- **Not assessed:** market size (number of firms × seats), willingness to pay, competitive intensity from incumbent RPA and browser-agent vendors per vertical, and terms-of-service restrictions of specific portals (e.g., dealer DMS vendors restricting third-party access). Each should be checked before committing a vertical sales motion.

---

## 10. Sources

Verification status comes from the 3-vote adversarial pass unless stated. "Read directly" means the primary document was retrieved and read for this report.

| Key | Source | Type | Status / how used |
|---|---|---|---|
| S1 | American Medical Association, *2025 AMA prior authorization physician survey* (n=1,000 physicians; 400 primary care / 600 specialists). https://www.ama-assn.org/system/files/prior-authorization-survey.pdf | Primary survey (**M**) | Read directly. ~40 PAs/physician/week; ~13 h/week; 24% of EHRs offer ePA for Rx; phone most common for medical-service PAs; 94% say PA increases burnout; insurer ePA commitments effective Jan 1 2027 |
| S2 | CAQH (now DataSpring), *2025 Index Report* landing page. https://www.dataspring.com/advisory-services/index-report | Primary (headline only) | Read directly. "$21 billion industry savings opportunity"; details gated |
| S3 | PYMNTS, *Forget AI, Robotic Process Automation Is Healthcare's Hottest Technology* (2025-08-18). https://www.pymnts.com/healthcare/2025/forget-ai-robotic-process-automation-is-healthcares-hottest-technology/ | Secondary / independent research | **Verified 3-0**: 67% of payer execs say manual platforms reduce efficiency. **Verified 2-1**: RPA automates eligibility, PA, coding, claim scrubbing, status, denial routing. Also: bots break when payer portals change; hospitals must standardise workflows first |
| S4 | SC Media summary of Okta *Businesses at Work 2025* (2025-03). https://www.scworld.com/resource/whos-using-what-results-from-the-2025-okta-businesses-at-work-report | Secondary (of primary telemetry) | **Verified 3-0**: 48% of M365 customers also use Google Workspace; 48% use Zoom despite Teams; 40% use Slack. Data Nov 2023–Oct 2024 |
| S5 | TradeCentric, *EDI vs API*. https://tradecentric.com/blog/edi-vs-api/ | Secondary (vendor) | **Verified 3-0**: EDI embedded in retail, automotive, healthcare distribution. Sub-claim "most suppliers must maintain dual EDI/API" **refuted 0-3** |
| S6 | RevCycle.com, *Insurance claims & prior authorizations streamlined with AI & RPA* (2025-03-27). https://www.revcycle.com/2025/03/27/insurance-claims-prior-authorizations-streamlined-with-ai-rpa/ | Industry blog | **Verified 2-1**: PA and claims are manual, error-prone, policy-cross-checking workflows |
| S7 | Skyvern, *Automate healthcare prior authorization on insurance portals*. https://www.skyvern.com/blog/automate-healthcare-prior-authorization-insurance-portals/ | Vendor blog | Not verified. 10–40+ payer portals daily; 69% of PA tasks manual (attributed to CAQH); 16 min per portal PA; CMS FHIR PA APIs Jan 2027. Directional only |
| S8 | Murty, Dadlani & Das, *How Much Time and Energy Do We Waste Toggling Between Applications?* Harvard Business Review (2022-08-29). https://hbr.org/2022/08/how-much-time-and-energy-do-we-waste-toggling-between-applications | Primary (paywalled) | Summary read (20 teams studied). ~1,200 toggles/day and ~4 h/week figures via secondary citations |
| S9 | *The Instrumental Dissolution of Typing*, arXiv 2604.17023. https://arxiv.org/pdf/2604.17023 | Preprint (secondary for statistics) | Not verified. ~half of US workforce uses a keyboard as primary instrument (up from 25% in 1984) |
| S10 | Emergence Capital, deskless-workforce research (~80% of global workforce deskless) | Primary (not retrieved) | Widely cited. Could not be fetched in this session; used only as an upper-bound anchor |
| S11 | Houseblend, *On-premise & hybrid ERP 2025*. https://www.houseblend.io/articles/on-premise-hybrid-erp-2025 ; Hypersense, *Cloud vs on-premise guide* (2025-07-31). https://hypersense-software.com/blog/2025/07/31/cloud-vs-on-premise-infrastructure-guide/ | Blogs | Not verified. Manufacturing/defense on-prem preference; sector cloud-adoption figures. Directional only |
| S12 | BetterCloud, *State of SaaS*. https://www.bettercloud.com/resources/state-of-saas/ | Vendor research | Extracted, not verified (e.g., avg 118 SaaS apps/org). Not relied on |
| S13 | CloudNuro, *SaaS statistics 2026*. https://www.cloudnuro.ai/blog/saas-statistics-2026 | Blog | Not verified. Industry SaaS app counts (tech 478, financial services 412, healthcare 287, government 156). Directional only |
| S14 | CONXA internal: `docs/PRD.md` §6 *Target Customers (ICP)* | Internal | Qualifying shape, rungs, disqualifiers, channel insight from services-firm pilot |
| S15 | Optexity, *Why legacy healthcare systems don't have APIs*. https://optexity.com/blog/why-legacy-healthcare-systems-dont-have-apis-and-what-to-do-about-it | Vendor blog | HL7 claim **refuted 0-3**; not relied on |
| S16 | Asteroid, *Healthcare workflow automation*. https://asteroid.ai/blog/healthcare-workflow-automation/ | Vendor blog | Not verified. Workflows span 8–15 systems; portal logins still load-bearing in 2026 |
| S17 | GlobeNewswire, RPA market-size release (2025-12-16). https://www.globenewswire.com/news-release/2025/12/16/3206126/0/en/ | Press release | **Refuted 0-3**. Listed so it is not reused |
| S18 | Jimber, *The browser as the new operating system* (2025-12-27). https://jimber.io/blog/the-browser-as-the-new-operating-system-what-this-means-for-your-security-in-2026/ | Vendor blog | "85% of time in browser" **refuted 0-3** |
| S19 | Worktime, *Computer time research*. https://www.worktime.com/research-computer-time | Vendor research | 52%/49% figures **refuted 0-3** |
| — | precision.co, getmagical.com, super-productivity.com, workbeaver.com, claryti.ai, cloudindustryreview.com | Blogs | Claims refuted or empty; not relied on |
| — | Everest Group RPA PEAK Matrix 2024. https://www.everestgrp.com/report/egr-2024-38-r-6717/ | Analyst (gated) | Landing page only; 27 RPA vendors assessed; not relied on |

