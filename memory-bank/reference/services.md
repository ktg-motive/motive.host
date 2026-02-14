# Service Accounts & Configuration Reference

> Quick lookup for credentials, endpoints, and account details. No secrets stored here — only identifiers and connection info.

## xCloud White Label

| Field | Value |
|---|---|
| Plan | Startup ($25/month) |
| Dashboard | host.motiveai.ai |
| Platform fee | 25% or $3 minimum per sale |
| Stripe Connect | MOTIVE DEVELOPMENT, INC. (kai@motiveai.ai) |

## Vultr

| Field | Value |
|---|---|
| Server name | mh-prod-atl-01 |
| Server IP | 155.138.192.127 |
| Plan | High Frequency ($12/month per client) |
| Web server | Nginx |
| Database | MySQL |

## SendGrid (xCloud SMTP)

| Field | Value |
|---|---|
| SMTP host | smtp.sendgrid.net |
| Port | 587 |
| Encryption | TLS |
| Username | apikey |
| Password | (dedicated API key, Mail Send scope only) |
| From address | noreply@motive.host |
| Domain auth | Verified ✅ (em7426.motive.host) |

## OpenSRS

| Field | Value |
|---|---|
| Purpose | Domain registration |
| Deposit | $95 prepaid balance |
| Domains managed | motive.host |
| DNS records | Full support: A, AAAA, CNAME, MX, SRV, TXT |

## Stripe

| Field | Value |
|---|---|
| Account | MOTIVE DEVELOPMENT, INC. |
| Email | kai@motiveai.ai |
| Connected via | xCloud White Label Stripe Connect |
| Processing | 2.9% + $0.30 + 0.25% Connect fee |

## DNS Records (motive.host) — Status

| Record | Type | Host | Value | Status |
|---|---|---|---|---|
| SPF | TXT | motive.host | `v=spf1 include:sendgrid.net ~all` | Added ✅ |
| DKIM 1 | CNAME | s1._domainkey.motive.host | `s1.domainkey.u25174194.wl195.sendgrid.net` | Added ✅ |
| DKIM 2 | CNAME | s2._domainkey.motive.host | `s2.domainkey.u25174194.wl195.sendgrid.net` | Added ✅ |
| Verify | CNAME | em7426.motive.host | `u25174194.wl195.sendgrid.net` | Added ✅ |
| Link 1 | CNAME | url8369.motive.host | `sendgrid.net` | Added ✅ |
| Link 2 | CNAME | 25174194.motive.host | `sendgrid.net` | Added ✅ |
| DMARC | TXT | _dmarc.motive.host | `v=DMARC1; p=none;` | Added ✅ |

## Legal Documents — Status

| Document | File | Status | Notes |
|---|---|---|---|
| Terms of Service | `site/terms.html` | Draft ✅ | 15 sections, plain English, inline AUP, needs attorney review |
| Privacy Policy | `site/privacy.html` | Draft ✅ | 16 sections, CCPA/CPRA baseline, needs attorney review |
| Acceptable Use Policy | Inline in ToS | Draft ✅ | Standalone version not yet created |
| Data Processing Agreement | Not started | Needed for EU/regulated clients |
| Cookie Policy | Not started | Minimal cookies currently, low priority |
| DMCA Policy | Inline in ToS | Draft ✅ | Standalone page + Copyright Office registration needed |
| SLA | Inline in ToS | Draft ✅ | Standalone version deferred until operational history builds |

### Key Legal Terms Quick Reference

| Term | Value |
|---|---|
| Contracting entity | Motive AI, LLC (subject to entity decision) |
| Governing law | State of Alabama |
| Venue | Baldwin County, Alabama |
| Dispute resolution | Binding arbitration (AAA) |
| Liability cap | Fees paid in prior 12 months |
| Termination notice | 30 days (client), 60 days (Motive without cause) |
| Data retention post-termination | 30 days |
| Uptime target | 99.9% (commercially reasonable efforts) |
| Price change notice | 30 days |
| ToS change notice | 30 days |
