# Conxa — Pune Target List (Rung 2, first 3 pilots)

**Date:** 2026-09-01 · **Updated:** 2026-09-23 (added 12 companies from cross-industry fit analysis, see below)
**Status:** Working outbound list for the first 3 Rung-2 pilots in Pune.
**Scope:** `docs/PRD.md` §6 **Rung 2 only** — mid-market/enterprise companies automating *their own*
cross-system operations. Rung 3 (SaaS vendors, IT-services firms as a channel) is deliberately excluded;
it is a separate list and a separate motion.

> **Read this before using the table.** Every row is a **hypothesis, not research.** Compiled from
> general market knowledge as of early-to-mid 2026 — no company here has been contacted, and no employee
> count, HQ location, system landscape or process has been individually verified. Confirm size, Pune
> footprint, and browser-vs-Citrix reality before you write to anyone. Names are included for the *shape*
> of the account, not as a validated fact base.

> **2026-09-23 addition.** Twelve companies below (marked with a trailing `†` in the Priority A table)
> were added from [`industry-browser-work-conxa-fit.md`](industry-browser-work-conxa-fit.md), a 100-industry
> CONXA-fit ranking. They fill segments the original 50 barely touched: medical billing/RCM, insurance
> brokerage, TPA claims, staffing/VMS, freight forwarding, accounting/tax, and property/facility
> management — every one of them a Tier A industry (fit score ≥88) in that report, and better-evidenced
> than most of the original manufacturing-heavy list. Same caveat applies: found via web search, not verified.

---

## Row 0 — Centelon Solutions *(already in motion — work this before any cold row)*

**Not a Pune-list row and not Rung 2.** Centelon is the Rung 3 channel account from the pilot demo of
**7 Aug 2026** (see `Conxa-Pilot-Conclusions.pdf`, internal) — the relationship that produced the
current positioning in `docs/PRD.md` §6 and the repricing in `docs/cost_model.md` v18. It is listed
first anyway, because a warm account with a completed demo outranks all sixty-three cold names below it.

| | |
|---|---|
| **Rung** | 3 — IT-services / consulting firm, distributing to their own clients |
| **Status** | Pilot demo done (7 Aug 2026). The follow-up conversation is the open item. |
| **Why it matters disproportionately** | A services firm implementing Odoo, Salesforce, ERP and CRM across banking, insurance, energy, aged care and government clients is not one customer — it is many enterprises reachable through one relationship, and they already know which processes break at client after client. |
| **The sale** | *Not* their internal work (timesheets, invoicing, client reporting) — that is the demo. The sale is automating the same *shape* of cross-system process they already get paid to implement for clients. |
| **Won when** | They resell it under their own name without us in the room (`docs/PRD.md` §6, Rung 3). |
| **Blocker to clear first** | **Code signing.** External distribution is the entire point of this rung, and an unsigned `.exe` breaks it — a ~$200/yr certificate purchase with no engineering work left (`docs/Sales-Blockers.md` §2.5). |
| **Open question** | Horizon 3's operational intelligence assumes a workspace understands *its own* operations. In a reseller relationship the executions happen inside the clients' businesses, so who that intelligence belongs to is unresolved (`docs/PRD.md` §14.5). Changes nothing about what they buy today — **do not promise it yet.** |
| **Next action** | The follow-up conversation. `docs/Sales-Blockers.md` is blunt that the ICP is still a hypothesis and only this conversation answers it — not more engineering. |

**How Centelon relates to the list below.** It is a *different motion*, not a competing one, and the
two feed each other: the Rung-2 pilots produce the proof points and the delivery playbook that make the
Centelon channel conversation credible. Run both — but do not let the channel conversation substitute
for the three Rung-2 pilots, because a channel that resells an unproven delivery process just multiplies
the failure.

---

## How to use this list

1. Work **Priority A first**. These are the pilot-shaped accounts: big enough to have system sprawl,
   small enough that the Head of Operations answers their own email.
2. **Priority B** is the follow-on wave — same fit, longer cycle or harder gate.
3. **Priority C** is the trophy band. Real fit, 6–9 month cycles, security questionnaires. Do not spend
   sales hours here before two reference logos exist.
4. Every row must still pass the **six-question qualification call** before it becomes a pilot. The list
   gets you a meeting; the checklist decides whether there is a deal.

### The six questions (from `docs/PRD.md` — Workflow Qualification Checklist)

| # | Question | Kill condition |
|---|---|---|
| 1 | How many separate systems/tabs does this process touch? | Fewer than 3, or one team owns them all |
| 2 | How often does it run? | Monthly is marginal; quarterly is a no |
| 3 | Is all of it in a browser? | **Citrix / VDI / SAP GUI / desktop app = hard blocker** |
| 4 | Fresh one-time code on *every* login? | Every time = hard blocker, no workaround |
| 5 | Windows machines? | Mac-only fleet = roadmap, not capability |
| 6 | Minutes per run × runs per month × loaded cost? | Nobody can produce the number = not painful enough |

Fail 1 or 2 and it is not a small deal — it is not a deal. Say so on the call.

### Entry point

Start at the **Champion**: Manager / Team Lead / AVP in Operations, Shared Services, or Back Office.
Not the CIO — in Pune mid-market the CIO routes you into a vendor-evaluation process that eats a quarter.
Bring **IT/InfoSec** in at week 2 with one sentence: *execution and credentials never leave the
employee's machine.*

---

## Priority A — approach now (32)

Mid-market, Pune-HQ or Pune-run, reachable champion, high odds of a browser-only cross-system process.
Rows 21–32 (marked `†`) are the 2026-09-23 additions, ordered by the fit score of their industry in
`industry-browser-work-conxa-fit.md`.

| # | Company | Segment | Likely first process | Entry point | Watch-out |
|---|---|---|---|---|---|
| 1 | Forbes Marshall | Industrial equipment (Pune HQ) | Supplier invoice matching; export documentation | Head of Shared Services / Finance Ops | Family-run — decisions are fast, but one person gates them |
| 2 | Praj Industries | Engineering / bioenergy (Pune HQ) | Vendor onboarding; project billing across ERP + portals | Head of Commercial Ops | Project-based work — check the process actually repeats weekly |
| 3 | Sudarshan Chemical Industries | Specialty chemicals (Pune HQ) | GST/regulatory portal filings; export docs | Finance Ops / Compliance lead | Some filings are monthly — probe frequency hard |
| 4 | Garware Technical Fibres | Manufacturing (Pune HQ) | Export documentation; customer PO entry | Head of Order Management | Confirm the ERP is browser-based, not SAP GUI |
| 5 | Deepak Fertilisers & Petrochemicals | Chemicals (Pune HQ) | Dispatch documentation; statutory portal uploads | Head of Supply Chain Ops | Large-ish — may route you to IT |
| 6 | Poonawalla Fincorp | NBFC / lending (Pune HQ) | Loan file verification; KYC across bureau + LOS + CRM | Head of Credit Ops | Bureau portals may have bot protection — check the exact path |
| 7 | Cosmos Bank | Co-operative bank (Pune HQ) | Account opening; reconciliation across core + portals | Head of Operations | Core banking is often a thick client — question 3 is decisive |
| 8 | Sahyadri Hospitals | Healthcare chain (Pune HQ) | Insurance pre-auth; claim submission to multiple TPAs | Head of Revenue Cycle / TPA desk | The best-shaped process on this list |
| 9 | Ruby Hall Clinic | Healthcare (Pune) | TPA claim submission; discharge billing | Billing / TPA manager | Older IT estate — confirm browser access |
| 10 | Deenanath Mangeshkar Hospital | Healthcare (Pune) | Pre-auth and claims across insurer portals | Insurance desk manager | Same as above |
| 11 | Parag Milk Foods | FMCG / dairy (Pune) | Distributor order entry; secondary sales reconciliation | Head of Sales Ops | Check whether a DMS with an API already covers it |
| 12 | Weikfield Foods | FMCG (Pune HQ) | Distributor claims; retailer portal uploads | Ops / Trade Marketing lead | Smaller — confirm volume clears the repetition bar |
| 13 | Chitale Group (Bandhu / Dairy) | FMCG / dairy (Pune) | Distributor reconciliation; compliance uploads | Operations head | Traditional business — champion may not be digital-first |
| 14 | Kirloskar Pneumatic | Engineering (Pune HQ) | PO entry; supplier quality-certificate upload | Procurement Ops | Confirm the ERP surface is browser-based |
| 15 | Kirloskar Oil Engines | Engineering (Pune HQ) | Warranty claim processing; dealer portal ops | Head of After-Sales Ops | Larger — longer cycle than the rest of Priority A |
| 16 | Finolex Industries | Manufacturing (Pune HQ) | Dealer order processing; GST reconciliation | Finance Shared Services | — |
| 17 | Symbiosis International University | Education (Pune) | Admissions processing; regulatory portal submissions | Registrar / Head of Admissions | Seasonal peaks — check it runs year-round |
| 18 | MIT World Peace University | Education (Pune) | Admissions; fee reconciliation across gateway + ERP | Director of Admissions / Finance | Same seasonality question |
| 19 | Bharati Vidyapeeth | Education (Pune) | Student records transfer; statutory uploads | Registrar's office | Large and bureaucratic — find one motivated department |
| 20 | Suzlon Energy | Renewables (Pune HQ) | Vendor onboarding; O&M documentation across portals | Head of Shared Services | Post-restructuring — confirm the ops team is stable |
| 21† | Aarin Healthcare Solutions | Medical billing / RCM (Pune) | Payment posting; claim status; denial follow-up across US payer portals | Founder / Ops Head | Smaller shop — faster decisions; confirm Windows/browser stack for US payer sites |
| 22† | First Policy (Insurance Brokers) | Insurance brokerage (Pune HQ) | Re-quoting one risk across multiple carrier portals; policy/endorsement downloads into AMS; COI issuance | Founder / Head of Operations | Boutique broker — check volume clears the repetition bar |
| 23† | Life & General (LNG) Insurance Brokers | Insurance brokerage (Pune HQ) | Carrier-portal quoting; commission statement reconciliation | Head of Operations | One of the first IRDAI-licensed brokers — good reference-logo potential |
| 24† | Paysquare Consultancy Services | HR/payroll outsourcing (Pune HQ) | Employee enrol/terminate across carrier portals; state tax portal registrations; PF/ESI filings | Head of Operations | 2000+ clients — check which portals already have EDI/API feeds vs. manual |
| 25† | Career Placements India | Staffing/recruitment (Pune HQ) | Candidate submission into client VMS portals; timesheet entry/approval | Head of Delivery | 25-year firm — check which clients still require manual VMS entry vs. API-based VMS |
| 26† | Blue Venture Consultancy Services | Staffing/recruitment (Pune HQ) | Job posting across boards; VMS timesheet and onboarding entry | Operations Head | Smaller firm — confirm volume |
| 27† | BVG India | Facility & property management (Pune HQ) | Utility bill download/re-billing across societies; vendor invoice entry; municipal compliance uploads | Head of Operations | Very large diversified group — find the specific property-management business unit |
| 28† | SNR & Company (CA firm) | Accounting/tax services (Pune office) | Client bank-statement downloads; GST/TDS filing across jurisdictions; notice retrieval | Partner / Office Head | Multi-city firm — Pune office may need head-office sign-off |
| 29† | Sachin Gujar & Associates | Accounting/tax services (Pune) | GST return filing; client-portal bookkeeping entry | Founder | Smaller firm — fast decision, lower volume |
| 30† | MD India Health Insurance TPA Services | Health insurance TPA (Pune HQ) | Cashless claim processing; hospital empanelment checks; reimbursement claim status | Head of Claims Operations | IRDAI-regulated — confirm the core claims system is browser-based, not a locked internal tool |
| 31† | Vision Global Logistics | Freight forwarding / customs broker (Pune) | Booking on carrier portals; B/L and arrival-notice retrieval; customs entry filing | Head of Operations | If core system is CargoWise (native client), only the portal-facing steps qualify |
| 32† | Zeus Air Services | Freight forwarding (Pune HQ) | Carrier tracking lookups; customs clearance document upload; D&D dispute filing | Operations Head | Air-freight focused — check volume and portal count |

---

## Priority B — second wave (21)

Same fit, but a longer cycle, a bigger security gate, or a higher chance the work sits in a thick client.
Row 53 (marked `†`) is the one 2026-09-23 addition placed here rather than Priority A.

| # | Company | Segment | Likely first process | Entry point | Watch-out |
|---|---|---|---|---|---|
| 33 | Tata Autocomp Systems | Auto components (Pune HQ) | Supplier PO + quality docs across plants | Shared Services head | Multi-entity — pick one business unit |
| 34 | Bharat Forge | Forging / defence (Pune HQ) | Export documentation; customs portal filings | Head of Exports Ops | Defence side carries clearance overhead — stay commercial |
| 35 | Gabriel India (Anand Group) | Auto components (Pune) | Customer schedule ingestion; invoice matching | Ops / Customer Service head | EDI may already cover it — ask |
| 36 | Cummins India | Engines (Pune HQ) | Warranty claims; dealer portal reconciliation | After-Sales Ops | Global parent — IT policy set outside India |
| 37 | SKF India | Bearings (Pune HQ) | Distributor claims; order entry | Customer Service Ops | Global IT gate |
| 38 | Alfa Laval India | Industrial (Pune) | Service order processing; spares quoting | Service Ops head | Global IT gate |
| 39 | Atlas Copco India | Industrial (Pune) | Service contract renewals; parts ordering | Service Ops head | Global IT gate |
| 40 | Sandvik Asia | Industrial (Pune) | Order processing across ERP + customer portals | Order Management | Global IT gate |
| 41 | John Deere India | Agri equipment (Pune HQ) | Dealer claims; warranty processing | Dealer Ops | US IT policy |
| 42 | Honeywell Automation India | Automation (Pune HQ) | Project billing; vendor onboarding | Finance Shared Services | Strong central IT — expect a questionnaire |
| 43 | Tetra Pak South Asia | Packaging (Pune HQ) | Customer order + dispatch documentation | Supply Chain Ops | Global IT gate |
| 44 | Schindler India | Elevators (Pune HQ) | Service ticket to billing across systems | Service Ops head | Field-service tooling may be mobile-first |
| 45 | Eaton India | Electrical (Pune) | Supplier onboarding; invoice processing | Shared Services | GCC-style gate |
| 46 | Emcure Pharmaceuticals | Pharma (Pune HQ) | Regulatory submission portals; distributor claims | Regulatory Ops / Commercial Ops | Regulated — expect validation documentation |
| 47 | Serum Institute of India | Vaccines (Pune HQ) | Export documentation; regulatory uploads | Supply Chain / Regulatory | Very high-security environment |
| 48 | Lupin (Pune operations) | Pharma | Regulatory portal submissions; vendor ops | Ops head, Pune site | Mumbai HQ decides |
| 49 | Syngenta India | Agri-science (Pune HQ) | Distributor claims; statutory filings | Commercial Ops | Global IT gate |
| 50 | Mercedes-Benz India | Automotive (Pune/Chakan) | Dealer claim processing; import documentation | Dealer Ops / Finance | German IT governance |
| 51 | Volkswagen India | Automotive (Chakan) | Supplier documentation; customs filings | Logistics Ops | Same |
| 52 | Force Motors | Automotive (Pune HQ) | Dealer order + warranty processing | After-Sales Ops | Leaner IT — may move up to Priority A on contact |
| 53† | Access Healthcare (Pune delivery center) | Medical billing / RCM (global BPO, Pune center) | Eligibility verification; PA submission/status; claim status across payer portals | Delivery Ops Head, Pune center | Large global BPO — likely needs corporate-level entry, not just the local center |

---

## Priority C — trophy band, after two references (10)

Real fit and the largest deal sizes, but 6–9 month cycles, formal procurement, and security
questionnaires you should not be answering yet.

| # | Company | Segment | Likely first process | Entry point | Watch-out |
|---|---|---|---|---|---|
| 54 | Bajaj Allianz General Insurance | Insurance (Pune HQ) | Claims intake; surveyor and garage coordination | Head of Claims Ops | Textbook fit, textbook long cycle |
| 55 | Bajaj Allianz Life Insurance | Insurance (Pune HQ) | Policy issuance; agent onboarding | Head of New Business | Same |
| 56 | Bajaj Finance / Bajaj Finserv | NBFC (Pune HQ) | Loan file processing; collections reconciliation | Head of Credit Ops | Heavily automated already — find the residue |
| 57 | Tata Motors | Automotive (Pimpri) | Dealer claims; supplier documentation | Shared Services | Enormous; needs an internal sponsor to navigate |
| 58 | Bajaj Auto | Automotive (Akurdi) | Dealer/warranty ops; export documentation | After-Sales Ops | Same |
| 59 | Deutsche Bank Group Services, Pune | BFSI GCC | Reconciliation; controls-evidence collection | Ops COO / automation CoE | **Check Citrix first — likely blocker** |
| 60 | Barclays Global Service Centre, Pune | BFSI GCC | KYC refresh; controls testing | Automation CoE | Same |
| 61 | Northern Trust, Pune | BFSI GCC | Fund accounting reconciliation; client reporting | Ops automation lead | Same |
| 62 | Allianz Technology, Pune | Insurance GCC | Claims support ops; vendor reconciliation | Ops lead | Same |
| 63 | WNS / eClerx / Infosys BPM (Pune delivery) | BPO ops | Client back-office processes at volume | Delivery / Transformation head | Client contracts may forbid third-party tooling — check first |

---

## Which three to actually start with

Do **not** open with rows 54–63, however tempting the logo. The first three pilots exist to prove the
product is repeatable, not to win a name. Pick from Priority A, and pick **two different segments** so
that three pilots teach you about the product rather than about one industry.

Recommended opening three:

1. **A Pune hospital** (rows 8–10) — insurance pre-auth and TPA claim submission is the best-shaped
   process on this list: four portals, daily, no API will ever exist, and the cost per run is easy for
   them to state. **MD India TPA (row 30) is a strong alternative or companion pilot** — it sits on the
   payer side of the exact same claims workflow, so a hospital + TPA pair would show the process from
   both ends.
2. **A Pune-HQ manufacturer** (rows 1–5, 14–16) — supplier invoice matching or export documentation.
   Different vertical, same shape, and the champion is usually one email away.
3. **A lender, co-operative bank, university, insurance broker, or accounting firm** (rows 6, 7, 17, 18,
   22, 23, 28, 29) — a third vertical, and a useful test of whether a regulated ops team can clear IT in
   under three weeks. The insurance brokers and CA firms added 2026-09-23 are smaller and faster-moving
   than the bank/university rows if speed matters more than logo size.

Kill any of the three the moment it fails question 3 or 4, and move to the next row. A mis-qualified
pilot does not count toward your three.

## What each pilot must produce to count

1. A **different vertical** from the last one (2+ segments across the three).
2. **20+ real runs**, unattended, without you on the call.
3. **A witnessed self-heal** — a UI changed and the skill kept running. Without this you proved nothing
   that RPA couldn't.
4. **The number**: minutes saved × runs × loaded cost, in writing, from them.
5. **Nothing you can't repeat** — no midnight hand-patching to rescue a run.

## The gate before scaling outbound

- 3 pilots done, across 2+ verticals
- **2 or more converted to paid** (Starter)
- 1 expansion — a second department asked for it without being sold to
- The last pilot delivered in **3 weeks or less**, with less of your time than the first

---

## Deliberately not on this list

- **IT-services and consulting firms** (Cybage, Zensar, Nitor Infotech, Harbinger, Talentica,
  Mindbowser, Persistent, KPIT) and **SaaS vendors** (Icertis, Druva, PubMatic, Quick Heal, Vayana) —
  these are Rung 3, the highest-leverage rung, but a different motion and a separate list. The one
  exception carried here is **Centelon** (Row 0), because the relationship already exists.
- **Citrix/VDI-only environments, Mac-only fleets, mainframe or SAP GUI work** — outside what the
  recorder can capture today.
- **Consumer-facing or adversarial targets** — Conxa performs work an employee is already authorised to
  perform, in their own logged-in session. Nothing else.
