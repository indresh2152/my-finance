---
name: compliance
description: Quick reference for PCI DSS, RBI, DPDP, CERT-In, SOC 2 and SEBI/IRDAI requirements
---

**Trigger:** User asks about compliance, regulations, PCI, SOC 2, RBI, DPDP, or data residency.

Full detail is in `docs/design/compliance.md`. Quick reference:

| Framework | What it demands |
|---|---|
| PCI DSS v4.0 | Card data hashed; TLS enforced; audit logs every CARD_VIEW; VAPT before launch |
| RBI DPSC 2021 | MFA for sensitive ops; VAPT by CERT-In auditor; fraud rate limiting |
| RBI Data Localisation | PostgreSQL **must** run in India only (e.g., AWS ap-south-1) |
| DPDP Act 2023 | Consent at signup; right-to-erasure endpoint; 72-hr breach notification |
| CERT-In 2022 | Report incidents in 6 hrs; keep logs 180 days in India; NTP sync |
| SOC 2 Type II | Formalise policies; SIEM; DR runbook; annual pen test |
| ISO 27001 | Key rotation schedule; RBAC review; data classification |
| SEBI / IRDAI | Folio & policy numbers masked; data only to verified owner |
| OWASP ASVS L2 | Full checklist in compliance.md Section 10 |
