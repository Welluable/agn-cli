## Skill File Structure

```
skill-name/
├── SKILL.md              # Required — main instructions
├── reference.md          # Optional — detailed docs
├── examples.md           # Optional — usage examples
└── scripts/              # Optional — utility scripts
    └── helper.sh
```

### Storage locations

| Type    | Path              | Scope                          |
|---------|-------------------|--------------------------------|
| Global  | ~/.agn/skills/    | Available across all projects  |
| Project | .agn/skills/      | Scoped to the current project  |

Project skills override global ones when they share the same `name` in frontmatter.

### SKILL.md format

Every skill requires YAML frontmatter with `name` and `description`:

```markdown
---
name: docker
description: >
  Conventions for Docker workflows. Use when the user mentions
  docker, containers, dockerfile, or compose.
---

# Docker Conventions

Always use multi-stage builds. Prefer alpine base images.
Pin dependency versions in Dockerfiles.
...
```

### Frontmatter fields

| Field         | Required | Constraints                              | Purpose                                      |
|---------------|----------|------------------------------------------|----------------------------------------------|
| `name`        | Yes      | Max 64 chars, lowercase letters/numbers/hyphens | Unique identifier                       |
| `description` | Yes      | Max 1024 chars                           | Agent uses this to decide when to load skill |

### Description best practices

The description is critical — it's the only thing the agent sees before deciding to load a skill.

- Write in third person ("Conventions for Docker workflows", not "I help with Docker")
- Include both WHAT it does and WHEN to use it
- Include trigger terms the user would naturally say
- Be specific: "Use when the user mentions docker, containers, or compose" beats "Helps with containers"

## typed 

### Global skills

Global skills are skills that are available across all projects. They are stored in the ~/.agn/skills/ directory.

### Project skills

Project skills are skills that are scoped to the current project. They are stored in the .agn/skills/ directory.