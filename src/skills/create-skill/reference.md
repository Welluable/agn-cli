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

### Body best practices

The body is what the agent follows after loading the skill. Weak body = weak enforcement.

- Use imperative, constraint-based language: "You MUST", "NEVER", "ALWAYS" — not "You can", "Consider", "Try to"
- Structure the body with a clear **Steps** (numbered, ordered) section for procedural skills, or a **Rules** (bullet list) section for convention skills
- Include a **Constraints** section listing explicit anti-patterns ("NEVER do X", "Do NOT do Y")
- Make instructions actionable and tool-specific where possible ("Use the shell tool to run...", "Write the file using write_file")
- Avoid vague advice like "follow best practices" — spell out what those practices are
- Each instruction should leave zero ambiguity about what the agent should do

### Quality checklist

Before writing a SKILL.md, verify:

- [ ] Every instruction uses imperative verbs (Do, Use, Create, Run — not Consider, Try, Maybe)
- [ ] There is at least one NEVER/DO NOT constraint
- [ ] Steps are numbered and ordered (for procedural skills)
- [ ] A model reading this would know exactly what tools to call and what outputs to produce
- [ ] No vague phrases like "as appropriate", "if needed", "best practices"

### Global skills

Global skills are available across all projects. They are stored in the ~/.agn/skills/ directory.

### Project skills

Project skills are scoped to the current project. They are stored in the .agn/skills/ directory.
