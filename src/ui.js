import * as readline from 'node:readline/promises';
import { join } from 'node:path';
import { ClaudeAgent, CodexAgent } from './agents/index.js';
import { Orchestrator } from './orchestrator.js';
import { registerBuiltinRoutes, registerRoute, dispatch, parseREPLInput } from './dispatcher.js';
import * as c from './colors.js';

function printBanner() {
  console.log(c.bold('\n  Omni CLI v0.1.0'));
  console.log(c.dim('  Multi-Agent Development Tool\n'));
  console.log(c.dim('  Routes:'));
  console.log(`    ${c.claude('@claude')} <prompt>  Send to Claude Code`);
  console.log(`    ${c.codex('@codex')}  <prompt>  Send to Codex CLI`);
  console.log(`    ${c.system('@plan')}   <prompt>  Codex plans, Claude implements`);
  console.log(`    ${c.system('@reverse')}<prompt>  Claude plans, Codex implements`);
  console.log(`    ${c.system('@both')}   <prompt>  Ask both agents`);
  console.log(`    ${c.system('@eval')}   <skill>   Run eval suite for a skill`);
  console.log(`    ${c.system('@auto')}   <task>    Auto-select best skill, implement`);
  console.log(`    ${c.dim('sessions')}          Show active session IDs`);
  console.log(`    ${c.dim('new')}               Start fresh sessions`);
  console.log(`    ${c.dim('help')}              Show commands`);
  console.log(`    ${c.dim('quit')}              Exit\n`);
}

function printSessions(orch) {
  const s = orch.getSessions();
  console.log(c.bold('\n  Active Sessions:'));
  console.log(`    Claude:  ${s.claude ? c.claude(s.claude) : c.dim('(none)')}`);
  console.log(`    Codex:   ${s.codex ? c.codex(s.codex) : c.dim('(none)')}`);
  console.log('');
}

function sessionIndicator(orch) {
  const s = orch.getSessions();
  const parts = [];
  if (s.claude) parts.push('C');
  if (s.codex) parts.push('X');
  return parts.length > 0 ? `[${parts.join('+')}] ` : '';
}

async function processLine(input, orch) {
  if (input === 'help') {
    printBanner();
    return true;
  }
  if (input === 'sessions') {
    printSessions(orch);
    return true;
  }
  if (input === 'new') {
    orch.resetSessions();
    console.log(c.system('  Sessions reset. Starting fresh.\n'));
    return true;
  }
  if (input === 'quit' || input === 'exit') {
    return false;
  }

  try {
    const { route, prompt } = parseREPLInput(input);
    await dispatch(route, prompt, orch);
  } catch (err) {
    console.log(c.error(`\nError: ${err.message}`));
    console.log(c.footer());
  }
  return true;
}

function registerEvalRoutes(cwd) {
  const skillsDir = join(import.meta.dirname, '..', 'skills');
  const evalsDir = join(import.meta.dirname, '..', 'evals');

  registerRoute('eval', async (prompt, orch) => {
    const { loadSkill } = await import('./skills/loader.js');
    const { runEvalSuite } = await import('./evals/runner.js');
    const { printSummaryTable, writeResultsJSON } = await import('./evals/reporter.js');

    const skillId = prompt.trim().split(/\s+/)[0];
    const skill = await loadSkill(join(skillsDir, `${skillId}.json`));
    const suitePath = join(evalsDir, skillId, 'suite.json');

    console.log(c.header('Eval', skill.name));
    const results = await runEvalSuite(skill, suitePath, orch, { cwd });
    printSummaryTable(skill, results);
    await writeResultsJSON(skill, results, cwd);
    console.log(c.footer());
  }, 'Run eval suite for a skill');

  registerRoute('auto', async (prompt, orch) => {
    console.log(c.header('Auto', 'Selecting best skill'));
    const result = await orch.autoImplement(prompt, {
      skillsDir,
      evalsDir,
      onPhase: (phase, detail) => {
        if (phase === 'evaluating') {
          console.log(c.dim(`  Evaluating: ${detail}`));
        } else if (phase === 'winner') {
          console.log(`\n  ${c.bold('Winner:')} ${c.system(detail)}\n`);
        } else if (phase === 'implementing') {
          console.log(c.footer());
          console.log(c.header('Claude', `Implementing with: ${detail}`));
        }
      },
      onData: (text) => process.stdout.write(text),
    });
    console.log(c.footer());
    return result;
  }, 'Auto-select best skill, then implement');
}

export async function startUI(options = {}) {
  const cwd = options.cwd || process.cwd();
  const claude = new ClaudeAgent({ cwd });
  const codex = new CodexAgent({ cwd });
  const orch = new Orchestrator({ claude, codex });

  registerBuiltinRoutes();
  registerEvalRoutes(cwd);

  printBanner();

  process.on('SIGINT', () => {
    orch.killAll();
    console.log(c.dim('\nInterrupted.'));
    process.exit(0);
  });

  if (process.stdin.isTTY) {
    // Interactive mode: prompt for each line
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let running = true;
    while (running) {
      let input;
      try {
        const indicator = sessionIndicator(orch);
        input = await rl.question(`${c.dim(indicator)}${c.prompt()}`);
      } catch {
        break;
      }

      input = input.trim();
      if (!input) continue;

      running = await processLine(input, orch);
    }

    rl.close();
  } else {
    // Piped mode: collect all input lines first, then process sequentially.
    // This avoids readline closing on EOF before async commands finish.
    const rl = readline.createInterface({ input: process.stdin });
    const lines = [];
    rl.on('line', (line) => lines.push(line));
    await new Promise((resolve) => rl.on('close', resolve));

    for (const line of lines) {
      const input = line.trim();
      if (!input) continue;
      const shouldContinue = await processLine(input, orch);
      if (!shouldContinue) break;
    }
  }

  console.log(c.dim('Goodbye.\n'));
  process.exit(0);
}
