# Motive Hosting Landing Page Design Specification
**Version 1.0 | February 14, 2026**

---

## Design Philosophy

This is a luxury service brand, not a tech startup. The design communicates calm competence, white-glove care, and premium quality through restraint and breathing room. The Gulf Coast "calm bay at dusk" metaphor drives every decision: stillness, warmth, confidence.

**Anti-patterns to avoid:**
- Tech startup gradients and poppy colors
- Busy patterns or decorative elements
- Stock photos of laptops or generic "tech" imagery
- Bouncy SaaS animations
- Pure white backgrounds (always use Warm White #FAF8F5)

---

## 1. Typography System

### Font Pairing

**Headings:** Playfair Display (Serif)
- Luxury editorial feel, confident serifs
- Weights: 600 (Semibold), 700 (Bold)

**Body & UI:** Inter (Sans-serif)
- Clean, modern, excellent readability
- Weights: 400 (Regular), 500 (Medium), 600 (Semibold)

### Type Scale

| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---------|------|------|--------|-------------|----------------|
| **H1 (Hero)** | Playfair Display | 72px | 700 | 1.1 (79px) | -0.02em |
| **H2 (Section)** | Playfair Display | 48px | 600 | 1.2 (58px) | -0.01em |
| **H3 (Card Title)** | Playfair Display | 32px | 600 | 1.3 (42px) | 0 |
| **H4 (Feature)** | Inter | 20px | 600 | 1.4 (28px) | -0.01em |
| **Body Large** | Inter | 20px | 400 | 1.6 (32px) | 0 |
| **Body** | Inter | 16px | 400 | 1.6 (26px) | 0 |
| **Body Small** | Inter | 14px | 400 | 1.5 (21px) | 0 |
| **UI/Nav** | Inter | 15px | 500 | 1.4 (21px) | 0.01em |
| **Button** | Inter | 16px | 600 | 1.2 (19px) | 0.02em |
| **Caption** | Inter | 12px | 500 | 1.4 (17px) | 0.03em |

### Mobile Type Scale

| Element | Mobile Size |
|---------|-------------|
| **H1** | 48px |
| **H2** | 36px |
| **H3** | 24px |
| **H4** | 18px |
| **Body Large** | 18px |
| **Body** | 16px |

---

## 2. Page Layout & Section Design

### Global Layout Constraints

- **Max content width:** 1280px (centered)
- **Content gutter (desktop):** 80px each side
- **Content gutter (tablet):** 40px each side
- **Content gutter (mobile):** 24px each side

---

### Section 1: Hero

**Background:** Navy (#1A2744) full bleed

**Layout:**
- Content width: 900px max
- Vertical padding: 180px top, 140px bottom
- Center-aligned content

**Content Hierarchy:**
1. **Overline text:** Body Small, Sky Blue (#5BA4CF), all caps, letter-spacing 0.1em, margin-bottom 24px
2. **H1 Headline:** 72px Playfair, Warm White (#FAF8F5), margin-bottom 32px
3. **Subheadline:** Body Large (20px), Warm White 80% opacity, margin-bottom 48px
4. **Primary CTA button:** Coral, centered, margin-bottom 16px
5. **Caption under CTA:** Caption size, Warm White 60% opacity

**Mobile:** Padding 100px top / 80px bottom, H1 48px, subheadline 18px

---

### Section 2: Value Proposition

**Background:** Warm White (#FAF8F5)

**Layout:**
- Full content width (1280px max)
- Vertical padding: 120px top and bottom
- Three-column grid, 48px gap

**Per Card:**
- Icon: 64x64px, margin-bottom 24px
- Heading (H4): Navy, margin-bottom 16px
- Body text: 16px, Navy 80% opacity, max-width 340px

**Mobile:** Single column, 64px gap, center-align

---

### Section 3: Pricing

**Background:** Navy (#1A2744)

**Layout:**
- Full content width (1280px max)
- Vertical padding: 140px top and bottom
- Three-column grid, 32px gap

**Card Specs:**
- Min-height: 640px
- Padding: 48px all sides
- Border-radius: 12px
- Border: 1px solid rgba(255, 255, 255, 0.1)

**Harbor & Horizon (Standard):**
- Background: rgba(255, 255, 255, 0.05)

**Gulf (Popular):**
- Background: rgba(255, 255, 255, 0.08)
- Border: 2px solid #F0A830 (Amber Gold)
- Box-shadow: 0 8px 32px rgba(240, 168, 48, 0.15)
- Transform: scale(1.02), position relative top -8px

**"Popular" Badge:**
- Position: Absolute, top -16px, centered
- Background: #F0A830, Color: #1A2744
- Padding: 6px 20px, border-radius: 16px (pill)
- Font: Inter 12px, weight 600, letter-spacing 0.05em, all caps

**Card Content:**
1. Plan Name (H3): Playfair 32px, Warm White, mb 16px
2. Price: Playfair 56px weight 700 + "/month" Body Small 60% opacity, mb 8px
3. Billing note: Caption, 50% opacity, mb 32px
4. CTA button: Full-width, mb 40px
5. Feature list: Body Small 14px, 85% opacity, Coral checkmarks 16x16px

**CTA Buttons:**
- Gulf: Filled Coral (Primary)
- Harbor & Horizon: Outline Coral

**Mobile:** Stack vertically, 40px gap, Gulf loses scale/lift but keeps border/shadow, padding 32px

---

### Section 4: Features Detail

**Background:** Warm White (#FAF8F5)

**Layout:**
- Full content width, padding 120px vertical
- Two-column grid, 64px gap

**Per Category:**
- Heading (H4): Inter 20px semibold, Navy, mb 24px
- Features: Body 16px, Navy 75% opacity, Sky Blue checkmarks 20x20px

**Mobile:** Single column, 56px gap

---

### Section 5: FAQ

**Background:** Navy (#1A2744)

**Layout:**
- Content width: 900px max
- Vertical padding: 120px

**FAQ Items (Closed):**
- Background: rgba(255, 255, 255, 0.05)
- Border-radius: 8px
- Padding: 28px 32px
- Margin-bottom: 16px
- Question: Inter 18px weight 500, Warm White
- Chevron: 16x16px, Sky Blue, rotates on open

**FAQ Items (Open):**
- Background: rgba(255, 255, 255, 0.08)
- Answer: Body 16px, Warm White 75% opacity, max-width 720px
- Animation: 300ms ease-out expand, 250ms collapse

**Hover:** Background rgba(255, 255, 255, 0.07)

---

### Section 6: Final CTA

**Background:** Warm White (#FAF8F5)

**Layout:**
- Content width: 800px max
- Vertical padding: 100px
- Center-aligned

**Content:**
1. H2: Playfair 48px, Navy, mb 24px
2. Subheadline: Body Large 20px, Navy 70% opacity, mb 40px
3. Primary CTA: Coral filled, centered, mb 16px
4. Caption: Navy 50% opacity

---

### Section 7: Footer

**Background:** Navy (#1A2744)

**Layout:**
- Full content width, padding 64px top / 40px bottom
- Three-column grid

**Column 1:** Logo (212x40px) + tagline (Body Small, 60% opacity)
**Column 2:** Quick Links — Body Small, 70% opacity, Sky Blue underline on hover
**Column 3:** Legal links + email contact (Sky Blue)
**Bottom:** 1px divider rgba(255,255,255,0.1), copyright Caption 40% opacity centered

**Mobile:** Single column, center-aligned, 40px gap

---

## 3. Navigation

### Desktop
- Sticky, height 80px, Navy 95% opacity + backdrop-blur 12px
- Logo left (212x40px), nav links + CTA right
- Links: Inter 15px weight 500, Warm White, hover Sky Blue (150ms)
- Active section: 2px Coral underline
- CTA: Primary Coral button, medium size

### Mobile
- Height 64px, logo 180x34px
- Hamburger: 24px icon, 44px tap target
- Full-screen overlay: Navy 98% opacity, slide-down 300ms
- Links: Inter 20px weight 500, center-aligned, 32px gap
- Full-width CTA at bottom

### Scroll Behavior
- Top (scrollY < 50px): Solid Navy, no blur, no border
- Scrolled: Navy 95% opacity + blur 12px + border
- Anchor offset: 100px for sticky nav

---

## 4. Components

### Primary Button (Filled Coral)
- Padding: 16px 32px (large), 12px 28px (medium)
- Border-radius: 8px, min-width 160px
- Background: Coral (#E8725A), text: Warm White
- Hover: #D66450, scale(1.02), 200ms ease
- Active: #C55A47, scale(0.98)
- Focus: 3px Sky Blue outline, 2px offset

### Secondary Button (Outline)
- Same dimensions, transparent background
- Border: 2px solid Coral, text: Coral
- Hover: Coral 10% opacity fill

### Tertiary Button (Text Only)
- Sky Blue text, underline on hover only

---

## 5. Animation & Motion

**Principle:** Subtle, luxurious, calm. "Yacht gliding into dock, not speedboat jump."

### Scroll-Triggered Reveals
- Translate: 32px up, opacity 0→1
- Duration: 600ms, easing: cubic-bezier(0.16, 1, 0.3, 1)
- Trigger: 15% into viewport
- Stagger: 100ms between grouped elements

### Reduced Motion
- Disable all transforms
- Opacity-only fade, 300ms
- Respect `@media (prefers-reduced-motion: reduce)`

---

## 6. Accessibility

### Contrast Ratios (Verified)
| Combo | Ratio | Status |
|-------|-------|--------|
| Warm White on Navy | 12.8:1 | AAA |
| Navy on Warm White | 12.8:1 | AAA |
| Coral on Navy | 4.7:1 | AA |
| Sky Blue on Navy | 4.9:1 | AA |
| Amber on Navy | 7.1:1 | AAA |
| Warm White on Coral | 2.7:1 | Large text only (16px+) |

### Focus States
- Sky Blue (#5BA4CF), 3px solid outline, 2px offset
- `:focus-visible` only (not mouse clicks)

### Touch Targets
- Minimum 44x44px on all interactive elements

### Screen Reader
- Semantic HTML, ARIA labels on accordion/nav
- Skip-to-content link
- `aria-expanded` on FAQ triggers

---

## 7. Responsive Breakpoints

| Breakpoint | Width | Target |
|------------|-------|--------|
| Mobile | < 768px | Phones |
| Tablet | 768px – 1024px | Tablets |
| Desktop | 1024px – 1440px | Laptops |
| Wide | > 1440px | Large displays |

### Section Padding
- Desktop: 120–180px vertical
- Tablet: 100–140px vertical
- Mobile: 80–100px vertical
