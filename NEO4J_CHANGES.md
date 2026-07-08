# Neo4j Graph — Changes To Do

Working note for reconciling the Neo4j graph with the new SIF HTML dashboard.
Source of truth for **names & schema = graphDB** (not the HTML short-names).

- Connected DB: `neo4j+s://24f83fa4.databases.neo4j.io`
- Live state: **25 Fund nodes, 5 Categories, 13 AMCs, 17 FundManagers, 0 orphans**
- Labels: `AMC, Category, Fund, FundManager`
- Rels: `MANAGES` (AMC→Fund), `BELONGS_TO` (Fund→Category), `MANAGED_BY` (Fund→FundManager)
- Uniqueness constraints: `AMC.amc_id`, `Category.category_id`, `Fund.fund_id`, `FundManager.name`

## Fund node schema (only these 8 property keys exist)
`fund_id, name, benchmark, exit_load, inception_date, options, plans, taxation`
> AUM, NAV, expense ratio, returns are NOT in the graph (come from JSON/client layer). Out of scope unless we decide to extend schema.

## AMC node schema
`amc_id, name`  — names use full form e.g. `"ICICI Prudential Mutual Fund"`.

---

## TASK 1 — Add 2 missing Fund nodes (Hybrid Long-Short, category_id 4)

Both are absent from the graph. Follow existing naming pattern `"<Brand> Hybrid Long-Short Fund"`.

### 1a. RedHex Hybrid Long-Short Fund (HSBC)
- [ ] AMC `"HSBC Mutual Fund"` does NOT exist → create it (needs new unique `amc_id` — TBD from probe)
- [ ] Fund node: name `"RedHex Hybrid Long-Short Fund"`, new unique `fund_id` (Hybrid suffix `04`)
- [ ] Rel `(HSBC)-[:MANAGES]->(RedHex)`
- [ ] Rel `(RedHex)-[:BELONGS_TO]->(Category {category_id:4})`
- [ ] Props from HTML: benchmark `NIFTY 50 Hybrid Composite Debt 50:50`, exit_load `2% if redeemed within 1 year, Nil thereafter`, plans `['Regular','Direct']`, options `['Growth','IDCW']`, taxation (per HTML taxnote — confirm), inception_date `2026-06-25` (allotment)
- [ ] Managers (HTML §Q): Shriram Ramanathan, Venugopal Manghat, Praveen Ayathan, Mayank Chaturvedi — CONFIRM before creating FundManager nodes

### 1b. Infinity Hybrid Long-Short Fund (Kotak)
- [ ] AMC `"Kotak Mutual Fund"` does NOT exist → create it (new unique `amc_id`)
- [ ] Fund node: name `"Infinity Hybrid Long-Short Fund"`, new unique `fund_id`
- [ ] Rel `(Kotak)-[:MANAGES]->(Infinity)`
- [ ] Rel `(Infinity)-[:BELONGS_TO]->(Category {category_id:4})`
- [ ] Props from HTML: benchmark `NIFTY 50 Hybrid Composite Debt 50:50`, exit_load `Nil`, plans `['Regular','Direct']`, options `['Growth','IDCW']`, taxation (per HTML), inception_date — NFO 15–29-Jun-26 (allotment date TBD)
- [ ] Managers (HTML §Q): Kalpesh Jain, Abhishek Bisen, Hiten Shah

---

## TASK 2 — Backfill empty properties on existing nodes (values from HTML)

### 2a. Missing `inception_date`
- [ ] Arthaya Equity Long Short Fund → 2026-05-18 (allotment 19-May-26) — CONFIRM
- [ ] WSIF Equity Long-Short Fund → 2026-05-11
- [ ] iSIF Equity Long-Short Fund → 2026-05-19
- [ ] Altiva Equity Ex-Top 100 Long-Short Fund → 2026-06-15
- [ ] WSIF Equity Ex-Top 100 Long-Short Fund → 2026-05-11
- [ ] qsif Sector Rotation Long-Short Fund → 2026-05-18
- [ ] Platinum Hybrid Long-Short Fund → 2026-06-11 (re-opened)
- [ ] DynaSIF Active Asset Allocator Long-Short Fund → 2026-03-30 (CONFIRM vs 23-Apr)
- [ ] iSIF Active Asset Allocator Long-Short Fund → 2026-05-11
- [ ] qsif Active Asset Allocator Long-Short Fund → 2026-04-23/24 (CONFIRM)

### 2b. Missing `benchmark`
- [ ] Arthaya Equity L-S → Nifty 200 TRI
- [ ] WSIF Equity L-S → (HTML: not explicit — CONFIRM, likely Nifty 500 TRI)
- [ ] Altiva Ex-Top 100 → Nifty 500 TRI
- [ ] WSIF Ex-Top 100 → (CONFIRM)
- [ ] qsif Sector Rotation → Nifty 500 TRI
- [ ] Platinum Hybrid → NIFTY 50 Hybrid Composite Debt 50:50
- [ ] iSIF AAA → 50% Nifty 500 TRI + 40% Nifty Composite Debt + 7% Gold + 3% Silver
- [ ] DynaSIF AAA → 25% BSE SENSEX TRI + 60% CRISIL Short Term Bond Fund + 15% iCOMDEX Composite
- [ ] qSIF AAA → NSE 500 TRI + CRISIL Short Term Bond Fund + iCOMDEX Composite (composite)

### 2c. Missing `exit_load`
- [ ] Arthaya → 1% if redeemed within 12 months, Nil thereafter
- [ ] iSIF Equity L-S → 1% within 12 months, Nil thereafter
- [ ] WSIF Equity L-S → CONFIRM
- [ ] Altiva Ex-Top 100 → 0.50% on/before 90 days, Nil thereafter
- [ ] WSIF Ex-Top 100 → CONFIRM
- [ ] qsif Sector Rotation → 1% if redeemed within 15 days, Nil thereafter
- [ ] Platinum Hybrid → 1% within 90 days, Nil thereafter
- [ ] iSIF AAA → 1% within 12 months, Nil thereafter
- [ ] DynaSIF AAA → 0.5% within 3 months, Nil thereafter
- [ ] qSIF AAA → 1% within 15 days, Nil thereafter

### 2d. Missing `MANAGED_BY` relationships (managers per HTML §Q)
Reuse existing FundManager nodes where the name already exists (constraint on name).
- [ ] Titanium Equity L-S — Tata SIF team (unnamed → skip or note)
- [ ] Arthaya Equity L-S — Rajesh Aynor, Hiten Bhadra
- [ ] iSIF Equity L-S — Mittul Kalawadia, Nitya Mishra, Sri Sharma
- [ ] Altiva Ex-Top 100 — Trideep Bhattacharya, Nikhil Gada, Amit Vora
- [ ] qsif Sector Rotation — Sandeep Tandon, Sameer Kate, Jignesh Shah, Ankit Pande, Sanjeev Sharma
- [ ] Apex Hybrid — Lovelish Solanki, Mohit Sharma
- [ ] Titanium Hybrid — Amit Somani, Suraj Nanda, Hasmukh Vishariya
- [ ] iSIF Hybrid — Rajat Chandak, Ayush Shah, Manish Banthia, Akhil Kakkar
- [ ] Platinum Hybrid — Gaurik Shah
- [ ] Altiva Hybrid — currently only Dhawal Dalal; add Bharat Lahoti, Bhavesh Jain, Kedar Karnik, Amit Vora
- [ ] iSIF AAA — Ihab Dalwai, Sharmila D'silva, Masoomi Jhurmarwala, Manish Banthia, Akhil Kakkar, Gaurav Chikne
- [ ] DynaSIF AAA — Harsh Agarwal, Milan Mody, Rahul Khetawat
- [ ] qSIF AAA — Sandeep Tandon, Sanjeev Sharma, Jignesh Shah, Sameer Kate, Ankit Pande

---

## OPEN QUESTIONS / DECISIONS
- [ ] `amc_id` values for HSBC & Kotak — need next-free ids (probe was interrupted)
- [ ] `fund_id` scheme for the 2 new funds — confirm pattern (`<amcPrefix>04`)
- [ ] taxation strings for RedHex/Infinity — HTML taxnote gives hybrid treatment; confirm exact string style
- [ ] Whether to add AUM/NAV/expense/returns to schema (currently OUT — JSON/client only)
- [ ] Should `data/funds.json` desc counts be updated too (6→8 equity, 7→10 hybrid)? Separate from graph.

## EXECUTION PLAN
1. Finish AMC `amc_id` probe → pick ids for HSBC, Kotak.
2. Write `add_missing.cypher` (idempotent MERGE) covering Task 1 + Task 2.
3. Review file together.
4. Run against DB, then re-dump to verify.
