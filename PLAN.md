# SpendSnap — App Plan

> Living document. We update this as we plan. Nothing here is final until marked ✅.

## Vision

A dead-simple **daily spending tracker**. Every time money is spent, log it in
the fewest possible taps: **amount + category**. The core question the app
answers is *"how much did I spend today / per day?"*

Inspired by DollarWise, but far more focused.

## Core Principles

- **Speed of entry above all.** Open → tap amount → tap category → done.
- **Minimal data per transaction:** amount + category (+ date = today, implicit).
- **Personal, single-user** (just the owner).
- **Android first**, iOS later.

## Categories (fixed)

1. Food
2. Groceries
3. Dogs
4. Miscellaneous

## Currency

- **All amounts are Thai Baht (THB, ฿).** No multi-currency. Display with ฿
  symbol; store as a plain number.
- **Decimals allowed** (satang), but usage is primarily whole numbers — keep the
  decimal key but optimize the flow for whole-baht speed.

## Data Model

A transaction is:
- `amount` (number)
- `category` (Food | Groceries | Dogs | Miscellaneous)
- `date` (defaults to today)

Stored on the VM (SQLite), and **pushed to Google Sheets on demand via a manual
Push button**.

## Backend Responsibilities

- Store transactions locally on the VM (SQLite).
- Push data to the user's **Google Sheets** tracking document — **on demand
  via a Push button** (not automatic; user taps to sync).
  - The Sheet is the **primary/master record**, already set up to compute total
    spent for the year and per-month totals.
  - Layout (current): one main page where **each column is a month** with basic
    expenses + summaries. User is adding a **subtab per individual month** (their
    agent will set this up). Exact push-target layout = **deferred** until subtabs
    exist.
  - Row format: **TBD** (settle once subtabs are in place).
  - Auth: **app-managed OAuth flow** (the approach the user used on prior apps).
    - Google Cloud OAuth client (client ID + secret), Sheets API enabled.
    - One-time "Connect Google" consent screen in the app.
    - App stores the **refresh token** on the VM (SQLite) and mints/refreshes
      access tokens automatically for API calls.
    - Scope: `https://www.googleapis.com/auth/spreadsheets`.
    - Client ID/secret kept out of git (env/config file, gitignored).
    - OAuth **redirect URI** = app's proxy URL, e.g.
      `https://budget-app.exe.xyz/oauth/callback`.
    - User adds their email as a **test user** on the OAuth consent screen.
    - Deferred until app core is built + subtabs exist.

## Setup Tasks (infra)

- [ ] Attach a Google (Sheets API) integration to **this** VM (budget-app).
      User already did this for other VMs. Need the integration name / how the
      token is surfaced (likely an http-proxy injecting an OAuth bearer for
      googleapis.com, reachable at `http://<name>.int.exe.xyz/`).
- [ ] Identify the target Google Sheet (ID / URL) and its tab/column layout so
      pushes land in the right place.

## Platform / Delivery

- **Android first.** Current codebase is a PWA (installable to home screen).
- iOS later.
- Staying PWA for now (image auto-pull deferred, so no native app needed yet).

## Budgets

- **Food is the primary tracked category**, with a **fixed daily budget**
  (e.g. ฿1,000/day).
- Budgeting concept: compare **target vs. actual**.
  - **Daily (entry page):** daily food budget (target) vs. food spent today
    (actual) → under/over for the day.
  - **Monthly (monthly page):** month food budget (= daily × days) vs. actual
    spent so far, plus **pace/trajectory**. Example: ฿1,000/day; by day 10 the
    expected spend is ฿10,000; if actual is ฿11,500 you're ฿1,500 over pace.
  - Show three numbers: **target budget · actual spending · difference
    (over/under)**.
- **Daily food budget = ฿1,000/day** (current value).
- **Monthly food target = (days in that month) × daily budget** → e.g. ฿31,000
  for a 31-day month, ฿30,000 for 30 days, ฿28,000 for Feb, etc.
- The daily budget is **editable** and may **change over time / per month**
  (e.g. raise / new job increases it). Store it as configurable data, not a
  hardcoded constant.
- **The budget is APP-DISPLAY ONLY.** It is *never* written to Google Sheets and
  must not affect the Sheet. It exists purely as a visual reminder ("where am I
  at" — under/over today, on/off pace for the month). The Sheet only ever
  receives **actual spending / transactions**, never the budget target.
- **All four categories have budget targets** (not just Food). The **budget page**
  shows each category's **target vs. current spending**. Food is still the
  primary focus (has the daily-pace emphasis).
- **Food = DAILY budget** (฿1,000/day). **Groceries, Dogs, Miscellaneous =
  MONTHLY budgets.** Amounts for the three monthly ones TBD (added later; start
  editable/placeholder).
- On the **entry page**, keep a small **food reminder**: today's food spent vs.
  daily target (e.g. “฿320 of ฿1,000 today”). Trial feature — testing whether
  it's useful.

## Pages

1. **Entry page (primary):** amount numpad + 4 category buttons, one-tap logging.
   Focused on fast spending entry. Includes a small **food reminder** — today's
   food spent vs. daily target (trial feature to see if it's useful).
2. **Budget / overview page:** shows **all four categories** with, for each:
   **goal/target budget vs. current spending amount**. Includes food's
   pace/trajectory for the month. (The Google Sheet remains the deep source of
   truth for yearly + monthly analysis; this page is a quick in-app look.)

## Deferred: PromptPay Image Auto-Ingest

**Deferred for now** — not in scope for v1. (Notes kept for later.)

In Thailand, PromptPay saves a receipt image per purchase. Idea: OCR the amount
from these images. Category still needs manual tagging. A PWA can at best be an
Android share-target (semi-auto); hands-free needs a native app.

## Open Questions

1. **Sheet push format** — deferred until per-month subtabs are created. Then
   decide: append transaction rows vs. write day/category totals.
2. **In-app monthly page:** how much detail vs. just deferring to the Sheet?
3. **Google auth** — chosen: app-managed OAuth. Need a Google Cloud OAuth client
   (client ID/secret) + one-time consent. Deferred until app is built.
4. ~~Budget scope~~ — resolved: all four have budgets. Food=daily (฿1,000),
   Groceries/Dogs/Misc=monthly. Non-food amounts TBD (set later in app).
5. ~~Budget config~~ — resolved: **single editable current value** per category
   (applies everywhere, no effective-dating in v1). Food daily = ฿1,000;
   non-food monthly amounts TBD (set later in app).
6. ~~฿40,000/month figure~~ — resolved: was just an illustrative example, not a
   real number. Actual budget amount TBD (config).

## v1 Scope (locked)

**Entry page (primary):**
- Amount display in ฿ + numpad (0–9, decimal, delete). Decimals allowed but flow
  optimized for whole baht.
- Four category buttons in a **2×2 grid**, each with a **distinct color** for
  muscle memory (Food, Groceries, Dogs, Miscellaneous).
- **Log = type amount → tap category.** Saves instantly, shows a brief
  **“Saved ฿120 · Food”** toast, resets amount to 0.
- Small **food reminder**: today's food spent vs. daily target (“฿320 of
  ฿1,000 today”). Trial feature.
- No notes, no date picker (date = today). No undo in v1.

**Budget / overview page:**
- All four categories, each showing **target vs. current spending**.
  - Food: **daily** target (฿1,000) + monthly pace/trajectory.
  - Groceries / Dogs / Misc: **monthly** targets (amounts set later).
- Editable budget values (single current value each; no effective-dating).
- Budgets are **app-display only** — never written to the Sheet.

**Storage & sync:**
- SQLite on the VM stores all transactions.
- **Manual “Push” button** syncs actual spending to Google Sheets (app-managed
  OAuth, one-time “Connect Google”). Sheet format finalized once per-month
  subtabs exist. Deferred but part of v1 goal.

**Platform:** PWA, Android first.

**Deferred (not v1):** PromptPay image OCR, undo/edit, effective-dated budgets,
iOS-specific polish, “this week” readout.

## Decision Log

- ✅ **Categories:** Food, Groceries, Dogs, Miscellaneous (four).
- ✅ **Transaction data:** amount + category + date(=today).
- ✅ **Master record:** Google Sheets (already set up for yearly/monthly totals).
- ✅ **Local store:** SQLite on the VM (mirror / buffer).
- ✅ **PromptPay image auto-pull:** deferred, not in v1.
- ✅ **Platform:** PWA, Android first, iOS later.
- ✅ **Pages:** entry page (primary, fast entry) + budget/overview page
  (all four categories: target vs. current spending).
- ✅ **Budget scope:** all four have targets. **Food = daily (฿1,000)**;
  **Groceries/Dogs/Misc = monthly** (amounts set later).
- ✅ **Entry page food reminder** kept (trial): today's food vs. daily target.
- ✅ **Budget editing:** single editable current value per category (no
  effective-dating in v1).
- ✅ **Category buttons:** 2×2 grid, distinct color per category.
- ✅ **Post-log feedback:** “Saved ฿120 · Food” toast + reset amount to 0.
- ✅ **Budgets:** Food has a fixed **daily budget** (currently ฿1,000/day);
  monthly target = days-in-month × daily. Track target vs. actual daily, and
  monthly budget vs. actual vs. pace on the monthly page.
- ✅ **Budget is editable** (changes over time), stored as config not a
  hardcoded constant.
- ✅ **Budget is app-display only** — never pushed to Google Sheets; Sheet gets
  actual spending only.
- ✅ **Currency:** Thai Baht (THB, ฿) only.
- ✅ **Sheet push:** manual, via a **Push button** (not auto/daily).
- ⏸️ **Sheet layout/format:** deferred until per-month subtabs exist. Build the
  app first.
- ✅ **Decimals:** allowed (satang) but flow optimized for whole baht.
- ✅ **Undo/edit:** not in v1; add later if it becomes a pain point.
- ✅ **"This week" readout:** scrapped.
- ✅ **Google auth:** app-managed OAuth flow (client ID/secret + one-time
  consent, app stores refresh token). Matches how the user's prior apps work.
  Setup = deferred.
