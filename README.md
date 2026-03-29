# Omni CLI

Multi-agent CLI orchestrator for **Claude Code**, **Codex CLI**, and **Gemini CLI**, with a built-in **Skill Lab** for defining reusable coding skills, evaluating them with automated suites, and auto-selecting the best skill for any task.

Zero runtime dependencies. Built entirely on Node.js built-in modules.

## Prerequisites

- **Node.js 18+**
- At least one of the following agent CLIs installed and on your PATH:
  - [Claude Code](https://claude.ai/code) (`claude`)
  - [Codex CLI](https://github.com/openai/codex) (`codex`)
  - [Gemini CLI](https://github.com/google/gemini-cli) (`gemini`)

Omni CLI auto-detects which CLIs are available at startup and only enables routes for installed agents.

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
| `@gemini <prompt>` | Send to Gemini CLI |
| `@plan <task>` | Codex plans, Claude implements |
| `@reverse <task>` | Claude plans, Codex implements |
| `@both <prompt>` | Ask Claude and Codex in parallel |
| `@all <prompt>` | Ask all available agents in parallel |
| `@eval <skill-id>` | Run eval suite for a skill |
| `@auto <task>` | Auto-select best skill, then implement |

Additional REPL commands: `sessions`, `new`, `help`, `quit`.

If you type a prompt without a route prefix, it defaults to the preferred agent (Claude by default).

## Non-Interactive CLI Commands

```bash
omni skills list                      # List available skills
omni eval <skill-id>                  # Run eval suite for a skill
omni implement <skill-id> "<task>"    # Run a skill against a task
omni auto "<task>"                    # Auto-select best skill, implement
```

## Agent Detection at Startup

On launch, Omni CLI runs `which` for each agent binary (`claude`, `codex`, `gemini`) and attempts to read the version via `--version`. The REPL banner displays each agent's status:

- **ready** -- CLI found on PATH with version detected
- **not found** -- CLI not installed or not on PATH
- **disabled** -- explicitly disabled via configuration

Only agents marked "ready" are available for routing. Attempting to route to an unavailable agent produces a descriptive error with installation hints.

## Configuration

Omni CLI loads configuration from two sources (in priority order):

1. **`.omnirc.json`** in the current working directory
2. **Environment variables**

### .omnirc.json Format

```json
{
  "preferredAgent": "claude",
  "judgeAgent": "claude",
  "disableAgents": [],
  "agents": {
    "claude": {},
    "codex": {},
    "gemini": {}
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `preferredAgent` | string | `"claude"` | Default agent when no `@agent` prefix is given |
| `judgeAgent` | string | `"claude"` | Agent used for LLM judge scoring in evals |
| `disableAgents` | string[] | `[]` | Agent names to disable even if installed |
| `agents` | object | `{}` | Per-agent configuration (reserved for future use) |

### Environment Variables

| Variable | Equivalent `.omnirc.json` field |
|----------|---------------------------------|
| `OMNI_PREFERRED_AGENT` | `preferredAgent` |
| `OMNI_JUDGE_AGENT` | `judgeAgent` |
| `OMNI_DISABLE_AGENTS` | `disableAgents` (comma-separated, e.g. `"codex,gemini"`) |

File values take precedence over environment variables.

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
- `id` -- Unique identifier (matches filename)
- `name` -- Human-readable name
- `targetAgent` -- `"claude"`, `"codex"`, or `"gemini"`
- `systemPrompt` -- The system instructions for the agent
- `taskTemplate` -- Prompt template with `{{task}}` placeholder
- `allowTools` -- Whether the agent can use tools (default: true)
- `defaultEvalSuite` -- Which eval suite to run for this skill

### Built-in Skills

| Skill | Agent | Purpose |
|-------|-------|---------|
| `planner` | Codex | Creates detailed implementation plans |
| `bugfixer` | Claude | Diagnoses and fixes bugs with minimal changes |
| `feature-implementer` | Claude | Builds new features following existing patterns |
| `gemini-planner` | Gemini | Creates implementation plans using Gemini |

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
- `substring` -- Check if output contains a string (`value`, `in`, `negate`)
- `regex` -- Check if output matches a pattern (`pattern`, `flags`, `in`, `negate`)
- `exit_code` -- Check agent exit code (`value`, defaults to 0)
- `file_exists` -- Check if a file was created (`path`)
- `command` -- Run a shell command and check it succeeds (`command`, `args`, `timeout`)

**Scoring:**
Each case gets a score from 0 to 1, combining deterministic checks and an optional LLM judge. The `weights` field controls the balance (default: 70% checks, 30% judge).

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
3. Use the winning skill's prompt to implement the task via the target agent

## Testing

```bash
npm test
```

134 tests covering colors, agent adapters, orchestration, dispatching, events, rendering, configuration, agent detection, skill validation, deterministic checks, and scoring logic. Tests use `node:test` with zero external dependencies.

## Architecture

```
omni-cli/
├── bin/omni.js                # Entry point (config + detection, then REPL or CLI)
├── src/
│   ├── cli.js                 # Non-interactive command handler
│   ├── ui.js                  # Interactive REPL with agent status display
│   ├── dispatcher.js          # Shared route dispatch (@claude, @codex, @gemini, etc.)
│   ├── orchestrator.js        # Agent orchestration, planAndImplement, autoImplement
│   ├── colors.js              # Terminal colors and formatting
│   ├── config.js              # Config loader (.omnirc.json + env vars)
│   ├── events.js              # AgentEvent schema (text_delta, tool_use, etc.)
│   ├── renderer.js            # Claude-Code-like streaming UX renderer
│   ├── stream-mux.js          # Stream multiplexer for parallel agent output
│   ├── agents/
│   │   ├── base.js            # BaseAgent abstract class
│   │   ├── claude.js          # Claude Code adapter
│   │   ├── codex.js           # Codex CLI adapter
│   │   ├── gemini.js          # Gemini CLI adapter
│   │   ├── index.js           # Agent re-exports
│   │   └── detector.js        # Agent CLI detection (which + --version)
│   ├── skills/
│   │   └── loader.js          # Skill manifest loader/validator
│   └── evals/
│       ├── runner.js          # Eval suite runner
│       ├── checks.js          # Deterministic check functions
│       ├── scoring.js         # Two-layer scoring engine (checks + judge)
│       └── reporter.js        # Terminal table + JSON artifact writer
├── skills/                    # Skill manifests (JSON)
│   ├── planner.json
│   ├── bugfixer.json
│   ├── feature-implementer.json
│   └── gemini-planner.json
├── evals/                     # Eval suites per skill
└── test/                      # Tests (node:test, zero dependencies)
```

## Design Principles

- **Zero dependencies** -- Only Node.js built-in modules. No npm packages at runtime or in tests.
- **Agent-agnostic** -- Uniform BaseAgent interface; add new agents by extending the base class.
- **Graceful degradation** -- Works with any subset of agents installed. Missing agents are detected and reported, not crashed on.
- **Streaming UX** -- Real-time output with tool badges, spinners, and color-coded headers (Claude-Code-like experience).
