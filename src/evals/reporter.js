/**
 * Eval result reporting — terminal table and JSON artifacts.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as c from '../colors.js';

/**
 * Print a compact summary table to the terminal.
 */
export function printSummaryTable(skill, results) {
  const { cases, aggregate } = results;

  console.log('');
  console.log(c.bold(`  Eval Results: ${skill.name} (${skill.id})`));
  console.log(c.dim(`  ${'─'.repeat(50)}`));

  // Header
  console.log(
    `  ${pad('Case', 30)} ${pad('Score', 8)} ${pad('Checks', 10)} ${pad('Time', 10)}`
  );
  console.log(`  ${c.dim('─'.repeat(58))}`);

  for (const cs of cases) {
    const icon = cs.error ? '✗' : cs.scoring.score >= 0.5 ? '✓' : '✗';
    const color = cs.scoring.score >= 0.5 ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    const checksStr = cs.error
      ? 'ERR'
      : `${cs.checks.filter((ch) => ch.passed).length}/${cs.checks.length}`;

    const timeStr = cs.durationMs ? `${(cs.durationMs / 1000).toFixed(1)}s` : '-';

    console.log(
      `  ${color}${icon}${reset} ${pad(cs.name, 29)} ${pad(String(cs.scoring.score), 8)} ${pad(checksStr, 10)} ${pad(timeStr, 10)}`
    );

    // Show failed checks
    if (cs.checks) {
      for (const ch of cs.checks) {
        if (!ch.passed) {
          console.log(`    ${c.dim('└')} ${c.error(ch.detail)}`);
        }
      }
    }

    if (cs.error) {
      console.log(`    ${c.dim('└')} ${c.error(cs.error)}`);
    }

    if (cs.judgeReason) {
      console.log(`    ${c.dim('└ Judge:')} ${c.dim(cs.judgeReason)}`);
    }
  }

  console.log(`  ${c.dim('─'.repeat(58))}`);

  const scoreColor = aggregate.totalScore >= 0.5 ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(
    `  ${c.bold('Total:')} ${scoreColor}${aggregate.totalScore}${reset}  ` +
    `${c.dim(`(${aggregate.passed} passed, ${aggregate.failed} failed, ${aggregate.count} total)`)}`
  );
  console.log('');
}

/**
 * Write machine-readable JSON results to .omni/evals/<timestamp>/.
 */
export async function writeResultsJSON(skill, results, cwd) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(cwd, '.omni', 'evals', `${skill.id}-${timestamp}`);
  await mkdir(dir, { recursive: true });

  const artifact = {
    skill: skill.id,
    timestamp: new Date().toISOString(),
    aggregate: results.aggregate,
    cases: results.cases.map((cs) => ({
      name: cs.name,
      task: cs.task,
      score: cs.scoring.score,
      breakdown: cs.scoring.breakdown,
      checks: cs.checks,
      judgeScore: cs.judgeScore,
      judgeReason: cs.judgeReason,
      durationMs: cs.durationMs,
      error: cs.error || null,
    })),
  };

  const outPath = join(dir, 'results.json');
  await writeFile(outPath, JSON.stringify(artifact, null, 2));
  console.log(c.dim(`  Results saved to ${outPath}`));

  return outPath;
}

// ── helpers ──────────────────────────────────────────────────────────

function pad(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}
