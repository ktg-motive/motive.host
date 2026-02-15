# CLAUDE.md — Motive Hosting (motive.host)

## Project Identity

Motive Hosting is a white-label managed hosting service operated by Motive AI, targeting Gulf Coast SMBs who are overpaying ($300–400/month) for basic hosting. Built on xCloud White Label + Vultr. Branded under the "Sunset Harbor" nautical theme.

- **Owner:** Kai Gray (CEO, Motive AI / Motive ESG / LA-AI)
- **Marketing site:** motive.host
- **Client portal:** my.motive.host
- **Customer hub:** domains.motive.host
- **Status:** Pre-launch — infrastructure configured, marketing site live

## Memory Architecture — START EVERY SESSION

### Session Initialization (3 steps)

```
1. mcp__motive-hosting-memory__read_graph    # Live state from knowledge graph
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
mcp__motive-hosting-memory__add_observations({
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
