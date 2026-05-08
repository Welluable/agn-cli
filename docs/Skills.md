# Skills

Skills are markdown instruction bundles that teach agn domain-specific procedures while keeping the toolset fixed. A skill can define conventions, ordered workflows, constraints, examples, and supporting reference material.

## Storage locations

agn loads skills from three locations. When two skills use the same directory name, the higher-precedence location overrides the lower one.

| Location | Path | Scope | Precedence |
|---|---|---|---|
| Internal | Bundled with agn in `dist/skills/` | Built-in skills shipped with the package | Lowest |
| Global | `~/.agn/skills/<skill-name>/` | Available in every project | Middle |
| Project | `.agn/skills/<skill-name>/` | Available only from the current project directory | Highest |

The internal skills directory is primarily for package-provided skills such as `create-skill`. User-authored skills belong in the global or project directories.

## Skill file format

Each skill is a directory with a required `SKILL.md` file:

```text
.agn/skills/
  my-skill/
    SKILL.md
    reference.md   # optional supporting file
    examples.md    # optional supporting file
```

`SKILL.md` starts with YAML frontmatter containing `name` and `description`, followed by markdown instructions:

```markdown
---
name: my-skill
description: >
  Project conventions for migrations. Use when the user mentions
  database migrations, schema changes, or migration files.
---

# Migration Conventions

You MUST follow these steps for every schema change.

## Steps
1. Read the existing migration directory.
2. Create one new migration file with a timestamped name.
3. Run the project migration validation command.

## Constraints
- NEVER modify an already-applied migration
- ALWAYS run validation before reporting success
```

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Human-readable skill name. Skills can be loaded by this value or by directory name. |
| `description` | Yes | Short trigger description shown in the skill index and by `agn skills list`. The agent uses it to decide when to load the skill. |

## Supporting files

When a skill is loaded, agn returns `SKILL.md` plus every other markdown file under the same skill directory, recursively. Supporting files are appended in sorted order with a heading that identifies the relative path:

```text
## Supporting file: reference.md
```

Use supporting files for examples, long references, checklists, or templates that would make `SKILL.md` too large.

## Runtime behavior

### Auto-discovery

By default, the `Agent` scans internal, global, and project skill directories. It injects an index of available skills into the system prompt. The model sees each skill name and description, then calls the built-in `read_skill` tool before using a matching skill.

```ts
const agent = new Agent({ provider })
```

### Explicit loading

When the `skills` option is passed to the `Agent` constructor, agn loads those skills directly into the system prompt instead of building the auto-discovery index. Explicitly loaded skills are wrapped in mandatory instructions telling the model to follow the loaded skill and not call `read_skill` for it.

```ts
const agent = new Agent({
  provider,
  skills: 'my-skill',
})

const agent = new Agent({
  provider,
  skills: ['my-skill', 'another-skill'],
})
```

## Listing skills

Use `agn skills list` to show the merged set of discovered skills:

```bash
agn skills list
```

The command prints a box table with `Name` and `Description` columns. Long descriptions are wrapped at 80 characters.

```text
┌──────────────┬──────────────────────────────────────────┐
│ Name         │ Description                              │
├──────────────┼──────────────────────────────────────────┤
│ create-skill │ Create a skill file. Use when the user... │
├──────────────┼──────────────────────────────────────────┤
│ prisma       │ Work with Prisma schemas and migrations.  │
└──────────────┴──────────────────────────────────────────┘
```

## Creating skills with the CLI

Use `agn skill new` to create a project or global skill. The command runs the bundled `create-skill` skill through the normal agent loop, so it requires working provider configuration and an API key.

```bash
agn skill new my-skill --description "Knows how to do X" --project
agn skill new my-skill --description "Knows how to do X" --global
```

| Argument or flag | Description |
|---|---|
| `<name>` | Required skill directory/file name passed to the generator. |
| `--description "..."` | Optional purpose text for the generated skill frontmatter. The generator treats this as the skill purpose, not as a question to answer. |
| `--project` | Create the skill under `.agn/skills/<name>/`. This is the default. |
| `--global` | Create the skill under `~/.agn/skills/<name>/`. |

`agn skill new` exits with code `0` when the agent returns `done`; it exits with code `1` when the agent fails or reaches the iteration limit.

## Environment overrides

The skills scanner supports these environment variables for tests and advanced setups:

| Variable | Description |
|---|---|
| `AGN_INTERNAL_SKILLS_DIR` | Override the bundled internal skills directory. |
| `AGN_GLOBAL_SKILLS_DIR` | Override the global skills directory. |
| `AGN_PROJECT_SKILLS_DIR` | Override the project skills directory. |

## What skills do NOT do

- Skills do not add new tools. The agent still has only `read_file`, `write_file`, `patch`, `shell`, and `read_skill`.
- Skills do not run automatically by themselves. In auto-discovery mode, the model chooses a matching skill and loads it with `read_skill`.
- Skills do not create conversation memory across runs. Each `agent.run()` starts with a fresh message history.
