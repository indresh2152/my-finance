# UI Wireframes (ASCII)

All monetary values use Indian number formatting: ₹5,00,000 (not ₹500,000).

---

## First Login — PAN Registration Gate

When a user logs in for the first time (or has no PAN registered), all financial data endpoints return `403 PAN_NOT_REGISTERED`. The app intercepts this and redirects to a PAN registration prompt. This screen replaces the Overview until PAN is registered.

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  🔗  Link your PAN to get started                        │  │
│  │                                                          │  │
│  │  Your Permanent Account Number (PAN) links all your      │  │
│  │  financial instruments — credit cards, loans,            │  │
│  │  investments, and insurance policies.                    │  │
│  │                                                          │  │
│  │  PAN Number                                              │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  e.g. ABCDE1234F                                   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ⚠ Your PAN is never stored — only a cryptographic hash. │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │              Link My PAN                           │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Routing behaviour:**
- `hasPan: false` in the login response → redirect to this screen
- `GET /overview` (or any financial endpoint) returning `403 PAN_NOT_REGISTERED` → same redirect
- After successful `POST /pan/register` → redirect to `/` (Overview)
- Navigation tabs are visible but clicking any financial section redirects back here until PAN is registered

---

## Login Page (`/login`)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    my-finance                               │
│             Your finances, all in one place                 │
│                                                             │
│              ┌──────────────────────────────┐              │
│              │   Username                   │              │
│              │   ┌──────────────────────┐   │              │
│              │   │                      │   │              │
│              │   └──────────────────────┘   │              │
│              │                              │              │
│              │   Password                   │              │
│              │   ┌──────────────────────┐   │              │
│              │   │  ••••••••••          │   │              │
│              │   └──────────────────────┘   │              │
│              │                              │              │
│              │   ┌──────────────────────┐   │              │
│              │   │       Sign In        │   │              │
│              │   └──────────────────────┘   │              │
│              │                              │              │
│              │   [!] Invalid credentials    │ ← error state│
│              └──────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## Overview / Dashboard (`/`)

> **Built (2026-10-05) — dashboard plus profile.** The UI has two pages: this dashboard
> and `/profile`. A user who skipped PAN registration sees only the title and a "Link PAN" prompt;
> nothing else is loaded. The dashboard shows credit cards only (bank accounts are out of scope:
> bank emails carry their details only in password-protected PDFs). Emails are linked on `/profile` (the empty-state hints say so); the dashboard has no Link email. **Refresh**
> (shown once an email is linked) syncs every linked email that can sync now, skipping ones that
> need a reconnect or are in the 5-minute cooldown; a refresh error shows above the cards. The
> 👁 beside the title shows or hides every masked amount on the cards at once;
> amounts start hidden, and each one's own eye still toggles it alone. The header does not show
> the PAN, not even masked.
>
> Each card tile shows a **card face** drawn like the physical card (ID-1 proportions): the bank's
> name top left and the card's own name top right, a drawn EMV chip and contactless mark, the
> masked number, name on card and expiry, and the network mark (VISA / Mastercard circles / RuPay /
> AMEX / Diners) bottom right. Colours come from `components/cards/cardBrands.ts`: a product's own
> design when its bank and card name match (HDFC Pixel, ICICI Coral and Amazon Pay, Federal Scapia
> and OneCard, Axis Flipkart, Kotak Zen), else the bank's gradient, else neutral slate. Marks are
> drawn with CSS/SVG, not official logo files. The status chip sits under the face, then amounts
> and the latest statement.
> `(J)` is the user's initial in a circle; it opens a menu with the username and email,
> **Profile** (goes to `/profile`) and **Sign out**. The snapshot and tile layout further down is
> the original vision.
>
> ```
> ┌─────────────────────────────────────────────────────────────────┐
> │  MyFinance                                    [API Docs] (J)    │
> ├─────────────────────────────────────────────────────────────────┤
> │  Dashboard 👁                                       [⟳ Refresh] │
> │  ("Gathering your card details…" while syncing)                 │
> │                                                                 │
> │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
> │  │ card face    │ │ card face    │ │ card face    │             │
> │  └──────────────┘ └──────────────┘ └──────────────┘             │
> └─────────────────────────────────────────────────────────────────┘
> ```

The home screen shows a net-worth snapshot and navigation tiles to all financial sections.

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├──────────────────────────────────────────────────────────────── ┤
│  [Overview] [Cards] [Loans] [Investments] [Insurance]           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Good morning, Indresh                  PAN: ABCDE####F  [✓]   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Financial Snapshot                      │  │
│  │  Net Worth (Assets - Liabilities)      ₹ XX,XX,XXX      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────────────┐                                        │
│  │  Credit Cards      │                                        │
│  │  3 cards           │                                        │
│  │  Limit  ₹10,00,000 │                                        │
│  │  Used   ₹1,67,000  │                                        │
│  │        [View All →]│                                        │
│  └────────────────────┘                                        │
│                                                                 │
│  ┌────────────────────┐   ┌────────────────────┐              │
│  │  Loans             │   │  Investments       │              │
│  │  1 active loan     │   │  5 instruments     │              │
│  │  Outstanding       │   │  Current Value     │              │
│  │  ₹42,00,000        │   │  ₹12,50,000        │              │
│  │  EMI ₹45,000/mo    │   │  Invested ₹9,00,000│              │
│  │        [View All →]│   │       [View All →] │              │
│  └────────────────────┘   └────────────────────┘              │
│                                                                 │
│  ┌────────────────────┐                                        │
│  │  Insurance         │                                        │
│  │  2 active policies │                                        │
│  │  Cover ₹35,00,000  │                                        │
│  │  Next due: 1 Jan   │                                        │
│  │        [View All →]│                                        │
│  └────────────────────┘                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Credit Cards Page (`/credit-cards`)

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Cards ●] [Loans] [Investments] [Insurance]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Credit Cards  (PAN: ABCDE####F)                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████ VISA                   │   │
│  │  HDFC Bank Infinia                                      │   │
│  │  •••• •••• •••• 1234                                    │   │
│  │  INDRESH RATHORE                        Exp 12/28       │   │
│  │                                                         │   │
│  │  Limit ₹5,00,000   Available ₹4,23,000   Used ₹77,000  │   │
│  │  [████████████░░░░░░░░░░░░░]  15.4% used               │   │
│  │                                                         │   │
│  │  Billing date: 15th        ● ACTIVE   [View Details →]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████ MASTERCARD             │   │
│  │  Axis Bank Magnus                                       │   │
│  │  •••• •••• •••• 5678                                    │   │
│  │  INDRESH RATHORE                        Exp 09/27       │   │
│  │                                                         │   │
│  │  Limit ₹3,00,000   Available ₹2,10,000   Used ₹90,000  │   │
│  │  [████████████████░░░░░░░░░]  30.0% used               │   │
│  │                                                         │   │
│  │  Billing date: 5th         ● ACTIVE   [View Details →]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████ AMEX                   │   │
│  │  AMEX Platinum Charge                                   │   │
│  │  •••• ••••••• 9012                                      │   │
│  │  INDRESH RATHORE                        Exp 03/26       │   │
│  │                                                         │   │
│  │                                 ○ BLOCKED               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Card found in email — latest statement

Email-derived cards show only what the bank email revealed, plus the card's latest statement.
Amounts are masked until the eye icon is pressed (the real value is not in the page while
hidden). ⓘ shows the bank's statement-password hint on hover. **Download statement** fetches
the PDF from the mailbox and is hidden when the email had no PDF or mailbox features are off.

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│  HDFC                  ● ACTIVE  │   │  AXIS                  ● ACTIVE  │
│  •••• 1234                       │   │  •••• 5678                       │
│                                  │   │                                  │
│  Amount due       ₹ •••••• [👁]  │   │  No statement found yet          │
│  Minimum due      ₹ •••••• [👁]  │   │                                  │
│  Due by              25 Sep 2026 │   └──────────────────────────────────┘
│  Statement date      05 Sep 2026 │
│  [⤓ Download statement]  [ⓘ]    │
└──────────────────────────────────┘
```

---

## Card Detail — Slide-over / Modal

```
┌──────────────────────────────────────────────────────────┐
│  HDFC Bank Infinia                          [✕ Close]    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  HDFC BANK                              VISA       │  │
│  │                                                    │  │
│  │  •••• •••• •••• 1234                               │  │
│  │                                                    │  │
│  │  INDRESH RATHORE                       12/28       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────┬─────────────────────────────┐  │
│  │  Credit Limit        │  ₹5,00,000                  │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Available Credit    │  ₹4,23,000                  │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Current Balance     │  ₹77,000                    │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Billing Cycle Day   │  15th of every month        │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Card Status         │  ● ACTIVE                   │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Issuing Bank        │  HDFC Bank                  │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Card Network        │  VISA                       │  │
│  ├──────────────────────┼─────────────────────────────┤  │
│  │  Card Variant        │  Infinite                   │  │
│  └──────────────────────┴─────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Loans Page (`/loans`)

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Cards] [Loans ●] [Investments] [Insurance]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Loans  (PAN: ABCDE####F)                                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SBI Home Loan                                HOME LOAN  │   │
│  │  Account ending ••••9900                                │   │
│  │                                                         │   │
│  │  Principal:    ₹50,00,000    Outstanding:  ₹42,00,000   │   │
│  │  EMI:          ₹45,000/mo    Due day:      5th          │   │
│  │  Interest:     8.50% p.a.    Matures:      Jun 2041     │   │
│  │                                                         │   │
│  │  [████████████████░░░░░░░░░░░]  16% repaid   ● ACTIVE   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Investments Page (`/investments`)

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Cards] [Loans] [Investments ●] [Insurance]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Investments  (PAN: ABCDE####F)           Total: ₹12,50,000    │
│                                                                 │
│  Filter: [All ●] [Mutual Funds] [Stocks] [PPF/NPS] [Others]    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MUTUAL FUND                         Mirae Asset AMC    │   │
│  │  Mirae Asset Large Cap Fund - Direct Growth             │   │
│  │  Folio: FOL12345   Units: 1,523.456                     │   │
│  │  Invested: ₹60,000     Current: ₹85,000  (+41.7%)       │   │
│  │                                         as of 05 Jun    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PPF                                              SBI   │   │
│  │  Public Provident Fund                                  │   │
│  │  Invested: ₹4,00,000    Current: ₹4,50,000  (+12.5%)    │   │
│  │                                         as of 31 Mar    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Insurance Page (`/insurance`)

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Cards] [Loans] [Investments] [Insurance ●]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Insurance Policies  (PAN: ABCDE####F)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LIFE INSURANCE                        LIC of India     │   │
│  │  Jeevan Anand                                           │   │
│  │  Policy: LIC****9012          ● ACTIVE                  │   │
│  │  Sum Assured:  ₹25,00,000    Premium: ₹35,000/yr        │   │
│  │  Next Due:     1 Jan 2027     Matures: 1 Jan 2040       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HEALTH INSURANCE              Star Health Insurance    │   │
│  │  Comprehensive Health Plan                              │   │
│  │  Policy: STAR****5678         ● ACTIVE                  │   │
│  │  Sum Assured:  ₹10,00,000    Premium: ₹18,000/yr        │   │
│  │  Next Due:     15 Nov 2026                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Profile Page (`/profile`)

> **Built (2026-10-05).** Reached from **Profile** in the account menu. Shows the username and
> email (never the PAN), then the linked emails: mailbox notices (the OAuth callback lands here
> with `?linked=1` / `?error=<CODE>`), the sync-progress banner, **+ Link email** (opens the Link a
> mailbox dialog), and the linked-mailboxes list with Refresh, Unlink and Reconnect. Without a PAN
> the linked-emails part is replaced by a "Link PAN" prompt, because mailboxes belong to a PAN
> profile. The mockup below is the original vision.
>
> ```
> ┌─────────────────────────────────────────────────────────────────┐
> │  MyFinance                                    [API Docs] (J)    │
> ├─────────────────────────────────────────────────────────────────┤
> │  Profile                                                        │
> │  ┌───────────────────────────────────────────────────────────┐  │
> │  │ Username  johndoe                                         │  │
> │  │ Email     john@example.com                                │  │
> │  └───────────────────────────────────────────────────────────┘  │
> │  [+ Link email]                                                 │
> │  Linked mailboxes                                               │
> │  us****@gmail.com · Google · Last synced …  [Refresh] [Unlink]  │
> └─────────────────────────────────────────────────────────────────┘
> ```

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  My Profile                                                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Name       Indresh Rathore                              │  │
│  │  Email      indresh@example.com                          │  │
│  │  Username   indresh                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Permanent Account Number (PAN)                                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ABCDE####F    [✓ Verified — 15 Jan 2025]                │  │
│  │                                                          │  │
│  │  Your PAN links all your financial instruments:          │  │
│  │  3 cards · 1 loan ·                                      │  │
│  │  5 investments · 2 insurance policies                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Change Password]                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mobile Responsive Notes

- Top nav collapses to a bottom tab bar (Overview, Cards, Bank, More)
- "More" tab expands to Loans, Investments, Insurance, Profile
- Card and instrument rows become full-width stacked list items
- Card detail and instrument detail open as bottom sheets (not modals)
- Financial overview tiles become horizontal scroll strip on small screens
- Minimum touch target: 44×44px on all interactive elements
- Indian number formatting (`en-IN` locale) preserved at all screen sizes
