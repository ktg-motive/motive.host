# Agent Templates for Claude Code

Reusable agent templates derived from the Kingfisher project. Copy these into any project's `.claude/agents/` directory and customize the sections marked with `<!-- CUSTOMIZE -->`.

## Quick Setup

```bash
# Copy all templates to a new project
cp ~/Dev/agent-templates/*.md /path/to/project/.claude/agents/

# Or copy specific agents
cp ~/Dev/agent-templates/developer.md /path/to/project/.claude/agents/
```

## Available Agents

| Agent | File | Model | Purpose |
|-------|------|-------|---------|
| Architect | `architect.md` | opus | System design, tech stack decisions, scalability planning |
| Developer | `developer.md` | opus | Feature implementation, bug fixes, API work |
| Product Manager | `product_manager.md` | opus | PRDs, feature specs, backlog prioritization, user stories |
| Document Writer | `Technical-document-writer.md` | inherit | Help files, technical docs, user guides |
| UI Designer | `uiDesigner.md` | sonnet | UI/UX design, accessibility, visual hierarchy |

## Customization

Each template has `<!-- CUSTOMIZE -->` comments marking sections you should adapt:

- **Developer**: Tech stack, file structure, service patterns, user roles, MCP servers
- **Product Manager**: Business context, revenue model, domain knowledge, user roles, competitive landscape
- **Document Writer**: Project-specific documentation areas
- **UI Designer**: Component library, brand guidelines
- **Architect**: Already generic - works as-is for most projects

## How Agents Work

Place `.md` files in `.claude/agents/` and they become available via the `Task` tool:

```
Task tool with subagent_type: "developer"
Task tool with subagent_type: "architect"
Task tool with subagent_type: "product_manager"
```

The frontmatter configures each agent:

```yaml
---
name: agent-name          # Used as subagent_type identifier
description: "When to use" # Shown in agent selection
model: opus               # opus, sonnet, or inherit
color: green              # Terminal color for output
---
```
