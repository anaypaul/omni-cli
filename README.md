# Omni CLI

Multi-agent CLI orchestrator for Claude Code and Codex CLI, with a built-in **Skill Lab** for defining reusable coding skills, evaluating them with automated suites, and auto-selecting the best skill for any task.

## Quick Start

```bash
node bin/omni.js            # Interactive REPL
node bin/omni.js help        # Show CLI commands
```

## Interactive REPL Routes

| Route | Description |
|-------|-------------|
| `@claude <prompt>` | Send to Claude Code |
| `@codex <prompt>` | Send to Codex CLI |
| `@plan <task>` | Codex plans, Claude implements |
| `@both <prompt>` | Ask both agents |
| `@eval <skill-id>` | Run eval suite for a skill |
| `@auto <task>` | Auto-select best skill, then implement |

## Non-Interactive CLI Commands

```bash
omni skills list                      # List available skills
omni eval <skill-id>                  # Run eval suite for a skill
omni implement <skill-id> "<task>"    # Run a skill against a task
omni auto "<task>"                    # Auto-select best skill, implement
```

## Skill Lab

### Defining a Skill

Skills are JSON manifests in `skills/`. Each skill defines a reusable prompt pack:

```json
{
  "id": "bugfixer",
  "name": "Bug Fixer",
  "targetAgent": "claude",
  "systemPrompt": "You are a precise bug-fixing agent...",
  "taskTemplate": "Fix the following bug:\n\n{{task}}",
  "allowTools": true,
  "defaultEvalSuite": "bugfixer"
}
```

**Fields:**
- `id` — Unique identifier (matches filename)
- `name` — Human-readable name
- `targetAgent` — `"claude"` or `"codex"`
- `systemPrompt` — The system instructions for the agent
- `taskTemplate` — Prompt template with `{{task}}` placeholder
- `allowTools` — Whether the agent can use tools (default: true)
- `defaultEvalSuite` — Which eval suite to run for this skill

### Built-in Skills

| Skill | Agent | Purpose |
|-------|-------|---------|
| `planner` | Codex | Creates detailed implementation plans |
| `bugfixer` | Claude | Diagnoses and fixes bugs with minimal changes |
| `feature-implementer` | Claude | Builds new features following existing patterns |

### Adding an Eval Suite

Eval suites live in `evals/<skill-id>/suite.json`:

```json
{
  "name": "Bug Fixer Eval Suite",
  "cases": [
    {
      "name": "missing-null-check",
      "task": "Fix the null check in orchestrator.js...",
      "expectedChecks": [
        { "type": "substring", "value": "exitCode", "in": "output" },
        { "type": "regex", "pattern": "(throw|Error)", "in": "output" },
        { "type": "exit_code", "value": 0 }
      ],
      "judgePrompt": "Rate this fix from 0 to 10...",
      "weights": { "checks": 0.5, "judge": 0.5 }
    }
  ]
}
```

**Check Types:**
- `substring` — Check if output contains a string (`value`, `in`, `negate`)
- `regex` — Check if output matches a pattern (`pattern`, `flags`, `in`, `negate`)
- `exit_code` — Check agent exit code (`value`, defaults to 0)
- `file_exists` — Check if a file was created (`path`)
- `command` — Run a shell command and check it succeeds (`command`, `args`, `timeout`)

**Scoring:**
Each case gets a score from 0–1, combining deterministic checks and an optional LLM judge. The `weights` field controls the balance (default: 70% checks, 30% judge).

### Running Evals

```bash
# Run eval suite for the planner skill
omni eval planner

# Output:
#   Eval Results: Implementation Planner (planner)
#   ──────────────────────────────────────────────────
#   Case                           Score    Checks     Time
#   ✓ add-cli-args                 0.85     3/4        12.3s
#   ✓ error-handling               0.92     4/4        8.1s
#   ✗ add-new-route                0.35     1/3        15.2s
#   ──────────────────────────────────────────────────
#   Total: 0.707  (2 passed, 1 failed, 3 total)
```

Results are saved as JSON to `.omni/evals/<skill-id>-<timestamp>/results.json`.

### Auto Mode

`omni auto` evaluates all candidate skills, picks the highest scorer, and uses that skill's prompt template to implement your task:

```bash
omni auto "add a --verbose flag to all CLI commands"
```

This will:
1. Run eval suites for each skill
2. Show scores and pick the winner
3. Use the winning skill's prompt to implement via Claude

## Testing

```bash
npm test
```

43 tests covering skill validation, command parsing, deterministic checks, and scoring logic.

## Architecture

```
omni-cli/
├── bin/omni.js              # Entry point (REPL or CLI)
├── src/
│   ├── cli.js               # Non-interactive command handler
│   ├── ui.js                # Interactive REPL
│   ├── dispatcher.js        # Shared route dispatch
│   ├── orchestrator.js      # Agent orchestration + autoImplement
│   ├── colors.js            # Terminal colors
│   ├── agents/
│   │   ├── claude.js        # Claude Code adapter
│   │   └── codex.js         # Codex CLI adapter
│   ├── skills/
│   │   └── loader.js        # Skill manifest loader/validator
│   └── evals/
│       ├── runner.js         # Eval suite runner
│       ├── checks.js         # Deterministic check functions
│       ├── scoring.js        # Two-layer scoring engine
│       └── reporter.js       # Terminal table + JSON artifacts
├── skills/                   # Skill manifests (JSON)
├── evals/                    # Eval suites per skill
└── test/                     # Tests (node:test)
```

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) CLI installed
- [Codex CLI](https://github.com/openai/codex) installed (for planning)
