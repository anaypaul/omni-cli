/**
 * Shared command dispatcher — used by both the REPL and non-interactive CLI.
 */
import * as c from './colors.js';
import { StreamMux } from './stream-mux.js';

const ROUTES = new Map();

export function registerRoute(name, handler, description = '') {
  ROUTES.set(name.toLowerCase(), { handler, description });
}

export function getRoutes() {
  return [...ROUTES.entries()].map(([name, { description }]) => ({ name, description }));
}

export function parseCommand(input) {
  // Non-interactive style: "skills list", "eval planner", "implement planner 'add tests'"
  const parts = input.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(' ').trim();
  return { command, args: rest };
}

export function parseREPLInput(input) {
  const match = input.match(/^@(\w+)\s+([\s\S]+)$/);
  if (match) {
    return { route: match[1].toLowerCase(), prompt: match[2].trim() };
  }
  return { route: 'claude', prompt: input };
}

export async function dispatch(route, prompt, orch, options = {}) {
  const entry = ROUTES.get(route);
  if (!entry) {
    const available = [...ROUTES.keys()].map((r) => `@${r}`).join(', ');
    throw new Error(`Unknown route: @${route}. Available: ${available}`);
  }
  return entry.handler(prompt, orch, options);
}

// ── Built-in route handlers ──────────────────────────────────────────

export function registerBuiltinRoutes() {
  registerRoute('claude', handleClaude, 'Send to Claude Code');
  registerRoute('codex', handleCodex, 'Send to Codex CLI');
  registerRoute('gemini', handleGemini, 'Send to Gemini CLI');
  registerRoute('plan', handlePlan, 'Codex plans, Claude implements');
  registerRoute('reverse', handleReverse, 'Claude plans, Codex implements');
  registerRoute('both', handleBoth, 'Ask both agents');
  registerRoute('all', handleAll, 'Ask all available agents in parallel');
}

async function handleClaude(prompt, orch) {
  console.log(c.header('Claude'));
  const result = await orch.routeTo('claude', prompt, {
    onData: (text) => process.stdout.write(text),
    allowTools: true,
  });
  if (!result.output) console.log(c.dim('(no output)'));
  console.log(c.footer());
  return result;
}

async function handleCodex(prompt, orch) {
  console.log(c.header('Codex'));
  const result = await orch.routeTo('codex', prompt, {
    onData: (text) => process.stdout.write(text),
  });
  if (!result.output) console.log(c.dim('(no output)'));
  console.log(c.footer());
  return result;
}

async function handleGemini(prompt, orch) {
  console.log(c.header('Gemini'));
  const result = await orch.routeTo('gemini', prompt, {
    onData: (text) => process.stdout.write(text),
    allowTools: true,
  });
  if (!result.output) console.log(c.dim('(no output)'));
  console.log(c.footer());
  return result;
}

async function handlePlan(prompt, orch) {
  await orch.planAndImplement(prompt, {
    onPhase: (phase) => {
      if (phase === 'planning') {
        console.log(c.header('Codex', 'Planning'));
      } else {
        console.log(c.footer());
        console.log(c.header('Claude', 'Implementing'));
      }
    },
    onPlanData: (text) => process.stdout.write(text),
    onImplData: (text) => process.stdout.write(text),
  });
  console.log(c.footer());
}

async function handleReverse(prompt, orch) {
  await orch.reversePlanAndImplement(prompt, {
    onPhase: (phase) => {
      if (phase === 'planning') {
        console.log(c.header('Claude', 'Planning'));
      } else {
        console.log(c.footer());
        console.log(c.header('Codex', 'Implementing'));
      }
    },
    onPlanData: (text) => process.stdout.write(text),
    onImplData: (text) => process.stdout.write(text),
  });
  console.log(c.footer());
}

async function handleBoth(prompt, orch) {
  const mux = new StreamMux();
  const claudeWriter = mux.createWriter('Claude');
  const codexWriter = mux.createWriter('Codex');

  console.log(c.header('Claude + Codex', 'parallel'));

  const result = await orch.askBoth(prompt, {
    onPhase: () => {},
    onClaudeData: claudeWriter,
    onCodexData: codexWriter,
  });

  mux.flush();
  console.log(c.footer());
  return result;
}

async function handleAll(prompt, orch) {
  const mux = new StreamMux();
  const agentNames = orch.getAvailableAgents();
  const nameMap = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };
  const writers = {};

  for (const name of agentNames) {
    const displayName = nameMap[name] || name;
    writers[name] = mux.createWriter(displayName);
  }

  const label = agentNames.map((n) => nameMap[n] || n).join(' + ');
  console.log(c.header(label, 'parallel'));

  const promises = agentNames.map((name) =>
    orch.routeTo(name, prompt, {
      onData: writers[name],
      allowTools: true,
    })
  );

  const results = await Promise.all(promises);
  const resultMap = {};
  agentNames.forEach((name, i) => {
    resultMap[name] = results[i];
  });

  mux.flush();
  console.log(c.footer());
  return resultMap;
}
