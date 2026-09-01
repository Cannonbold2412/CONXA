# Conxa — Pune Target List (Rung 2, first 3 pilots)

**Date:** 2026-09-01
**Status:** Working outbound list for the first 3 Rung-2 pilots in Pune.
**Scope:** `docs/PRD.md` §6 **Rung 2 only** — mid-market/enterprise companies automating *their own*
cross-system operations. Rung 3 (SaaS vendors, IT-services firms as a channel) is deliberately excluded;
it is a separate list and a separate motion.

> **Read this before using the table.** Every row is a **hypothesis, not research.** Compiled from
> general market knowledge as of early 2026 — no company here has been contacted, and no employee count,
> HQ location, system landscape or process has been individually verified. Confirm size, Pune footprint,
> and browser-vs-Citrix reality before you write to anyone. Names are included for the *shape* of the
> account, not as a validated fact base.

---

## Row 0 — Centelon Solutions *(already in motion — work this before any cold row)*

**Not a Pune-list row and not Rung 2.** Centelon is the Rung 3 channel account from the pilot demo of
**7 Aug 2026** (see `Conxa-Pilot-Conclusions.pdf`, internal) — the relationship that produced the
current positioning in `docs/PRD.md` §6 and the repricing in `docs/cost_model.md` v18. It is listed
first anyway, because a warm account with a completed demo outranks all fifty cold names below it.

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

**How Centelon relates to the fifty below.** It is a *different motion*, not a competing one, and the
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

## Priority A — approach now (20)

Mid-market, Pune-HQ or Pune-run, reachable champion, high odds of a browser-only cross-system process.

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

---

## Priority B — second wave (20)

Same fit, but a longer cycle, a bigger security gate, or a higher chance the work sits in a thick client.

| # | Company | Segment | Likely first process | Entry point | Watch-out |
|---|---|---|---|---|---|
| 21 | Tata Autocomp Systems | Auto components (Pune HQ) | Supplier PO + quality docs across plants | Shared Services head | Multi-entity — pick one business unit |
| 22 | Bharat Forge | Forging / defence (Pune HQ) | Export documentation; customs portal filings | Head of Exports Ops | Defence side carries clearance overhead — stay commercial |
| 23 | Gabriel India (Anand Group) | Auto components (Pune) | Customer schedule ingestion; invoice matching | Ops / Customer Service head | EDI may already cover it — ask |
| 24 | Cummins India | Engines (Pune HQ) | Warranty claims; dealer portal reconciliation | After-Sales Ops | Global parent — IT policy set outside India |
| 25 | SKF India | Bearings (Pune HQ) | Distributor claims; order entry | Customer Service Ops | Global IT gate |
| 26 | Alfa Laval India | Industrial (Pune) | Service order processing; spares quoting | Service Ops head | Global IT gate |
| 27 | Atlas Copco India | Industrial (Pune) | Service contract renewals; parts ordering | Service Ops head | Global IT gate |
| 28 | Sandvik Asia | Industrial (Pune) | Order processing across ERP + customer portals | Order Management | Global IT gate |
| 29 | John Deere India | Agri equipment (Pune HQ) | Dealer claims; warranty processing | Dealer Ops | US IT policy |
| 30 | Honeywell Automation India | Automation (Pune HQ) | Project billing; vendor onboarding | Finance Shared Services | Strong central IT — expect a questionnaire |
| 31 | Tetra Pak South Asia | Packaging (Pune HQ) | Customer order + dispatch documentation | Supply Chain Ops | Global IT gate |
| 32 | Schindler India | Elevators (Pune HQ) | Service ticket to billing across systems | Service Ops head | Field-service tooling may be mobile-first |
| 33 | Eaton India | Electrical (Pune) | Supplier onboarding; invoice processing | Shared Services | GCC-style gate |
| 34 | Emcure Pharmaceuticals | Pharma (Pune HQ) | Regulatory submission portals; distributor claims | Regulatory Ops / Commercial Ops | Regulated — expect validation documentation |
| 35 | Serum Institute of India | Vaccines (Pune HQ) | Export documentation; regulatory uploads | Supply Chain / Regulatory | Very high-security environment |
| 36 | Lupin (Pune operations) | Pharma | Regulatory portal submissions; vendor ops | Ops head, Pune site | Mumbai HQ decides |
| 37 | Syngenta India | Agri-science (Pune HQ) | Distributor claims; statutory filings | Commercial Ops | Global IT gate |
| 38 | Mercedes-Benz India | Automotive (Pune/Chakan) | Dealer claim processing; import documentation | Dealer Ops / Finance | German IT governance |
| 39 | Volkswagen India | Automotive (Chakan) | Supplier documentation; customs filings | Logistics Ops | Same |
| 40 | Force Motors | Automotive (Pune HQ) | Dealer order + warranty processing | After-Sales Ops | Leaner IT — may move up to Priority A on contact |

---

## Priority C — trophy band, after two references (10)

Real fit and the largest deal sizes, but 6–9 month cycles, formal procurement, and security
questionnaires you should not be answering yet.

| # | Company | Segment | Likely first process | Entry point | Watch-out |
|---|---|---|---|---|---|
| 41 | Bajaj Allianz General Insurance | Insurance (Pune HQ) | Claims intake; surveyor and garage coordination | Head of Claims Ops | Textbook fit, textbook long cycle |
| 42 | Bajaj Allianz Life Insurance | Insurance (Pune HQ) | Policy issuance; agent onboarding | Head of New Business | Same |
| 43 | Bajaj Finance / Bajaj Finserv | NBFC (Pune HQ) | Loan file processing; collections reconciliation | Head of Credit Ops | Heavily automated already — find the residue |
| 44 | Tata Motors | Automotive (Pimpri) | Dealer claims; supplier documentation | Shared Services | Enormous; needs an internal sponsor to navigate |
| 45 | Bajaj Auto | Automotive (Akurdi) | Dealer/warranty ops; export documentation | After-Sales Ops | Same |
| 46 | Deutsche Bank Group Services, Pune | BFSI GCC | Reconciliation; controls-evidence collection | Ops COO / automation CoE | **Check Citrix first — likely blocker** |
| 47 | Barclays Global Service Centre, Pune | BFSI GCC | KYC refresh; controls testing | Automation CoE | Same |
| 48 | Northern Trust, Pune | BFSI GCC | Fund accounting reconciliation; client reporting | Ops automation lead | Same |
| 49 | Allianz Technology, Pune | Insurance GCC | Claims support ops; vendor reconciliation | Ops lead | Same |
| 50 | WNS / eClerx / Infosys BPM (Pune delivery) | BPO ops | Client back-office processes at volume | Delivery / Transformation head | Client contracts may forbid third-party tooling — check first |

---

## Which three to actually start with

Do **not** open with rows 41–50, however tempting the logo. The first three pilots exist to prove the
product is repeatable, not to win a name. Pick from Priority A, and pick **two different segments** so
that three pilots teach you about the product rather than about one industry.

Recommended opening three:

1. **A Pune hospital** (rows 8–10) — insurance pre-auth and TPA claim submission is the best-shaped
   process on this list: four portals, daily, no API will ever exist, and the cost per run is easy for
   them to state.
2. **A Pune-HQ manufacturer** (rows 1–5, 14–16) — supplier invoice matching or export documentation.
   Different vertical, same shape, and the champion is usually one email away.
3. **A lender, co-operative bank, or university** (rows 6, 7, 17, 18) — a third vertical, and a useful
   test of whether a regulated ops team can clear IT in under three weeks.

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
