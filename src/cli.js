/**
 * Non-interactive CLI subcommand handler.
 *
 * Subcommands:
 *   skills list                     List available skills
 *   eval <skill-id>                 Run eval suite for a skill
 *   implement <skill-id> "<task>"   Run a skill against a task
 *   auto "<task>"                   Eval candidate skills, pick best, implement
 */
import { join } from 'node:path';
import { ClaudeAgent, CodexAgent, GeminiAgent } from './agents/index.js';
import { Orchestrator } from './orchestrator.js';
import { loadAllSkills, loadSkill, renderPrompt } from './skills/loader.js';
import { runEvalSuite } from './evals/runner.js';
import { printSummaryTable, writeResultsJSON } from './evals/reporter.js';
import * as c from './colors.js';

const SKILLS_DIR = join(import.meta.dirname, '..', 'skills');
const EVALS_DIR = join(import.meta.dirname, '..', 'evals');

function usage() {
  console.log(c.bold('\n  Omni CLI — Non-interactive commands\n'));
  console.log('  omni skills list                     List available skills');
  console.log('  omni eval <skill-id>                 Run eval suite for a skill');
  console.log('  omni implement <skill-id> "<task>"   Run a skill against a task');
  console.log('  omni auto "<task>"                   Auto-select best skill, then implement');
  console.log('');
}

export async function runCLI(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const command = args[0]?.toLowerCase();

  try {
    switch (command) {
      case 'skills':
        await cmdSkills(args.slice(1));
        break;
      case 'eval':
        await cmdEval(args.slice(1), cwd);
        break;
      case 'implement':
        await cmdImplement(args.slice(1), cwd);
        break;
      case 'auto':
        await cmdAuto(args.slice(1), cwd);
        break;
      case 'help':
      case '--help':
      case '-h':
        usage();
        break;
      default:
        console.log(c.error(`Unknown command: ${command}`));
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error(c.error(`\nError: ${err.message}`));
    process.exit(1);
  }
}

// ── skills list ──────────────────────────────────────────────────────

async function cmdSkills(args) {
  if (args[0] !== 'list') {
    console.log(c.error('Usage: omni skills list'));
    process.exit(1);
  }
  const skills = await loadAllSkills(SKILLS_DIR);
  if (skills.length === 0) {
    console.log(c.dim('No skills found in skills/ directory.'));
    return;
  }
  console.log(c.bold('\n  Available Skills\n'));
  for (const s of skills) {
    const agentColorFn = { claude: c.claude, codex: c.codex, gemini: c.gemini };
    const colorFn = agentColorFn[s.targetAgent] || c.dim;
    const agent = colorFn(s.targetAgent);
    console.log(`  ${c.bold(s.id)}  ${c.dim(s.name)}  → ${agent}`);
    if (s.defaultEvalSuite) {
      console.log(`    ${c.dim(`eval suite: ${s.defaultEvalSuite}`)}`);
    }
  }
  console.log('');
}

// ── eval <skill-id> ──────────────────────────────────────────────────

async function cmdEval(args, cwd) {
  const skillId = args[0];
  if (!skillId) {
    console.log(c.error('Usage: omni eval <skill-id>'));
    process.exit(1);
  }

  const skillPath = join(SKILLS_DIR, `${skillId}.json`);
  const skill = await loadSkill(skillPath);
  const suitePath = join(EVALS_DIR, skillId, 'suite.json');

  const orch = makeOrchestrator(cwd);
  const results = await runEvalSuite(skill, suitePath, orch, { cwd });

  printSummaryTable(skill, results);
  await writeResultsJSON(skill, results, cwd);
}

// ── implement <skill-id> "<task>" ────────────────────────────────────

async function cmdImplement(args, cwd) {
  const skillId = args[0];
  const task = args.slice(1).join(' ');
  if (!skillId || !task) {
    console.log(c.error('Usage: omni implement <skill-id> "<task>"'));
    process.exit(1);
  }

  const skillPath = join(SKILLS_DIR, `${skillId}.json`);
  const skill = await loadSkill(skillPath);
  const prompt = renderPrompt(skill, task);

  const orch = makeOrchestrator(cwd);

  const displayNames = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };
  const displayName = displayNames[skill.targetAgent] || skill.targetAgent;
  console.log(c.header(displayName, skill.name));
  const result = await orch.routeTo(skill.targetAgent, prompt, {
    onData: (text) => process.stdout.write(text),
    allowTools: skill.allowTools ?? true,
  });
  console.log(c.footer());
  return result;
}

// ── auto "<task>" ────────────────────────────────────────────────────

async function cmdAuto(args, cwd) {
  const task = args.join(' ');
  if (!task) {
    console.log(c.error('Usage: omni auto "<task>"'));
    process.exit(1);
  }

  const orch = makeOrchestrator(cwd);
  const result = await orch.autoImplement(task, {
    skillsDir: SKILLS_DIR,
    evalsDir: EVALS_DIR,
    onPhase: (phase, detail) => {
      if (phase === 'evaluating') {
        console.log(c.header('Eval', `Testing: ${detail}`));
      } else if (phase === 'winner') {
        console.log(c.footer());
        console.log(`\n  ${c.bold('Winner:')} ${c.system(detail)}\n`);
      } else if (phase === 'implementing') {
        console.log(c.header('Claude', `Implementing with: ${detail}`));
      }
    },
    onData: (text) => process.stdout.write(text),
  });

  console.log(c.footer());
  return result;
}

// ── helpers ──────────────────────────────────────────────────────────

function makeOrchestrator(cwd) {
  const claude = new ClaudeAgent({ cwd });
  const codex = new CodexAgent({ cwd });
  const gemini = new GeminiAgent({ cwd });
  return new Orchestrator({ claude, codex, gemini });
}
