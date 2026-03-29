/**
 * Eval suite runner.
 *
 * Loads a suite definition, runs each case in an isolated workspace,
 * executes deterministic checks, optionally runs an LLM judge,
 * and returns scored results.
 */
import { readFile, mkdir, cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { renderPrompt } from '../skills/loader.js';
import { runCheck } from './checks.js';
import { scoreCase, aggregateScores, buildJudgePrompt } from './scoring.js';

/**
 * Run a full eval suite for a skill.
 *
 * @param {Object} skill      - Loaded skill manifest
 * @param {string} suitePath  - Path to suite.json
 * @param {Object} orch       - Orchestrator instance
 * @param {Object} options    - { cwd, useJudge? }
 * @returns {{ cases: Array, aggregate: Object }}
 */
export async function runEvalSuite(skill, suitePath, orch, options = {}) {
  const raw = await readFile(suitePath, 'utf-8');
  const suite = JSON.parse(raw);

  const cases = suite.cases || [];
  const results = [];

  for (const caseDef of cases) {
    const caseResult = await runCase(skill, caseDef, orch, options);
    results.push(caseResult);
  }

  const caseScores = results.map((r) => r.scoring);
  const aggregate = aggregateScores(caseScores);

  return { cases: results, aggregate, skill: skill.id, suite: suitePath };
}

/**
 * Run a single eval case in an isolated workspace.
 */
async function runCase(skill, caseDef, orch, options = {}) {
  const cwd = options.cwd || process.cwd();
  const workDir = await createCaseWorkspace(caseDef, cwd);

  try {
    // Render the prompt for this case
    const prompt = renderPrompt(skill, caseDef.task);

    // Run the agent
    const startTime = Date.now();
    const agentMethod = skill.targetAgent === 'claude' ? 'routeToClaude' : 'routeToCodex';
    const result = await orch[agentMethod](prompt, {
      cwd: workDir,
      allowTools: skill.allowTools ?? true,
      readOnly: skill.targetAgent === 'codex' && !skill.allowTools,
    });
    const durationMs = Date.now() - startTime;

    // Run deterministic checks
    const checks = [];
    for (const check of caseDef.expectedChecks || []) {
      const checkResult = await runCheck(check, result, workDir);
      checks.push({ ...check, ...checkResult });
    }

    // Optional LLM judge
    let judgeScore = null;
    let judgeReason = null;
    if (options.useJudge !== false && caseDef.judgePrompt) {
      const judgeResult = await runJudge(caseDef, result.output, orch);
      judgeScore = judgeResult.score;
      judgeReason = judgeResult.reason;
    }

    const scoring = scoreCase({ checks, judgeScore, judgeReason }, caseDef);

    return {
      name: caseDef.name,
      task: caseDef.task,
      agentResult: result,
      checks,
      judgeScore,
      judgeReason,
      scoring,
      durationMs,
      workDir,
    };
  } catch (err) {
    return {
      name: caseDef.name,
      task: caseDef.task,
      error: err.message,
      checks: [],
      scoring: { score: 0, breakdown: { checkScore: 0, judgeScore: null } },
      durationMs: 0,
      workDir,
    };
  }
}

/**
 * Create an isolated temp directory for a case, optionally copying fixtures.
 */
async function createCaseWorkspace(caseDef, baseCwd) {
  const workDir = await mkdtemp(join(tmpdir(), 'omni-eval-'));

  if (caseDef.fixtures) {
    const fixturesPath = join(baseCwd, caseDef.fixtures);
    if (existsSync(fixturesPath)) {
      await cp(fixturesPath, workDir, { recursive: true });
    }
  }

  return workDir;
}

/**
 * Run the LLM judge to get a qualitative score.
 */
async function runJudge(caseDef, agentOutput, orch) {
  const judgePrompt = buildJudgePrompt(caseDef, agentOutput);

  try {
    const result = await orch.routeToClaude(judgePrompt, { allowTools: false });
    const parsed = JSON.parse(result.output);
    return {
      score: Math.min(1, Math.max(0, (parsed.score || 0) / 10)),
      reason: parsed.reason || '',
    };
  } catch {
    return { score: null, reason: 'Judge failed to parse' };
  }
}
