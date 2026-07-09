# Conxa — Target Customer List

**Date:** 2026-07-07
**Status:** Working GTM list — practical, execution-focused, deliberately not exhaustive.
**Sources & caveats:** Compiled from general market knowledge (as of early 2026), the strategy recorded in
[`conxa-critical-analysis.md`](../conxa-critical-analysis.md) (Option A: SMB SaaS vendors first), and the
enterprise plays tracked in `TODO.md` (PROD-13/14/15/16). **Every entry is a hypothesis to verify before
outreach** — no company here has been contacted or researched individually. Company sizes, locations, and
situations should be re-confirmed before any pitch.

**How to read Priority:**
- **P0** — pursue now. Fits the current ICP (small/mid SaaS vendor) or is reachable today with no trust-package gate.
- **P1** — pursue within 2–3 quarters, typically after signed installers + first proof points (Proof A/B).
- **P2** — pursue after the trust package (SOC 2 Type I minimum) and both proofs. Do not spend sales hours here yet.

**Use-case legend:**
- **Vendor ICP** — the core Option A motion: they build skills in Build Studio and ship them to *their* customers.
- **Ops user** — they automate their *own* internal/API-less tools (agent-enablement, evidence packs).
- **Channel** — they deploy Conxa inside client engagements; one deal = many logos.
- **Platform partner** — their ISV marketplace is the distribution play (PROD-13).

---

## 1. Global Enterprise Targets (12)

All P2 — every company here requires SOC 2, signed installers, and per-device identity before a first meeting is worth having. Listed so the *shape* of the eventual pitch is on record, per the two zones where browsers beat APIs even for giants (payback math, screen-as-ground-truth).

| Company | Why they fit | Use cases | Priority | Buyer to approach |
|---|---|---|---|---|
| Accenture | Staffs exactly the manual work Conxa automates, across hundreds of clients; industrializes tooling into engagements | Channel: M&A integration, migration validation, compliance testing delivery | P2 | Intelligent Automation practice lead |
| Deloitte | Its practitioners are the army collecting audit-evidence screenshots today | Channel: audit evidence packs in assurance engagements | P2 | Audit & Assurance innovation / internal-audit tech lead |
| EY | Same audit-evidence logic plus large SOX-outsourcing arms | Channel: SOX controls-testing evidence | P2 | Risk/controls technology lead |
| Constellation Software | 500+ acquired vertical-software companies, deliberately never integrated; hundreds of aging internal tools that will never get APIs | Ops user: bridge automation across the portfolio's long tail | P2 | Operating-group CTO / shared-services lead |
| Roper Technologies | Same holdco model — dozens of niche vertical-software businesses | Ops user: portfolio back-office automation | P2 | Operating-company CIO |
| Broadcom | Serial mega-acquirer with an aggressive consolidation playbook — constant system sunsets | Ops user: bridge automation during post-merger sunsets | P2 | IT integration PMO |
| UnitedHealth / Optum | Hundreds of acquired clinics and health-IT businesses; healthcare back-office portals are notoriously API-less | Ops user: acquisition onboarding, portal ops | P2 | Optum ops automation CoE |
| JPMorgan Chase | SOX controls testing and access reviews across thousands of internal apps | Ops user: evidence packs (PROD-14) | P2 | Internal audit / controls-testing technology |
| Pfizer | GxP computer-system validation requires documented, repeatable, screenshot-evidenced walkthroughs — Strict Mode is nearly purpose-built for the validation binder | Ops user: CSV evidence, periodic review walkthroughs | P2 | Quality / CSV (computer-system validation) lead |
| Unilever | Mid-flight on a multi-year S/4HANA program across dozens of country operations | Ops user: migration bridge + shadow-run validation (PROD-15) | P2 | ERP program PMO |
| State Farm | One of the largest, most customized Salesforce orgs anywhere; three vendor releases a year force retests of their own configuration | Ops user: tenant regression testing (needs PROD-16 decision) | P2 | Salesforce CoE / QA lead |
| Salesforce | Not an automation customer — the AppExchange ISV ecosystem is the partner play: "we make your marketplace agent-ready" | Platform partner (PROD-13) | P2 | AppExchange partner program / agent ecosystem team |

---

## 2. Indian Enterprise Targets (14)

India-first matters: proximity, network, price tolerance for an early-stage vendor, and ISO 27001 (per the critical analysis, ~80% overlap with SOC 2, Sprinto-friendly) satisfies most Indian buyers.

| Company | Why they fit | Use cases | Priority | Buyer to approach |
|---|---|---|---|---|
| Zoho | Marketplace of thousands of small ISVs — exactly Conxa's ICP; famously partner-friendly to Indian startups | Platform partner: make Zoho Marketplace apps agent-ready | P1 | Marketplace / partner ecosystem team |
| Freshworks | Same marketplace logic; strong agent/AI push already underway | Platform partner | P1 | Freshworks Marketplace partner team |
| LTIMindtree | Large SI, more accessible than the top two; active automation practice | Channel: client automation engagements | P1 | Automation / AI practice lead |
| Tech Mahindra | Pune-heavy SI — warm-intro territory; large BPS arm doing exactly the manual ops work | Channel + ops user (their BPS delivery) | P1 | Intelligent automation practice, Pune |
| TCS | Largest SI; internal-tool agent-enablement for hundreds of clients | Channel | P2 | Cognitive automation practice |
| Infosys | Same; EdgeVerve gives them an automation-product mindset | Channel | P2 | EdgeVerve / automation practice |
| HDFC Bank | RBI-regulated; enormous ops and audit-evidence workload | Ops user: evidence packs, internal-tool ops | P2 | Internal audit / ops excellence |
| ICICI Bank | Same, and historically faster to adopt new tech | Ops user: evidence packs | P2 | Digital / ops transformation office |
| ICICI Lombard | Insurance policy-admin legacy UIs; IRDAI attestation load | Ops user: evidence packs, policy ops | P2 | Ops transformation / compliance tech |
| Sun Pharma | GxP validation at India's largest pharma | Ops user: CSV evidence | P2 | Quality / CSV lead |
| Dr. Reddy's | GxP plus a public digital-transformation agenda | Ops user: CSV evidence, lab-system walkthroughs | P2 | Digital quality lead |
| Cipla | Same GxP profile | Ops user: CSV evidence | P2 | Quality systems lead |
| Apollo Hospitals | Clinic/hospital roll-ups; fragmented API-less healthcare systems | Ops user: acquisition onboarding, back-office ops | P2 | Group CIO / shared services |
| Tata Motors | Dealer-management and plant systems long tail; large SAP estate in migration | Ops user: bridge + shadow-run | P2 | IT PMO / digital manufacturing |

---

## 3. Pune Enterprise Targets (8)

The home-turf list. Warm intros are realistic, meetings are cheap, and a Pune anchor logo de-risks the rest of India.

| Company | Why they fit | Use cases | Priority | Buyer to approach |
|---|---|---|---|---|
| Persistent Systems | Pune HQ; product-engineering DNA means they evaluate early-stage tools on merit; dual value — internal use *and* a channel to hundreds of clients | Channel + ops user | **P0** | CTO office / GenAI-automation practice |
| Bajaj Finserv / Bajaj Finance | Pune HQ NBFC giant; enormous back-office ops; RBI-regulated (recurring evidence workload); digital-forward leadership | Ops user: evidence packs, ops automation | P1 (post-ISO/SOC 2 Type I) | Ops excellence / internal audit |
| Bajaj Allianz General Insurance | Pune HQ insurer; IRDAI attestation plus legacy policy-admin UIs | Ops user: evidence packs, policy ops | P1 | Ops transformation |
| KPIT Technologies | Pune HQ automotive-software firm; internal tools plus automotive-client channel | Channel + ops user | P1 | CTO office |
| Zensar Technologies | Pune HQ SI (RPG Group); mid-size means faster decisions than tier-1 SIs | Channel | P1 | AI/automation practice lead |
| Icertis | Pune-born SaaS unicorn; too big to be ICP, but agent-readiness pressure on their product and marketplace makes a partner conversation plausible | Platform partner / agent-readiness | P2 | Product / platform ecosystem team |
| Serum Institute of India | Pune; world's largest vaccine maker; GxP validation workload | Ops user: CSV evidence | P2 | Quality / CSV lead |
| Thermax | Pune industrial; SAP migration wave + decades of internal tools | Ops user: bridge + shadow-run | P2 | IT / ERP program office |

---

## 4. Pune Startups & SMBs — Ideal First Customers (16)

This is the ICP section. The Option A thesis lives or dies here: small SaaS vendors with no spare engineer, whose customers would genuinely use "ask Claude to do it in our product." Services firms are included as micro-channels — each serves dozens of exactly-ICP clients.

| Company | Why they fit | Use cases | Priority | Buyer to approach |
|---|---|---|---|---|
| Amura Marketing Technologies (Sell.Do) | Pune real-estate CRM SaaS; small team; customers are non-technical builders/brokers — the perfect Option A profile | Vendor ICP: ship "create lead / schedule site visit / send quote" skills to customers' Claude | **P0** | Founder / Head of Product |
| onlinesales.ai | Pune ad-tech SaaS serving retailers and marketplaces; SMB-heavy customer base | Vendor ICP: campaign setup / reporting skills | **P0** | Founder / CPO |
| Harbinger Group | Pune product studio with its own SaaS products (eLearning tools) plus dozens of SMB SaaS clients | Vendor ICP + micro-channel | **P0** | Product BU head |
| Sapience Analytics | Pune-rooted workforce-analytics SaaS; mid-market customers | Vendor ICP: admin/reporting skills | P0 | Head of Product |
| Quick Heal | Pune HQ security-product company; consumer/SMB customer base; agent-readiness is brand-relevant for them | Vendor ICP (larger): support/admin skills | P1 | CTO / product head |
| Mindtickle | Pune-born sales-readiness unicorn; has engineers (weakens the ICP fit) but strong design-partner potential and marketplace pressure | Vendor ICP (larger) / design partner | P1 | VP Product / ecosystem |
| Druva | Pune-rooted (US HQ) data-protection company; MSP channel could ship skills to end customers | Vendor ICP (larger) | P2 | Product / MSP program |
| GS Lab \| GAVS | Pune product-engineering firm; builds SaaS for dozens of SMB clients | Micro-channel: bundle Conxa into client builds | P1 | Delivery / practice head |
| Clarion Technologies | Pune SMB software-services firm; long tail of small SaaS clients | Micro-channel | P1 | CEO / delivery head |
| e-Zest | Pune digital-engineering firm; similar client profile | Micro-channel | P1 | CTO |
| Pratiti Technologies | Pune digital-product firm; smaller, founder-reachable | Micro-channel | P2 | Founder |
| Neilsoft | Pune engineering-software and services; own tools + client work | Micro-channel + ops user | P2 | Delivery head |
| AgroStar | Pune agritech; large field-ops and support back office | Ops user: internal-tool automation pilot | P1 | Head of Ops / support |
| ElasticRun | Pune B2B logistics; heavy manual back-office (onboarding, reconciliation) | Ops user | P1 | COO office |
| Xpressbees | Pune logistics unicorn; seller-support and ops tooling long tail | Ops user | P1 | Ops excellence |
| FirstCry | Pune e-commerce group; catalog/vendor ops across many internal tools | Ops user | P1 | Ops / vendor management head |

---

## Recommendations

### The best first 10 customers

Chosen for ICP fit, reachability from Pune, and what each one *proves*:

1. **Amura / Sell.Do** — the archetypal Option A vendor; if Conxa works anywhere, it works here.
2. **onlinesales.ai** — second vendor ICP; different app archetype (dashboards/campaign UIs) broadens Proof B.
3. **Harbinger** — vendor ICP + a door to their SMB client base.
4. **Sapience Analytics** — fourth vendor ICP; analytics-heavy UI stresses the recorder differently.
5. **Quick Heal** — first larger product company; tests whether mid-size vendors buy.
6. **Mindtickle** — design partner for credibility ("used by a unicorn's product team"), not early revenue.
7. **GS Lab | GAVS** — first channel pilot; one relationship, many ICP clients.
8. **Clarion Technologies** — second channel pilot; validates the micro-channel motion repeats.
9. **Persistent Systems** — first enterprise pilot (see below).
10. **ElasticRun** (or AgroStar) — first ops-user pilot; tests the internal-tools value prop that the entire enterprise strategy later depends on.

Targets 1–4 double as the **Proof B design partners** the critical analysis calls for (3 partners × 5 workflows × 3+ accounts). Give them 90 days free in exchange for cross-account data and a case study.

### The best first enterprise customer

**Persistent Systems.** Reasons: Pune HQ (warm intros, short cycles); a product-engineering culture that evaluates early-stage tools on technical merit rather than vendor-risk checklists; no regulated-customer-data gate blocking a pilot; and dual payoff — internal adoption plus a channel into hundreds of clients. An anchor logo from Persistent de-risks every other Indian enterprise conversation. **Runner-up:** Bajaj Finserv — bigger prize, but realistically gated on ISO 27001/SOC 2 Type I; start the relationship now, close after the trust package lands.

### Recommended outreach order

1. **Now → month 3:** Pune SMB SaaS vendors (P0 rows in §4) — design partners, Proof B, first paid conversions. Founder-led, warm intros via the Pune/SaaSBoomi network.
2. **Month 2 → 6:** Micro-channels (GS Lab, Clarion, e-Zest) + the Persistent pilot. Requires signed installers (build-plan item 5) — order certificates first.
3. **Month 6 → 12:** Pune/Indian regulated enterprises (Bajaj Finserv, Bajaj Allianz) + platform-partner conversations (Zoho, Freshworks) + tier-2 SIs (LTIMindtree, Tech Mahindra). Requires ISO 27001/SOC 2 Type I plus Proof A/B numbers.
4. **Month 12+:** Global list (§1) — only with Type II underway, both proofs in hand, and ideally through the channel (Accenture/Deloitte) rather than direct.

Do not invert this order. Every hour spent on a P2 giant before the proofs exist is an hour taken from the segment that decides whether the company lives.

### Simple go-to-market strategy for the first paying customers

1. **Productize the demo.** Record one killer skill on each design partner's own product in the first meeting — the Build Studio *is* the pitch. Target: prospect sees their own product driven by Claude within 30 minutes.
2. **Design-partner motion (months 0–3):** 3–4 Pune SaaS vendors, free for 90 days, in exchange for Proof B data (cross-account success rates) and a named case study. This is the same experiment the critical analysis calls the most important number in the company — sales and validation are one motion.
3. **Convert to small monthly contracts (months 2–4):** land at a price an SMB founder signs without a board conversation; expand on usage. Proof A starts counting from each vendor's first UI redesign — instrument vendor-minutes-per-republish from day one.
4. **Make Pune the beachhead:** SaaSBoomi, TiE Pune, and the local SaaS founder network make references travel fast in a dense community. Every case study is aimed at the next warm intro. Add the free operability scanner (PROD-8) when capacity allows — it converts this from outbound to inbound.
5. **Channel before enterprise:** one GS Lab-style partnership sells to more ICP companies per quarter than founder-led outbound can. Enterprise (Persistent aside) waits for the trust package — per the critical analysis, start the compliance clock now precisely so this wave isn't delayed later.
6. **Track weekly** (same metrics as the critical analysis §9): first-run success on foreign accounts · % of runs needing paid repair · vendor-minutes per republish · retention through redesigns · installer→active conversion · runs per customer per week.
