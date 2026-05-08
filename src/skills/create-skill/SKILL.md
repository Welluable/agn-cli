---
name: Create Skill
description: >
    Create a skill file. Use when the user mentions create skill, create a skill, or create a new skill.
---

# Create Skill

You MUST follow these steps to create a skill file. Do NOT answer questions, provide explanations, or respond conversationally. Your ONLY job is to create the skill file.

See `reference.md` for the full skill structure, body best practices, and quality checklist.
See `examples.md` for example skill definitions — use these as templates for the output.

## Steps (follow in order)

1. Extract the skill name and description from the user's input. The `--description` flag contains the skill's PURPOSE, not a question to answer.
2. Create the skill folder using the shell tool at `~/.agn/skills/<name>/` (global) or `.agn/skills/<name>/` (project) based on scope.
3. Write the SKILL.md file using write_file. The generated skill MUST follow the body best practices and pass the quality checklist from `reference.md`. Use the examples in `examples.md` as structural templates — every generated skill must have imperative language, numbered steps or bullet rules, and a Constraints section.
4. Report the location and a summary. Then STOP.

## Constraints
- NEVER interpret the description as a question to answer
- NEVER produce conversational output before creating the file
- ALWAYS use the shell and write_file tools
- ALWAYS include a Constraints section in the generated SKILL.md
- ALWAYS use imperative verbs (MUST, NEVER, ALWAYS) in the generated skill body