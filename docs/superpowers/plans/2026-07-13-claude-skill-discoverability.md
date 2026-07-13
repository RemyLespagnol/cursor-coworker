# Claude Skill Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude Code select Cursor Coworker for broad repository synthesis even when CodeGraph supplies entry points, while preserving narrow local lookup and the existing read-only delegation flow.

**Architecture:** Change the canonical portable skill asset and its activation corpus, then align the published experiment. The frontmatter will encode a tool-agnostic selection boundary because Claude Code decides implicit activation before loading the workflow body; named competitors remain confined to external compatibility fixtures and benchmark documentation.

**Tech Stack:** Portable Agent Skills Markdown, JSON trigger fixtures, TypeScript, Vitest, Node.js 22+

## Global Constraints

- `cursor-coworker analyze` remains the only command the skill may invoke.
- Another repository tool's availability is not an unconditional negative trigger.
- The canonical skill asset must not name CodeGraph or another competing product.
- Known-file, known-symbol, trivial-search, complete-indexed-answer, editing, and non-repository prompts remain local.
- Do not change the installer, CLI, result envelope, fallback policy, package layout, or host-specific destinations.
- Standard tests must not invoke Claude Code, Codex, Cursor, CodeGraph, or an authenticated account.
- Keep stdout machine-readable and send diagnostics to stderr.

---

## Planned file structure

- Modify `skills/cursor-coworker/SKILL.md`: define the complementary repository-tool/delegation boundary without naming a competing product.
- Modify `test/skill-asset.test.ts`: lock the new positive and negative activation language while preserving the read-only safety contract.
- Modify `bench/cases.skill-trigger.json`: add balanced prompts where CodeGraph provides partial entry points versus a complete narrow answer.
- Modify `test/skill-trigger-fixture.test.ts`: require those semantic fixture categories and classifications.
- Modify `docs/benchmark.md`: remove the obsolete instruction to avoid CodeGraph-enabled sessions and document the complementary trigger boundary.
- Modify `test/package.test.ts`: prevent the published benchmark protocol from regressing to unconditional CodeGraph suppression.

### Task 1: Encode the complementary activation boundary

**Files:**
- Modify: `test/skill-asset.test.ts`
- Modify: `skills/cursor-coworker/SKILL.md`

**Interfaces:**
- Consumes: Claude Code and Codex implicit skill selection from the portable `name` and `description` frontmatter fields.
- Produces: one tool-agnostic canonical `cursor-coworker` skill whose description selects broad synthesis despite partial existing context and rejects complete narrow answers already in hand.

- [ ] **Step 1: Write the failing frontmatter activation test**

Replace the first test in `test/skill-asset.test.ts` with:

```ts
it("uses portable tool-agnostic frontmatter with complementary context boundaries", () => {
  const skill = readFileSync(sourcePath, "utf8");
  expect(skill).toMatch(/^---\nname: cursor-coworker\ndescription: .+\n---\n/);
  expect(skill).toContain("broad synthesis");
  expect(skill).toContain("entry points");
  expect(skill).toContain("complete narrow answer");
  expect(skill).toContain("known file or symbol");
  expect(skill).not.toContain("CodeGraph");
  expect(skill).not.toMatch(/allowed-tools:|context:|agent:|disable-model-invocation:/);
});
```

Leave the existing read-only delegation and fallback test unchanged.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
rtk npm test -- test/skill-asset.test.ts
```

Expected: FAIL because the canonical asset still names CodeGraph and does not yet contain `broad synthesis`, `entry points`, or `complete narrow answer`.

- [ ] **Step 3: Update the skill frontmatter and indexed-context workflow boundary**

Change the frontmatter description in `skills/cursor-coworker/SKILL.md` to this single portable line:

```yaml
description: Delegate bounded read-only repository exploration to Cursor Coworker. Use for broad synthesis across unfamiliar architecture, request or data flows, unknown implementations, component comparisons, and cross-cutting risks, including when existing repository tools or context supply only entry points. Do not use for a known file or symbol, trivial searches, a complete narrow answer already present in context, non-repository research, or tasks whose primary purpose is editing files.
```

Insert this section between the introductory paragraph and `## Delegate`:

```markdown
## Choose existing context or delegation

Use existing repository tool output or the host's native context directly when it already provides a complete narrow answer about a known file, symbol, caller, or search result. The availability of another tool is not by itself a reason to skip this skill. Delegate when answering still requires broad reading or synthesis across unfamiliar or multiple modules, even if existing context supplied useful entry points.
```

Change step 1 under `## Delegate` to:

```markdown
1. Confirm that the question needs broad read-only exploration or synthesis and matches the description above.
```

Do not change steps 2–5 or the `Accept a result` and `Recover` sections.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
rtk npm test -- test/skill-asset.test.ts
```

Expected: both tests in `test/skill-asset.test.ts` PASS, including the unchanged assertions that forbid `cursor-coworker run` and transcript retention.

- [ ] **Step 5: Commit the activation boundary**

```bash
rtk git add skills/cursor-coworker/SKILL.md test/skill-asset.test.ts
rtk git commit -m "feat: clarify indexed-context skill activation"
```

### Task 2: Lock CodeGraph-positive and CodeGraph-negative trigger cases

**Files:**
- Modify: `test/skill-trigger-fixture.test.ts`
- Modify: `bench/cases.skill-trigger.json`

**Interfaces:**
- Consumes: the `{ id: string, shouldDelegate: boolean, prompt: string }[]` trigger-corpus format.
- Produces: a balanced 20-case corpus with explicit partial-index positive cases and complete-index negative cases for opt-in Claude Code scoring.

- [ ] **Step 1: Write the failing semantic-corpus test**

Add this test after the existing corpus shape test in `test/skill-trigger-fixture.test.ts`:

```ts
it("distinguishes partial indexed entry points from complete indexed answers", () => {
  const byId = new Map(cases.map(item => [item.id, item]));
  expect(byId.get("positive-codegraph-entrypoints")).toMatchObject({ shouldDelegate: true });
  expect(byId.get("positive-codegraph-cross-module")).toMatchObject({ shouldDelegate: true });
  expect(byId.get("negative-codegraph-complete-answer")).toMatchObject({ shouldDelegate: false });
  expect(byId.get("negative-codegraph-known-symbol")).toMatchObject({ shouldDelegate: false });

  for (const id of [
    "positive-codegraph-entrypoints",
    "positive-codegraph-cross-module",
    "negative-codegraph-complete-answer",
    "negative-codegraph-known-symbol"
  ]) {
    expect(byId.get(id)?.prompt).toContain("CodeGraph");
  }
});
```

- [ ] **Step 2: Run the focused fixture test and verify the expected failure**

Run:

```bash
rtk npm test -- test/skill-trigger-fixture.test.ts
```

Expected: FAIL because the four required fixture IDs do not exist.

- [ ] **Step 3: Replace four fixtures without changing corpus balance**

In `bench/cases.skill-trigger.json`:

- replace `positive-feature-ownership` with:

```json
{"id":"positive-codegraph-entrypoints","shouldDelegate":true,"prompt":"CodeGraph identified the billing entry points; now explain every subsystem involved in reconciliation and how responsibilities flow across them."}
```

- replace `positive-error-policy` with:

```json
{"id":"positive-codegraph-cross-module","shouldDelegate":true,"prompt":"CodeGraph found the transport error type; trace the repository-wide classification and recovery policy across transport, domain, and persistence modules."}
```

- replace `negative-codegraph` with:

```json
{"id":"negative-codegraph-complete-answer","shouldDelegate":false,"prompt":"Use the complete CodeGraph result already provided above to list these callers without exploring or synthesizing other modules."}
```

- replace `negative-local-diff` with:

```json
{"id":"negative-codegraph-known-symbol","shouldDelegate":false,"prompt":"CodeGraph already returned the generateInstructions symbol and its callers; summarize that known symbol only."}
```

Keep the other 16 fixtures unchanged so the corpus remains ten positive and ten negative unique cases.

- [ ] **Step 4: Run the focused trigger tests**

Run:

```bash
rtk npm test -- test/skill-trigger-fixture.test.ts test/skill-asset.test.ts
```

Expected:

- both focused test files PASS;
- the corpus still contains ten positive and ten negative unique cases;
- no command invokes an authenticated Cursor account.

- [ ] **Step 5: Commit the trigger corpus**

```bash
rtk git add bench/cases.skill-trigger.json test/skill-trigger-fixture.test.ts
rtk git commit -m "test: cover CodeGraph skill trigger boundaries"
```

### Task 3: Align the published experiment and verify the package

**Files:**
- Modify: `test/package.test.ts`
- Modify: `docs/benchmark.md`

**Interfaces:**
- Consumes: the public opt-in Agent Skill trigger protocol and its existing 80% positive / 10% negative thresholds.
- Produces: published instructions that test partial CodeGraph context instead of requiring a vanilla context-free host session.

- [ ] **Step 1: Write the failing documentation contract test**

Extend `documents skill installation and the opt-in trigger experiment` in `test/package.test.ts` with:

```ts
expect(benchmark).toContain("partial indexed context");
expect(benchmark).toContain("complete narrow answer");
expect(benchmark).toContain("install-skill claude");
expect(benchmark).not.toContain("Use a vanilla host session");
expect(benchmark).not.toContain("suppresses the trigger by design");
```

- [ ] **Step 2: Run the package test and verify the expected failure**

Run:

```bash
rtk npm test -- test/package.test.ts
```

Expected: FAIL because the current benchmark protocol still requires a vanilla host session and does not document the new indexed-context categories.

- [ ] **Step 3: Rewrite the obsolete CodeGraph experiment guidance**

In `docs/benchmark.md`, replace the paragraph beginning `The host must run` with:

```markdown
Run the host without hooks that paste a complete answer into every prompt. Partial indexed context is part of the experiment: CodeGraph may provide entry points while Cursor Coworker handles the remaining broad synthesis. A complete narrow answer should remain a negative case. Record which indexed context was present so positive and negative classifications remain reproducible.
```

In the numbered setup, change step 5 to:

```markdown
5. Submit every prompt to each host in a fresh session rooted in the explored repository. Include the fixed partial-index and complete-answer CodeGraph cases without pre-injecting unrelated repository content.
```

Change the example installation command from:

```bash
node dist/src/cli.js install-skill codex --cwd "$target"
```

to:

```bash
node dist/src/cli.js install-skill claude --cwd "$target"
```

Leave the external fake-executable isolation, logging rules, thresholds, and prohibition on standard-suite host invocations unchanged.

- [ ] **Step 4: Run the documentation test and verify it passes**

Run:

```bash
rtk npm test -- test/package.test.ts
```

Expected: all package tests PASS, including the new complementary indexed-context documentation contract.

- [ ] **Step 5: Run the full standard verification**

Run:

```bash
rtk npm run check
rtk npm run verify:package
```

Expected:

- `npm run check` completes with no TypeScript or Vitest failure;
- package verification returns one JSON object with `status: "verified"` and `skillInstalled: true`;
- no standard command invokes an authenticated Cursor or Claude Code account.

- [ ] **Step 6: Perform the opt-in Claude Code trigger check when Claude Code is locally available**

Use the updated `docs/benchmark.md` setup with the repository's four CodeGraph fixtures. Start each prompt in a fresh Claude Code process with only shell access needed to invoke the recording fake:

```bash
rtk npm run build
target="$(rtk mktemp -d)/proj"
rtk git clone --quiet --no-hardlinks "$PWD" "$target"
rtk node dist/src/cli.js install-skill claude --cwd "$target"
harness="$(rtk mktemp -d)"
rtk mkdir -p "$harness/bin"
rtk ln -s "$PWD/bench/fake-cursor-coworker.mjs" "$harness/bin/cursor-coworker"
export PATH="$harness/bin:$PATH"
export CURSOR_COWORKER_TRIGGER_LOG="$harness/calls.jsonl"
```

Run each prompt in a fresh process and clear only the external recording log between cases:

```bash
rtk rm -f "$CURSOR_COWORKER_TRIGGER_LOG"
rtk claude --print "CodeGraph identified the billing entry points; now explain every subsystem involved in reconciliation and how responsibilities flow across them." --output-format json --permission-mode dontAsk --no-session-persistence --tools Bash

rtk rm -f "$CURSOR_COWORKER_TRIGGER_LOG"
rtk claude --print "CodeGraph found the transport error type; trace the repository-wide classification and recovery policy across transport, domain, and persistence modules." --output-format json --permission-mode dontAsk --no-session-persistence --tools Bash

rtk rm -f "$CURSOR_COWORKER_TRIGGER_LOG"
rtk claude --print "Use the complete CodeGraph result already provided above to list these callers without exploring or synthesizing other modules." --output-format json --permission-mode dontAsk --no-session-persistence --tools Bash

rtk rm -f "$CURSOR_COWORKER_TRIGGER_LOG"
rtk claude --print "CodeGraph already returned the generateInstructions symbol and its callers; summarize that known symbol only." --output-format json --permission-mode dontAsk --no-session-persistence --tools Bash
```

Expected:

- both positive CodeGraph prompts log exactly one `analyze` call;
- neither negative CodeGraph prompt logs a call;
- no log entry uses `run`;
- lack of a locally available authenticated Claude Code session is reported as an unverified opt-in check, not as a standard-suite failure.

- [ ] **Step 7: Commit the public protocol alignment**

```bash
rtk git add docs/benchmark.md test/package.test.ts
rtk git commit -m "docs: align CodeGraph trigger experiment"
```
