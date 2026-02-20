# CLAUDE.md — Motive Hosting (motive.host)

## Project Identity

Motive Hosting is a managed hosting service operated by Motive AI, targeting Gulf Coast SMBs who are overpaying ($300-400/month) for basic hosting. Built on RunCloud (server management) + Vultr (VPS). Premium dark theme with gold accents.

- **Owner:** Kai Gray (CEO, Motive AI / Motive ESG / LA-AI)
- **Marketing site:** motive.host
- **Customer hub:** my.motive.host
- **Status:** Pre-launch — infrastructure on RunCloud, both sites live

## Repo Structure (Monorepo)

```
motive.host/
├── site/                  # Marketing site (static HTML, deployed by RunCloud)
│   ├── index.html
│   ├── privacy.html
│   ├── terms.html
│   ├── fonts/
│   └── img/
├── app/                   # Customer Hub (Next.js)
│   ├── src/app/           # Next.js App Router pages
│   ├── lib/opensrs/       # Custom OpenSRS TypeScript client
│   ├── supabase/          # Database migrations
│   ├── public/            # Static assets (fonts)
│   ├── package.json
│   └── .env.local         # Symlink → ../.env.local (gitignored)
├── memory-bank/           # Unified context (gitignored)
├── Docs/                  # Plans, PRDs, specs (gitignored)
├── CLAUDE.md
├── .env.local             # Single credentials file (gitignored)
├── .mcp.json
└── .gitignore
```

### Key Details
- `site/` is deployed by RunCloud push-to-deploy. Public path is `/site`.
- `app/` is the Next.js Customer Hub. Run `cd app && npm run dev` for local dev.
- `app/.env.local` is a symlink to the root `.env.local` (Next.js reads from its own project root).
- GitHub repo: `ktg-motive/motive.host` (private). Push to `main` triggers auto-deploy via GitHub webhooks to RunCloud (both sites).

## Server Access

### SSH to Production (RunCloud — mh-rc-prod-atl-01)

```bash
ssh -i ~/.ssh/claude_mh_runcloud motive-host@144.202.27.86
```

| Field | Value |
|-------|-------|
| Server | mh-rc-prod-atl-01 (Vultr High Frequency) |
| RunCloud name | mhrcprodatl01 (no hyphens — RunCloud doesn't support them) |
| RunCloud server ID | 338634 |
| IP | 144.202.27.86 |
| SSH user | motive-host |
| SSH key | `~/.ssh/claude_mh_runcloud` (ed25519) |
| Home dir | /home/motive-host |
| Webapps dir | /home/motive-host/webapps/ |
| OS | Ubuntu 24.04 LTS |
| Node.js | v22.22.0 |
| PM2 | v6.0.14 |
| Sudo | Available |

### Legacy Server (xCloud — mh-prod-atl-01)

```bash
ssh -i ~/.ssh/claude_motive_host motive@155.138.192.127
```

Only hosts my.motive.host (xCloud portal). The `motive` user cannot sudo — root commands go through xCloud's UI.

### RunCloud Nginx Notes (customer-hub)

- RunCloud uses `nginx-rc` at `/etc/nginx-rc/`
- Managed config: `/etc/nginx-rc/conf.d/customer-hub.d/main.conf` — do not edit directly, but `try_files` was modified for Node.js support
- Custom configs: `/etc/nginx-rc/extra.d/customer-hub.location.*.conf`
- **Critical:** `try_files` in main.conf was changed from `/index.php` fallback to `@nextjs` named location. RunCloud may overwrite this on dashboard changes. Re-apply with:
  ```bash
  sudo sed -i 's|try_files $uri $uri/ /index.php$is_args$args;|try_files /dev/null @nextjs;|g' /etc/nginx-rc/conf.d/customer-hub.d/main.conf && sudo /usr/local/sbin/nginx-rc -t && sudo systemctl reload nginx-rc
  ```
- Static assets symlink: `webapps/customer-hub/_next/static` → `app/.next/static` (deploy script recreates this)

## Memory Architecture — START EVERY SESSION

### Session Initialization (3 steps)

```
1. mcp__memory__read_graph                   # Live state from knowledge graph
2. Read memory-bank/context_YYYY-MM-DD.md    # Today's context (fall back to most recent)
3. Read memory-bank/context.md               # Stable reference (if needed for technical decisions)
```

### Memory Layers

| Layer | Source | Contains | When to Read |
|-------|--------|----------|--------------|
| **Live State** | Knowledge Graph | Feature status, blockers, last session | Every session start |
| **Daily Context** | `context_YYYY-MM-DD.md` | Today's session notes, decisions | Every session start |
| **Stable Reference** | `context.md` | Tech stack, plans, DNS, branding, business context | When needed |
| **Quick Lookup** | `reference/*.md` | Domain/DNS records, service accounts, config values | Before searching docs |

### Before Session End

1. Update knowledge graph with session summary:
```
mcp__memory__add_observations({
  observations: [{
    entityName: "Motive Hosting Last Session",
    contents: ["Date: YYYY-MM-DD", "What was accomplished", "Key decisions"]
  }]
})
```

2. Update or create daily context file with session details.

## Working Style

- Casual, professional, conversational. Concise and action-oriented.
- When providing code, write complete files without truncation.
- Chain-of-Thought: break problems down step by step, explain tradeoffs.
- Mix short and long sentences. No buzzwords, no overly formal language.
- Use humor where appropriate. Forward-thinking perspective.
- Limit em dashes and emojis. Minimal bullet points in conversation.
- Refer to the user as Kai.
- Never give time estimates or temporal milestones (e.g., "~6 weeks", "Week 1-2"). Describe work in terms of phases, dependencies, and scope — not how long it might take.

## Project Conventions

- Plan tier names are nautical: Captain, Harbor, Gulf, Horizon
- SKU format: `mh-{tier}` (e.g., mh-harbor, mh-gulf, mh-horizon)
- Marketing (motive.host), portal (my.motive.host), and customer hub (my.motive.host) are intentionally separated
- All transactional email sends from motive.host domain via SendGrid
- Color palette — see context.md for hex values and typography
