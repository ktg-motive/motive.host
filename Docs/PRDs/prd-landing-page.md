# Product Requirements Document: motive.host Marketing Landing Page

**Product:** Motive Hosting Marketing Site
**URL:** motive.host
**Version:** 1.0
**Author:** Product Manager (Claude)
**Date:** February 14, 2026
**Status:** Draft for Kai's Review

---

## 1. Problem Statement

Gulf Coast small business owners are stuck between two bad options for web hosting. On one end, commodity providers like GoDaddy offer cheap plans with zero managed service — the business owner is on their own when something breaks. On the other end, local agencies and "web guys" charge $300-400/month for basic WordPress hosting bundled with email, offering mediocre infrastructure wrapped in a relationship markup.

Neither option delivers what these businesses actually need: professionally managed hosting with real technical depth, bundled with the operational tools (email, newsletters, monitoring) that keep a business running online, at a price that reflects value rather than either neglect or overhead.

Motive Hosting fills this gap. It is the premier managed hosting service on the Gulf Coast — built on serious infrastructure (Vultr + xCloud), operated by genuine experts, and priced to reflect the quality of service without the bloat of agency retainers. The marketing site at motive.host must communicate this positioning clearly, convert prospects to self-serve signups at host.motiveai.ai, and establish the brand as the definitive choice for Gulf Coast businesses who want their web presence handled right.

---

## 2. User Stories

**Persona: Gulf Coast SMB Owner ("The Prospect")**

Non-technical. Runs a business with 5-50 employees. Currently paying someone for hosting/web services and has a vague sense they're either overpaying or underserved. Makes purchasing decisions based on trust, clarity, and perceived competence. Does not want to learn about hosting — wants to know it's handled.

### Job Stories

**When** I land on motive.host from a referral or search, **I want to** immediately understand what this company does and whether it's for someone like me, **so that** I can decide in under 10 seconds whether to keep reading.

**When** I'm evaluating whether to switch from my current hosting provider, **I want to** see exactly what I get at each price point with no ambiguity, **so that** I can compare it against what I'm paying now and feel confident I'm getting more value.

**When** I see a plan that fits my business, **I want to** sign up without scheduling a call or filling out a contact form, **so that** I can get started on my own timeline without a sales process.

**When** I'm reading about what's included, **I want to** understand the benefits in terms of my business outcomes (speed, reliability, security), **so that** I don't have to translate technical jargon into value.

**When** I'm nervous about switching providers, **I want to** see that migration is handled for me and that there's no risk of downtime, **so that** the switching cost feels low enough to act.

**When** I'm comparing Motive Hosting to what I'm currently paying, **I want to** understand what makes this premium service worth the price, **so that** I feel like I'm making a smart business decision rather than just a cheaper one.

**When** I discover that newsletter tools are bundled into the Gulf and Horizon tiers, **I want to** understand what that means for my business without needing to know what "Learning Editor" is, **so that** I recognize the added value without feeling sold to.

---

## 3. Section-by-Section Content Direction

### 3.1 Hero

**Purpose:** Establish identity, positioning, and relevance in under 5 seconds. Set the emotional tone of the entire page: calm confidence, premium quality, Gulf Coast roots.

**Messaging Hierarchy:**
1. **Headline:** Communicate that this is premium managed hosting for Gulf Coast businesses. The headline should feel like a statement of fact, not a pitch. Direction: something in the territory of declaring what happens when real expertise meets local service. Not clever. Not cute. Authoritative and warm.
2. **Subheadline:** One sentence that bridges to the prospect's situation. Speak to the outcome they want: a web presence that runs perfectly without them thinking about it. Mention Gulf Coast explicitly — geographic specificity builds trust.
3. **CTA:** Single primary button. Label should be action-oriented and low-friction. "See Plans" or "View Plans" — scrolls to pricing section. Do NOT use "Get Started" here (too early in the page for a commitment CTA).

**Functional Requirements:**
- Full-viewport hero section on desktop and mobile
- Logo displayed prominently (the geometric flying M with coral-to-navy gradient)
- Background treatment should use the Sunset Harbor palette — Navy (#1A2744) as primary background
- CTA button uses Coral (#E8725A) as primary action color
- Smooth scroll behavior when CTA is clicked (anchors to pricing section)

**Content Constraints:**
- Headline: 8-12 words maximum
- Subheadline: 1 sentence, under 25 words
- No mention of technology, infrastructure, or AI
- No "starting at $X/month" in the hero — let them read the value story first

---

### 3.2 Value Proposition

**Purpose:** Answer "why does this exist and why should I care?" Transition the reader from awareness to interest. Establish the three or four core reasons Motive Hosting is different from what they have now.

**Messaging Hierarchy:**
1. **Section Headline:** Frame the value around the prospect, not the product. Direction: what their business gets when experts handle the infrastructure.
2. **Value Pillars (3-4 items):** Each with a short heading and 1-2 sentence description.

**Value Pillars (in priority order):**

**Pillar 1 — Fully Managed by Experts**
The core differentiator. Communicate that there's a real team with real expertise behind every site. Not a ticket queue. Not a chatbot. Actual professionals monitoring, updating, and optimizing. Position this as the answer to both the commodity host problem (no support) and the local agency problem (limited technical depth).

**Pillar 2 — Everything Under One Roof**
Website hosting, business email, security monitoring, backups, and even a newsletter platform — all managed in one place. Frame it as simplification: one provider, one bill, one team that knows your whole setup.

**Pillar 3 — Built for Modern Businesses**
Subtly communicate technical capability without being technical. Most local providers can only host WordPress. Motive hosts WordPress, Node.js, and React applications. Don't say it that way — say something like "Whether your site runs on WordPress or a modern web application, we handle it."

**Pillar 4 — Gulf Coast Local**
Not a faceless data center corporation. A Gulf Coast company serving Gulf Coast businesses. Frame locality as accountability.

**Functional Requirements:**
- Displayed as a grid (2x2 on desktop, stacked on mobile)
- Each pillar has an icon (simple, geometric, on-brand)
- Visual weight should be on the headings, not the descriptions
- No CTA in this section — it's a bridge to pricing

---

### 3.3 Pricing

**Purpose:** This is the conversion section. Show all three tiers with complete feature lists, make Gulf the obvious choice for most prospects, and drive clicks to the signup portal.

**Messaging Hierarchy:**
1. **Section Headline:** Frame pricing around value and transparency. Not "affordable" — never use the word affordable.
2. **Section Subheadline:** One sentence reinforcing that everything is included (no hidden fees).
3. **Three Tier Cards:** Harbor, Gulf (highlighted), Horizon

**Tier Positioning Statements:**

- **Harbor ($99/mo):** For businesses that need one solid website, managed right. Not "basic" or "starter." Still premium; just focused.
- **Gulf ($179/mo) — "Popular" badge:** For growing businesses that need more capacity and more tools. The sweet spot.
- **Horizon ($249/mo):** For businesses that want everything managed and optimized. The complete package.

**Feature Lists Per Tier:**

Harbor:
- 1 WordPress site
- 10GB storage
- 5 business email accounts
- SSL certificate
- Weekly backups
- Uptime monitoring
- Email support

Gulf (everything in Harbor, plus):
- Up to 3 sites (WordPress or Node.js/React)
- 25GB storage
- 10 business email accounts
- Daily backups
- CDN included
- Newsletter platform (1 list, up to 500 subscribers)
- Monthly security updates
- Quarterly site health report

Horizon (everything in Gulf, plus):
- Up to 5 sites (WordPress or Node.js/React)
- 50GB storage
- 25 business email accounts
- AI-powered SEO and content insights
- AI performance alerts
- Monthly analytics report
- Priority support
- Annual strategy review

**CTA Per Card:**
Each tier card gets a button linking to host.motiveai.ai. Button copy: "Get Started". All three buttons link to the same portal URL.

**Functional Requirements:**
- Three cards displayed side by side on desktop, stacked on mobile
- Gulf card visually elevated
- "Popular" badge on Gulf card
- Price displayed large and prominent within each card
- All CTA buttons open host.motiveai.ai in a new tab
- Gulf CTA button uses Coral (#E8725A); Harbor and Horizon CTAs use secondary treatment

---

### 3.4 Features Detail

**Purpose:** Give prospects the deeper information they need to feel confident. Organized by category.

**Feature Categories:**

**Website Hosting:** Managed WordPress, Node.js/React (Gulf+), SSL, CDN (Gulf+), 99.9% uptime
**Security and Backups:** Automated backups, malware scanning, monthly security updates (Gulf+), SSL
**Business Email:** Professional email on your domain, 5-25 accounts by tier
**Newsletter Platform:** Built-in newsletter sending (Gulf+), subscriber management, send from your domain
**Monitoring and Insights:** Uptime monitoring, quarterly health reports (Gulf+), AI insights (Horizon), monthly analytics (Horizon)

**Functional Requirements:**
- Clean layout with iconography
- Features that are tier-limited should note which tiers include them
- Generous whitespace, scannable headings
- No CTA buttons within this section

---

### 3.5 FAQ

**Questions:**
1. What does "managed hosting" actually mean?
2. How do I move my existing website to Motive Hosting?
3. What kind of support do I get?
4. Can I host something other than WordPress?
5. What's included in the newsletter platform?
6. Is there a contract or can I cancel anytime?
7. What happens if my site goes down?
8. Can I upgrade my plan later?

**Functional Requirements:**
- Accordion-style (click to expand)
- All questions collapsed by default
- Smooth expand/collapse animation
- 6-8 questions maximum for v1

---

### 3.6 Final CTA

**Purpose:** Close the page with a strong, confident invitation to sign up.

**Functional Requirements:**
- Full-width section with Navy (#1A2744) background
- CTA button is large and high-contrast
- Confident conclusion, not a desperate ask

---

### 3.7 Footer

**Content:**
- Motive Hosting logo (compact version)
- Copyright: © 2026 Motive Hosting. A Motive AI company.
- Links: Privacy Policy, Terms of Service
- Client portal link: host.motiveai.ai

---

## 4. Non-Functional Requirements

### Performance
- Lighthouse Performance score: 95+ on mobile
- First Contentful Paint: under 1.5 seconds on 3G
- Total page weight under 500KB (excluding fonts)
- Fonts: self-hosted, preloaded, limited to 2 weights maximum

### SEO
- Semantic HTML5 structure
- Single H1 on the page (hero headline)
- Meta title: "Motive Hosting — Premier Managed Hosting for Gulf Coast Businesses"
- Open Graph and Twitter Card meta tags
- Structured data: LocalBusiness schema (JSON-LD)

### Accessibility
- WCAG 2.1 AA compliance minimum
- All interactive elements keyboard-navigable
- Skip-to-content link
- Respect `prefers-reduced-motion` media query

### Security
- HTTPS only
- Content Security Policy headers
- No third-party tracking scripts for v1

---

## 5. Success Metrics

| Metric | Target |
|--------|--------|
| CTA click-through rate | >5% of visitors |
| Portal signup conversion | >2% of visitors |
| Bounce rate | <50% |
| Average scroll depth | >70% |
| Lighthouse Performance (mobile) | 95+ |
| Lighthouse Accessibility | 95+ |

---

## 6. Open Questions for Kai

1. Contract terms — month-to-month? Annual discount option?
2. Migration policy — always free regardless of complexity?
3. Support channels and hours — defined response times?
4. Uptime SLA — formal with credits, or a target?
5. Legal pages — Privacy Policy and ToS exist yet?
6. Analytics preference?
7. Domain email provider specifics?
8. Newsletter 500-subscriber limit — hard cap or upgrade path?
9. Physical address for footer / local SEO?

---

## 7. Out of Scope for v1

- Multi-page site
- Testimonials or social proof (no real content yet)
- Live chat or chatbot
- Contact form or "Book a call"
- Annual pricing toggle
- Blog or content marketing
- Any placeholder or mock content
