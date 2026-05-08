---
name: Create Skill
description: >
    Create a skill file. Use when the user mentions create skill, create a skill, or create a new skill.
---

# Create Skill

Use this skill to create and organize agent skills.

See `reference.md` for the full skill structure and rules.
See `examples.md` for example skill definitions.

# Creating skill flow

If user provided a description, based on the description, generate a skill name and description and what that skill does. If user did not provide a description if the skill is global or project assume it is per project.

1. Create the skill folder with skill structure in the ~/.agn/skills/ or .agn/skills/ directory based on the user's choice.
2. Exit the flow.
3. Let user know the location of the skill folder and the skill file and a summary of the skill.