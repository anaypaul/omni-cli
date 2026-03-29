/**
 * Two-layer scoring: deterministic checks + optional LLM judge.
 */

/**
 * Score a single eval case result.
 *
 * @param {Object} caseResult - { checks: [{ passed, detail }], judgeScore?, judgeReason? }
 * @param {Object} caseDef    - The case definition from suite.json (has weights)
 * @returns {{ score: number, breakdown: Object }}
 */
export function scoreCase(caseResult, caseDef) {
  const weights = caseDef.weights || { checks: 0.7, judge: 0.3 };

  // Deterministic check score (0–1)
  const checks = caseResult.checks || [];
  const checkScore = checks.length > 0
    ? checks.filter((c) => c.passed).length / checks.length
    : 1;

  // LLM judge score (0–1), optional
  const judgeScore = caseResult.judgeScore ?? null;

  let finalScore;
  if (judgeScore !== null) {
    finalScore = weights.checks * checkScore + weights.judge * judgeScore;
  } else {
    // No judge → deterministic checks are 100% of the score
    finalScore = checkScore;
  }

  return {
    score: Math.round(finalScore * 1000) / 1000,
    breakdown: {
      checkScore: Math.round(checkScore * 1000) / 1000,
      judgeScore,
      weights,
    },
  };
}

/**
 * Aggregate scores across all cases in a suite.
 *
 * @param {Array} caseScores - Array of { score, ... } from scoreCase
 * @returns {{ totalScore: number, passed: number, failed: number, count: number }}
 */
export function aggregateScores(caseScores) {
  const count = caseScores.length;
  if (count === 0) return { totalScore: 0, passed: 0, failed: 0, count: 0 };

  const totalScore = caseScores.reduce((sum, c) => sum + c.score, 0) / count;
  const passed = caseScores.filter((c) => c.score >= 0.5).length;
  const failed = count - passed;

  return {
    totalScore: Math.round(totalScore * 1000) / 1000,
    passed,
    failed,
    count,
  };
}

/**
 * Build the judge prompt for optional LLM scoring.
 */
export function buildJudgePrompt(caseDef, agentOutput) {
  const base = caseDef.judgePrompt || 'Rate the quality of this output from 0 to 10.';
  return (
    `${base}\n\n` +
    `## Task\n${caseDef.task}\n\n` +
    `## Agent Output\n${agentOutput}\n\n` +
    `Respond with ONLY a JSON object: { "score": <0-10>, "reason": "<brief explanation>" }`
  );
}
