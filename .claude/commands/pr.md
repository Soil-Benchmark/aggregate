You are creating a pull request for the current branch. Work through the steps below in order.

---

## Step 1 — Gather context

Run these in parallel:

```bash
git diff master...HEAD --stat
git log master...HEAD --oneline
git status
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "not pushed"
```

Then read the full diff:

```bash
git diff master...HEAD
```

If `git status` shows uncommitted changes, stop and warn the user before proceeding.

---

## Step 2 — Push and create PR

If the branch is not yet pushed, push it:

```bash
git push -u origin HEAD
```

Write a PR title: imperative mood, under 70 characters, accurately reflects the change.

Create the PR using `gh pr create` with this body format:

```
## What

[2–4 sentences: what changed and why.]

## Changes

[Bulleted list of key changes, grouped by area if helpful.]

## Test plan

[Bulleted checklist of how to verify the change works correctly.]

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Step 3 — Output

After creating the PR, output:

- The PR URL
- Any issues noticed that should be addressed before requesting review
