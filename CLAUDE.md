# CLAUDE.md — Motive Hosting (motive.host)

## Project Identity

Motive Hosting is a white-label managed hosting service operated by Motive AI, targeting Gulf Coast SMBs who are overpaying ($300-400/month) for basic hosting. Built on xCloud White Label + Vultr. Branded under the "Sunset Harbor" nautical theme.

- **Owner:** Kai Gray (CEO, Motive AI / Motive ESG / LA-AI)
- **Marketing site:** motive.host
- **Client portal:** my.motive.host
- **Customer hub:** domains.motive.host
- **Status:** Pre-launch — infrastructure configured, marketing site live

## Repo Structure (Monorepo)

```
motive.host/
├── site/                  # Marketing site (static HTML, deployed by xCloud)
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
- `site/` is deployed by xCloud push-to-deploy. Nginx root is `/var/www/motive.host/site`.
- `app/` is the Next.js Customer Hub. Run `cd app && npm run dev` for local dev.
- `app/.env.local` is a symlink to the root `.env.local` (Next.js reads from its own project root).
- The monorepo was consolidated from two separate repos on Feb 15, 2026. The original app repo was at `/Users/Kai/Dev/Active/motive.host-app/`.
- GitHub repo: `ktg-motive/motive.host` (private). Push to `main` triggers xCloud deploy.

## Server Access

### SSH to Production (Vultr mh-prod-atl-01)

```bash
ssh -i ~/.ssh/claude_motive_host motive@155.138.192.127
```

| Field | Value |
|-------|-------|
| Server | mh-prod-atl-01 (Vultr High Frequency) |
| IP | 155.138.192.127 |
| SSH user | motive |
| SSH key | `~/.ssh/claude_motive_host` (ed25519) |
| Home dir | /home/motive |
| Site path | /var/www/motive.host |
| Nginx config | /etc/nginx/sites-available/motive.host |
| OS | Ubuntu 24.04 LTS |

### Important Server Notes
- The `motive` user cannot sudo. Root commands must go through xCloud's command interface.
- `fail2ban` is active on sshd. If locked out, unban via xCloud root: `fail2ban-client set sshd unbanip <IP>`
- To whitelist an IP from fail2ban: `fail2ban-client set sshd addignoreip <IP>`
- xCloud manages the main Nginx config. Custom snippets go in `/etc/nginx/xcloud-conf/motive.host/server/`. However, duplicate directives (like `root`) will fail validation. Direct edits to the main config require root via xCloud.
- The Nginx `root` directive was changed from `/var/www/motive.host` to `/var/www/motive.host/site` via `sed` as root (Feb 15, 2026). xCloud may overwrite this if the site config is regenerated.
- `PubkeyAuthentication` was set to `no` by default in sshd_config. Changed to `yes` via root (Feb 15, 2026). xCloud may also overwrite this.
- sshd LogLevel was set to DEBUG3 during troubleshooting. Needs to be reverted: `sed -i 's/^LogLevel DEBUG3/#LogLevel INFO/' /etc/ssh/sshd_config && systemctl restart sshd`

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
- Marketing (motive.host), portal (my.motive.host), and customer hub (domains.motive.host) are intentionally separated
- All transactional email sends from motive.host domain via SendGrid
- Color palette is "Sunset Harbor" — see context.md for hex values
