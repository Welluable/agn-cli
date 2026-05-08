## Example 1: Procedural skill (step-based)

```markdown
---
name: git-commit
description: >
  Git commit conventions. Use when the user mentions commit,
  git commit, or commit message.
---

# Git Commit Conventions

You MUST follow these rules for every commit.

## Steps
1. Run `git diff --cached` to see staged changes.
2. Write a commit message following conventional commits format: `type(scope): description`.
3. Use `git commit -m "..."` to commit.

## Constraints
- NEVER use `git commit` without a message
- NEVER commit unrelated changes together
- ALWAYS use lowercase for the type prefix
```

## Example 2: Convention skill (rules-based)

```markdown
---
name: api-design
description: >
  REST API design conventions. Use when the user mentions API,
  endpoint, REST, or route design.
---

# API Design Conventions

## Rules
- ALWAYS use plural nouns for resources (`/users`, not `/user`)
- ALWAYS return consistent error shapes: `{ error: string, code: number }`
- Use HTTP status codes correctly: 201 for creation, 404 for not found, 422 for validation
- NEVER nest resources more than 2 levels deep (`/users/:id/posts` is fine, `/users/:id/posts/:id/comments/:id` is not)

## Constraints
- Do NOT use verbs in URLs (`/getUsers` is wrong, `/users` with GET is right)
- Do NOT return raw database errors to the client
```

## Example 3: Knowledge skill (reference + constraints)

```markdown
---
name: testing
description: >
  Testing conventions and standards. Use when the user mentions
  test, testing, unit test, integration test, or test coverage.
---

# Testing Standards

## Rules
- ALWAYS write tests alongside new features — never defer to "later"
- Use `describe` blocks to group related tests and `it` blocks for individual cases
- Name tests as behaviors: `it("returns 404 when user not found")` not `it("test 1")`
- ALWAYS test edge cases: empty input, null, boundary values, error paths

## Structure
1. Arrange — set up test data and mocks
2. Act — call the function or endpoint under test
3. Assert — verify the expected outcome

## Constraints
- NEVER mock what you don't own (mock your adapters, not third-party internals)
- NEVER write tests that depend on execution order
- Do NOT test implementation details — test behavior and outputs
```
