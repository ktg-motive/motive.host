# Motive Hosting — Stable Context

> Last updated: February 14, 2026 (Session 3)

## Project Overview

Motive Hosting is a white-label managed hosting service operated by Motive AI. It targets small and mid-sized businesses in the Gulf Coast region who are currently overpaying ($300–400/month) for basic hosting that includes little more than website hosting, email, and maybe newsletter capabilities. The service runs on xCloud's White Label reseller platform with Vultr as the VPS provider.

The business is positioned as a natural entry point into Motive AI's broader services. Clients who start with hosting may later adopt AI readiness assessments and consulting.

---

## Domains & URLs

| Purpose | Domain | Notes |
|---|---|---|
| Marketing site | motive.host | Public-facing landing page, pricing, sales. Registered via OpenSRS. |
| Client portal | host.motiveai.ai | xCloud White Label dashboard. Clients log in here. |
| Motive AI | www.motiveai.ai | Parent company site |
| Motive ESG | www.esgmotive.com | ESG advisory arm |

The marketing site and client portal are intentionally separated. motive.host handles all marketing/sales. host.motiveai.ai goes straight to login/dashboard. The xCloud built-in landing page is **disabled**.

---

## Technical Stack

### Hosting Platform

| Component | Service | Details |
|---|---|---|
| Reseller panel | xCloud White Label | $25/month Startup plan |
| Hosting model | Self-managed VPS | Not xCloud Managed servers |
| VPS provider | Vultr High Frequency | $12/month per client instance |
| Production server | mh-prod-atl-01 | IP: 155.138.192.127, Nginx, MySQL |
| Supported platforms | WordPress, Node.js/React | Static sites also supported |

### Billing & Payments

| Component | Service | Details |
|---|---|---|
| Payment processing | Stripe Connect | Connected under MOTIVE DEVELOPMENT, INC. (kai@motiveai.ai) |
| xCloud platform fee | 25% of sale | Or $3 minimum, whichever is higher |
| Stripe processing | 2.9% + $0.30 | Per transaction |
| Stripe Connect platform | 0.25% | Additional per transaction |

### Email & Newsletter

| Component | Service | Details |
|---|---|---|
| Transactional email | SendGrid | SMTP for xCloud portal emails |
| Newsletter platform | Learning Editor | Kai's existing platform, bundled with Gulf+ tiers |
| SendGrid backend | Shared | Powers both Learning Editor and xCloud SMTP |
| SMTP host | smtp.sendgrid.net | Port 587, TLS, username: "apikey" |
| Send-from domain | motive.host | All hosting-related transactional email |

### Domain Registration

| Component | Service | Details |
|---|---|---|
| Registrar | OpenSRS | $95 prepaid deposit account |
| DNS limitation | No CNAME support | OpenSRS panel only supports A, AAAA, MX, TXT, Forward |
| Implication | Cloudflare migration needed | Required for DKIM CNAMEs and general flexibility |

---

## DNS Configuration (motive.host)

### Required Records

**SPF** — TXT record on root `motive.host`:
```
v=spf1 include:sendgrid.net ~all
```

**DKIM** — Three CNAME records from SendGrid domain authentication:
```
s1._domainkey.motive.host → (values from SendGrid UI)
s2._domainkey.motive.host → (values from SendGrid UI)
em####.motive.host → (values from SendGrid UI)
```
Must run SendGrid domain authentication for motive.host to get exact values. Requires Cloudflare (or other CNAME-capable DNS) since OpenSRS doesn't support CNAMEs.

**DMARC** — TXT record on `_dmarc.motive.host`:
```
v=DMARC1; p=none; rua=mailto:dmarc@motive.host
```
Start with p=none to monitor. Tighten to p=quarantine or p=reject once delivery is confirmed.

### DNS Migration Path
1. Add motive.host as a site in Cloudflare (free plan)
2. Cloudflare provides two nameservers
3. Swap nameservers at OpenSRS from defaults to Cloudflare
4. Wait for propagation (~1 hour)
5. Add all DNS records in Cloudflare going forward

---

## Branding

### Identity
- **Brand name:** Motive Hosting
- **Sub-brand of:** Motive AI
- **Positioning:** Premier managed hosting for Gulf Coast businesses. Luxury, white-glove, technical authority. NOT a budget play.
- **Theme:** Dark, premium, technical confidence. Evolved from original "Sunset Harbor" nautical theme toward high-end consulting firm / infrastructure company aesthetic.
- **Logo (marketing site):** Geometric "flying M" chevrons in monochrome gold (#D4AF37) with horizon ripple lines. Used on dark backgrounds.
- **Logo (xCloud portal):** Original coral-to-navy gradient variant (still in use at host.motiveai.ai)
- **Logo created via:** Midjourney (horizon line variant), vectorized in Illustrator
- **Favicon:** Derived from the flying M logo mark
- **Navbar logo minimum:** 212x40 pixels (PNG, JPEG, or JPG, max 5MB per xCloud)

### Color Palette — Marketing Site (motive.host)

| Color | Hex | Usage |
|---|---|---|
| Deep Charcoal | #1F2329 | Primary backgrounds (hero, pricing, FAQ, footer) |
| Charcoal Alt | #272B31 | Alternate section backgrounds (value props, features, final CTA) |
| Card Offset | #23272E | Pricing cards, FAQ hover, nav offset |
| Card Surface | #2C3038 | Value prop cards, feature category cards |
| Gold | #D4AF37 | Primary CTAs, accents, "Popular" badge, logo |
| Cool Slate | #8892A0 | Secondary text, subtle borders, muted elements |
| Muted White | #E8ECF1 | Primary text on dark backgrounds |

### Color Palette — xCloud Portal (host.motiveai.ai) — Original Sunset Harbor

| Color | Hex | Usage |
|---|---|---|
| Navy | #1A2744 | Portal branding, backgrounds |
| Coral | #E8725A | Portal accent color |
| Amber Gold | #F0A830 | Highlights |
| Sky Blue | #5BA4CF | Links, info states |
| Warm White | #FAF8F5 | Light backgrounds |

### Typography — Marketing Site

| Font | Role | Weights |
|---|---|---|
| Playfair Display | Headings (serif, editorial luxury) | 600, 700 |
| Inter | Body text, UI | 400, 500, 600 |
| JetBrains Mono | Monospace accents (plan names, prices, labels, buttons, nav) | 500 |

### Design Language
- Full dark palette — no bright/light sections. Tonal shifts between charcoal shades create section rhythm.
- Gold used sparingly and precisely — CTAs, logo, badge, key accents.
- Monospace typography for technical authority cues.
- Subtle dot grid and fine-line grid patterns in dark section backgrounds.
- Pulsing gold status indicator ("SYSTEMS MONITORED 24/7") in hero.
- Spec-sheet style pricing cards with structured label/value rows.
- Sharp 4px border-radius (not rounded). Thin 1px precision borders.
- Subtle scroll-triggered fade-in animations. Respects prefers-reduced-motion.

---

## Hosting Plans

### Captain — $0/month (internal, unadvertised)
- **SKU:** mh-captain
- **Sites:** Unlimited (WordPress or Node.js/React)
- **Storage:** No caps
- **All features enabled**, full admin access
- Not creatable in xCloud at $0 due to $12 Vultr minimum. Kai uses admin access to deploy directly.

### Harbor — $99/month
- **SKU:** mh-harbor
- **Site limit:** 1 WordPress site
- **Storage:** 10 GB
- **Email:** 5 business email accounts
- **Backups:** Weekly (7-day retention)
- **Monitoring:** Uptime monitoring
- **Support:** Email / chat
- **Net revenue:** ~$58.83/month (59% margin)

### Gulf — $179/month
- **SKU:** mh-gulf
- **Site limit:** Up to 3 (WordPress or Node.js/React)
- **Storage:** 25 GB
- **Email:** 10 business email accounts
- **Backups:** Daily (30-day retention)
- **CDN:** Performance caching included
- **Newsletter:** Learning Editor — 1 list, up to 500 subscribers
- **Security:** Monthly updates & patching
- **Reporting:** Quarterly site health report
- **Support:** Email / chat
- **Net revenue:** ~$116.31/month (65% margin)

### Horizon — $249/month
- **SKU:** mh-horizon
- **Site limit:** Up to 5 (WordPress or Node.js/React)
- **Storage:** 50 GB
- **Email:** 25 business email accounts
- **Backups:** Daily (30-day retention)
- **CDN:** Performance caching included
- **Newsletter:** Learning Editor — 3 lists, up to 2,500 subscribers
- **AI Features:** SEO suggestions, content insights, performance alerts
- **Reporting:** Monthly analytics reporting
- **Support:** Email / chat (priority response time)
- **Strategy:** Annual performance & strategy review
- **Net revenue:** ~$166.53/month (67% margin)

### Per-Plan Cost Breakdown

| | Harbor ($99) | Gulf ($179) | Horizon ($249) |
|---|---|---|---|
| Vultr VPS | -$12.00 | -$12.00 | -$12.00 |
| xCloud fee (25%) | -$24.75 | -$44.75 | -$62.25 |
| Stripe fees | -$3.42 | -$5.94 | -$8.22 |
| **Net revenue** | **$58.83** | **$116.31** | **$166.53** |
| **Margin** | **59%** | **65%** | **67%** |

### Break-even
- Fixed overhead: $25/month (xCloud White Label panel)
- Covered by 1 Harbor client ($99 gross → $58.83 net)
- Profitable from client #1

### Feature Enforcement Note
xCloud only controls site limits and billing per plan. Feature differentiation (backup frequency, CDN, newsletter access, AI features) must be enforced operationally. Plan descriptions on motive.host communicate what's included.

---

## Key Differentiators

1. Node.js/React hosting (Gulf+) — rare for local providers
2. Learning Editor newsletter integration — bundled, not an add-on
3. AI-powered features at Horizon tier — unique in the Gulf Coast market
4. Local, trusted presence through Motive AI and LA-AI
5. Significant savings vs. current $300–400/month competitors

---

## Key People

| Name | Role | Notes |
|---|---|---|
| Kai Gray | Founder / Operator | CEO of Motive AI and Motive ESG. Runs everything. |
| Keith Glines | Potential referral partner | Executive Director of Hatch Fairhope. Early Learning Editor adopter. |
| Wills | Prospective early client | Paying ~$60/month to Hummingbird Ideas + GoDaddy. Needs newsletter. Gulf tier candidate. |

---

## Key Links

| Resource | URL |
|---|---|
| xCloud White Label Docs | https://xcloud.host/docs-category/white-label/ |
| xCloud Billing Docs | https://xcloud.host/docs/how-billing-works-in-xcloud-white-label-program/ |
| xCloud SMTP Setup | https://xcloud.host/docs/custom-smtp-provider-with-xcloud-white-label/ |
| xCloud Self-Managed Provider | https://xcloud.host/docs/resell-hosting-with-self-managed-server-provider/ |
| xCloud Site Limits | https://xcloud.host/docs/set-site-limits-on-custom-hosting-plans-reseller/ |
| xCloud Node.js Hosting | https://xcloud.host/xcloud-october-2025-release-notes |
| Motive AI | https://www.motiveai.ai |
| Motive ESG | https://www.esgmotive.com |
