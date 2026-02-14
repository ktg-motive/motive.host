# Agent Templates — Quick Reference

> Customized agent templates in `.claude/agents/`. All `<!-- CUSTOMIZE -->` markers filled for motive.host.

## Available Agents

| Agent | File | Model | Color | Purpose |
|-------|------|-------|-------|---------|
| Architect | `architect.md` | opus | orange | System design, tech stack decisions, scalability planning |
| Developer | `developer.md` | opus | green | Feature implementation, bug fixes, API work |
| Product Manager | `product_manager.md` | opus | blue | PRDs, feature specs, backlog prioritization, user stories |
| Document Writer | `Technical-document-writer.md` | inherit | cyan | Help files, technical docs, user guides, ToS/Privacy |
| UI Designer | `uiDesigner.md` | sonnet | purple | UI/UX design, Sunset Harbor brand, marketing site |

## Customization Status

| Agent | Customized | Key Sections |
|-------|-----------|--------------|
| **Architect** | Generic (works as-is) | No project-specific sections needed |
| **Developer** | Full | Session init (3-step memory), tech stack (xCloud/Vultr/SendGrid/Stripe/OpenSRS), MCP servers, project structure, user roles (Kai/Client) |
| **Product Manager** | Full | Business context (revenue model, margins), knowledge sources (memory system), user roles (Kai/Prospect/Client/Referral Partner), domain knowledge, competitive landscape, differentiators |
| **Document Writer** | Full | Documentation focus: marketing content, client onboarding, legal (ToS/Privacy/AUP), operational runbooks |
| **UI Designer** | Full | Sunset Harbor brand guidelines (colors, logo, theme), component targets for marketing site, voice/tone |

## Usage

Agents are invoked via the Task tool:
```
Task tool with subagent_type: "developer"
Task tool with subagent_type: "architect"
Task tool with subagent_type: "product_manager"
Task tool with subagent_type: "Technical-document-writer"
Task tool with subagent_type: "uiDesigner"
```

## Notes

- Developer agent includes pre-commit review workflow (Gemini code review + Codex security review)
- Product Manager includes JTBD frameworks, story formats, and handoff templates to other agents
- UI Designer has full Sunset Harbor color palette and brand voice guidelines
- Document Writer scoped to marketing copy, client docs, legal, and ops runbooks
- All agents (except architect) reference the 3-step memory initialization protocol
