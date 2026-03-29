import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase, aggregateScores, buildJudgePrompt } from '../src/evals/scoring.js';

describe('scoreCase', () => {
  it('scores 1.0 when all checks pass and no judge', () => {
    const result = scoreCase(
      { checks: [{ passed: true }, { passed: true }] },
      {}
    );
    assert.equal(result.score, 1);
  });

  it('scores 0.0 when all checks fail and no judge', () => {
    const result = scoreCase(
      { checks: [{ passed: false }, { passed: false }] },
      {}
    );
    assert.equal(result.score, 0);
  });

  it('scores 0.5 when half checks pass and no judge', () => {
    const result = scoreCase(
      { checks: [{ passed: true }, { passed: false }] },
      {}
    );
    assert.equal(result.score, 0.5);
  });

  it('combines check and judge scores with weights', () => {
    const result = scoreCase(
      { checks: [{ passed: true }], judgeScore: 0.8 },
      { weights: { checks: 0.6, judge: 0.4 } }
    );
    // 0.6 * 1.0 + 0.4 * 0.8 = 0.92
    assert.equal(result.score, 0.92);
  });

  it('uses default weights when not specified', () => {
    const result = scoreCase(
      { checks: [{ passed: true }], judgeScore: 1.0 },
      {}
    );
    // 0.7 * 1.0 + 0.3 * 1.0 = 1.0
    assert.equal(result.score, 1);
  });

  it('scores 1.0 when no checks and no judge', () => {
    const result = scoreCase({ checks: [] }, {});
    assert.equal(result.score, 1);
  });
});

describe('aggregateScores', () => {
  it('averages scores across cases', () => {
    const agg = aggregateScores([{ score: 1.0 }, { score: 0.5 }, { score: 0.0 }]);
    assert.equal(agg.totalScore, 0.5);
    assert.equal(agg.count, 3);
    assert.equal(agg.passed, 2); // 1.0 and 0.5 are >= 0.5
    assert.equal(agg.failed, 1);
  });

  it('handles empty array', () => {
    const agg = aggregateScores([]);
    assert.equal(agg.totalScore, 0);
    assert.equal(agg.count, 0);
  });

  it('handles all passing', () => {
    const agg = aggregateScores([{ score: 1.0 }, { score: 0.8 }]);
    assert.equal(agg.passed, 2);
    assert.equal(agg.failed, 0);
  });
});

describe('buildJudgePrompt', () => {
  it('includes the task and agent output', () => {
    const prompt = buildJudgePrompt(
      { task: 'fix the bug', judgePrompt: 'Rate quality 0-10.' },
      'I fixed it by changing line 5.'
    );
    assert.ok(prompt.includes('fix the bug'));
    assert.ok(prompt.includes('I fixed it by changing line 5.'));
    assert.ok(prompt.includes('Rate quality 0-10.'));
    assert.ok(prompt.includes('JSON'));
  });

  it('uses a default judge prompt when none specified', () => {
    const prompt = buildJudgePrompt({ task: 'do thing' }, 'output');
    assert.ok(prompt.includes('Rate the quality'));
  });
});
