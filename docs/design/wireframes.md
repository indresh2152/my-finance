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
│  │  financial instruments — credit cards, bank accounts,    │  │
│  │  loans, investments, and insurance policies.             │  │
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

The home screen shows a net-worth snapshot and navigation tiles to all financial sections.

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├──────────────────────────────────────────────────────────────── ┤
│  [Overview] [Cards] [Bank] [Loans] [Investments] [Insurance]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Good morning, Indresh                  PAN: ABCDE####F  [✓]   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Financial Snapshot                      │  │
│  │  Net Worth (Assets - Liabilities)      ₹ XX,XX,XXX      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────────────┐   ┌────────────────────┐              │
│  │  Credit Cards      │   │  Bank Accounts     │              │
│  │  3 cards           │   │  2 accounts        │              │
│  │  Limit  ₹10,00,000 │   │  Balance ₹8,50,000 │              │
│  │  Used   ₹1,67,000  │   │                    │              │
│  │        [View All →]│   │       [View All →] │              │
│  └────────────────────┘   └────────────────────┘              │
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
│  [Overview] [Cards ●] [Bank] [Loans] [Investments] [Insurance]  │
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

## Bank Accounts Page (`/bank-accounts`)

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Cards] [Bank ●] [Loans] [Investments] [Insurance]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Bank Accounts  (PAN: ABCDE####F)                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HDFC Bank                                     SAVINGS  │   │
│  │  Account ending ••••5678           ● ACTIVE             │   │
│  │  Balance:  ₹4,50,000                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SBI                                                FD  │   │
│  │  Account ending ••••0012           ● ACTIVE             │   │
│  │  Amount:  ₹4,00,000    Rate: 7.25% p.a.                 │   │
│  │  Matures: 31 Mar 2026                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Loans Page (`/loans`)

```
┌─────────────────────────────────────────────────────────────────┐
│  my-finance                              [Indresh ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Cards] [Bank] [Loans ●] [Investments] [Insurance]  │
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
│  [Overview] [Cards] [Bank] [Loans] [Investments ●] [Insurance]  │
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
│  [Overview] [Cards] [Bank] [Loans] [Investments] [Insurance ●]  │
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
│  │  3 cards · 2 bank accounts · 1 loan ·                   │  │
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
- Cards and account rows become full-width stacked list items
- Card detail and instrument detail open as bottom sheets (not modals)
- Financial overview tiles become horizontal scroll strip on small screens
- Minimum touch target: 44×44px on all interactive elements
- Indian number formatting (`en-IN` locale) preserved at all screen sizes
