import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/orchestrator.js';

function createMockAgent(name, output = 'mock output') {
  return {
    name,
    cwd: '/mock',
    sessionId: null,
    _runCalls: [],
    async run(prompt, options = {}) {
      this._runCalls.push({ prompt, options });
      if (options.onData) options.onData(output);
      if (options.onEvent) {
        const events = await import('../src/events.js');
        options.onEvent(events.textDelta(name, output));
        options.onEvent(events.done(name, { output }));
      }
      return { output, stderr: '', exitCode: 0, durationMs: 50, sessionId: `${name}-sess`, agent: name };
    },
    resetSession() { this.sessionId = null; },
    kill() {},
  };
}

describe('Orchestrator Integration: planAndImplement', () => {
  it('calls codex (planner) first with prompt containing "Do NOT make any code changes"', async () => {
    const codex = createMockAgent('codex', 'the plan');
    const claude = createMockAgent('claude', 'the impl');
    const orch = new Orchestrator({ claude, codex });

    await orch.planAndImplement('build feature X');

    assert.equal(codex._runCalls.length, 1);
    assert.ok(
      codex._runCalls[0].prompt.includes('Do NOT make any code changes'),
      'Codex prompt should include "Do NOT make any code changes"'
    );
  });

  it('calls codex with readOnly: true', async () => {
    const codex = createMockAgent('codex', 'the plan');
    const claude = createMockAgent('claude', 'the impl');
    const orch = new Orchestrator({ claude, codex });

    await orch.planAndImplement('build feature X');

    assert.equal(codex._runCalls[0].options.readOnly, true);
  });

  it('calls claude (implementer) second with prompt containing codex output AND original task', async () => {
    const codex = createMockAgent('codex', 'Step 1: do A\nStep 2: do B');
    const claude = createMockAgent('claude', 'done');
    const orch = new Orchestrator({ claude, codex });

    await orch.planAndImplement('build feature X');

    assert.equal(claude._runCalls.length, 1);
    const implPrompt = claude._runCalls[0].prompt;
    assert.ok(implPrompt.includes('Step 1: do A'), 'Claude prompt should contain codex plan output');
    assert.ok(implPrompt.includes('build feature X'), 'Claude prompt should contain original task');
  });

  it('calls claude with allowTools: true', async () => {
    const codex = createMockAgent('codex', 'the plan');
    const claude = createMockAgent('claude', 'the impl');
    const orch = new Orchestrator({ claude, codex });

    await orch.planAndImplement('build feature X');

    assert.equal(claude._runCalls[0].options.allowTools, true);
  });

  it('fires onPhase with planning then implementing in order', async () => {
    const codex = createMockAgent('codex', 'the plan');
    const claude = createMockAgent('claude', 'the impl');
    const orch = new Orchestrator({ claude, codex });

    const phases = [];
    await orch.planAndImplement('task', {
      onPhase: (phase) => phases.push(phase),
    });

    assert.deepEqual(phases, ['planning', 'implementing']);
  });

  it('returns object with plan and implementation keys', async () => {
    const codex = createMockAgent('codex', 'my plan');
    const claude = createMockAgent('claude', 'my impl');
    const orch = new Orchestrator({ claude, codex });

    const result = await orch.planAndImplement('task');

    assert.equal(result.plan, 'my plan');
    assert.equal(result.implementation, 'my impl');
  });

  it('throws error containing "empty plan" when codex returns empty output', async () => {
    const codex = createMockAgent('codex', '');
    const claude = createMockAgent('claude', 'impl');
    const orch = new Orchestrator({ claude, codex });

    // The mock returns output='', which is falsy
    await assert.rejects(
      () => orch.planAndImplement('task'),
      (err) => {
        assert.ok(err.message.toLowerCase().includes('empty plan'), `Expected "empty plan" in: ${err.message}`);
        return true;
      }
    );
  });

  it('wires onPlanData callback to codex and onImplData to claude', async () => {
    const codex = createMockAgent('codex', 'plan-data');
    const claude = createMockAgent('claude', 'impl-data');
    const orch = new Orchestrator({ claude, codex });

    const planChunks = [];
    const implChunks = [];

    await orch.planAndImplement('task', {
      onPlanData: (text) => planChunks.push(text),
      onImplData: (text) => implChunks.push(text),
    });

    assert.ok(planChunks.includes('plan-data'), 'onPlanData should receive codex output');
    assert.ok(implChunks.includes('impl-data'), 'onImplData should receive claude output');
  });

  it('codex is called before claude (sequential execution)', async () => {
    const callOrder = [];
    const codex = createMockAgent('codex', 'the plan');
    const claude = createMockAgent('claude', 'the impl');

    // Wrap run to track call order
    const origCodexRun = codex.run.bind(codex);
    codex.run = async (prompt, opts) => {
      callOrder.push('codex');
      return origCodexRun(prompt, opts);
    };
    const origClaudeRun = claude.run.bind(claude);
    claude.run = async (prompt, opts) => {
      callOrder.push('claude');
      return origClaudeRun(prompt, opts);
    };

    const orch = new Orchestrator({ claude, codex });
    await orch.planAndImplement('task');

    assert.deepEqual(callOrder, ['codex', 'claude']);
  });
});

describe('Orchestrator Integration: reversePlanAndImplement', () => {
  it('calls claude as planner and codex as implementer', async () => {
    const claude = createMockAgent('claude', 'claude plan');
    const codex = createMockAgent('codex', 'codex impl');
    const orch = new Orchestrator({ claude, codex });

    await orch.reversePlanAndImplement('task');

    assert.equal(claude._runCalls.length, 1, 'Claude should be called once as planner');
    assert.equal(codex._runCalls.length, 1, 'Codex should be called once as implementer');

    // Claude is the planner so its prompt should contain plan instructions
    assert.ok(claude._runCalls[0].prompt.includes('Do NOT write any code'));
  });

  it('fires phase callbacks in correct order', async () => {
    const claude = createMockAgent('claude', 'the plan');
    const codex = createMockAgent('codex', 'the impl');
    const orch = new Orchestrator({ claude, codex });

    const phases = [];
    await orch.reversePlanAndImplement('task', {
      onPhase: (phase) => phases.push(phase),
    });

    assert.deepEqual(phases, ['planning', 'implementing']);
  });

  it('throws error when claude returns empty plan', async () => {
    const claude = createMockAgent('claude', '');
    const codex = createMockAgent('codex', 'impl');
    const orch = new Orchestrator({ claude, codex });

    await assert.rejects(
      () => orch.reversePlanAndImplement('task'),
      (err) => {
        assert.ok(err.message.toLowerCase().includes('empty plan'), `Expected "empty plan" in: ${err.message}`);
        return true;
      }
    );
  });

  it('returns object with plan and implementation keys', async () => {
    const claude = createMockAgent('claude', 'claude plan');
    const codex = createMockAgent('codex', 'codex impl');
    const orch = new Orchestrator({ claude, codex });

    const result = await orch.reversePlanAndImplement('task');

    assert.equal(result.plan, 'claude plan');
    assert.equal(result.implementation, 'codex impl');
  });

  it('wires onPlanData to claude and onImplData to codex', async () => {
    const claude = createMockAgent('claude', 'plan-stream');
    const codex = createMockAgent('codex', 'impl-stream');
    const orch = new Orchestrator({ claude, codex });

    const planChunks = [];
    const implChunks = [];

    await orch.reversePlanAndImplement('task', {
      onPlanData: (text) => planChunks.push(text),
      onImplData: (text) => implChunks.push(text),
    });

    assert.ok(planChunks.includes('plan-stream'), 'onPlanData should receive claude plan output');
    assert.ok(implChunks.includes('impl-stream'), 'onImplData should receive codex impl output');
  });
});

describe('Orchestrator Integration: askBoth', () => {
  it('both agents called in parallel with same prompt', async () => {
    const claude = createMockAgent('claude', 'claude-reply');
    const codex = createMockAgent('codex', 'codex-reply');
    const orch = new Orchestrator({ claude, codex });

    const result = await orch.askBoth('shared prompt');

    assert.equal(claude._runCalls.length, 1);
    assert.equal(codex._runCalls.length, 1);
    assert.equal(claude._runCalls[0].prompt, 'shared prompt');
    assert.equal(codex._runCalls[0].prompt, 'shared prompt');
  });

  it('wires correct onData callbacks per agent', async () => {
    const claude = createMockAgent('claude', 'c-data');
    const codex = createMockAgent('codex', 'x-data');
    const orch = new Orchestrator({ claude, codex });

    const claudeChunks = [];
    const codexChunks = [];

    await orch.askBoth('prompt', {
      onClaudeData: (text) => claudeChunks.push(text),
      onCodexData: (text) => codexChunks.push(text),
    });

    assert.ok(claudeChunks.includes('c-data'), 'onClaudeData should receive claude output');
    assert.ok(codexChunks.includes('x-data'), 'onCodexData should receive codex output');
  });

  it('returns { claude: result, codex: result }', async () => {
    const claude = createMockAgent('claude', 'c-out');
    const codex = createMockAgent('codex', 'x-out');
    const orch = new Orchestrator({ claude, codex });

    const result = await orch.askBoth('prompt');

    assert.ok(result.claude, 'Result should have claude key');
    assert.ok(result.codex, 'Result should have codex key');
    assert.equal(result.claude.output, 'c-out');
    assert.equal(result.codex.output, 'x-out');
  });

  it('works with only one agent available (single result)', async () => {
    const claude = createMockAgent('claude', 'only-claude');
    const orch = new Orchestrator({ claude });

    const result = await orch.askBoth('prompt');

    assert.ok(result.claude, 'Result should have claude key');
    assert.equal(result.claude.output, 'only-claude');
    assert.equal(result.codex, undefined, 'Codex should not be in result');
  });

  it('fires onPhase with both', async () => {
    const claude = createMockAgent('claude', 'c');
    const codex = createMockAgent('codex', 'x');
    const orch = new Orchestrator({ claude, codex });

    const phases = [];
    await orch.askBoth('prompt', {
      onPhase: (phase) => phases.push(phase),
    });

    assert.ok(phases.includes('both'));
  });
});

describe('Orchestrator Integration: routeTo', () => {
  it('routes to correct agent by name', async () => {
    const claude = createMockAgent('claude', 'from-claude');
    const codex = createMockAgent('codex', 'from-codex');
    const gemini = createMockAgent('gemini', 'from-gemini');
    const orch = new Orchestrator({ claude, codex, gemini });

    const r1 = await orch.routeTo('claude', 'test');
    assert.equal(r1.output, 'from-claude');
    assert.equal(r1.agent, 'claude');

    const r2 = await orch.routeTo('codex', 'test');
    assert.equal(r2.output, 'from-codex');
    assert.equal(r2.agent, 'codex');

    const r3 = await orch.routeTo('gemini', 'test');
    assert.equal(r3.output, 'from-gemini');
    assert.equal(r3.agent, 'gemini');
  });

  it('passes options through to agent.run', async () => {
    const claude = createMockAgent('claude', 'out');
    const orch = new Orchestrator({ claude });

    const dataChunks = [];
    await orch.routeTo('claude', 'test', {
      onData: (t) => dataChunks.push(t),
      allowTools: true,
    });

    assert.ok(claude._runCalls[0].options.allowTools);
    assert.ok(dataChunks.includes('out'));
  });

  it('throws for unknown agent with helpful message listing available agents', async () => {
    const claude = createMockAgent('claude', 'out');
    const codex = createMockAgent('codex', 'out');
    const orch = new Orchestrator({ claude, codex });

    await assert.rejects(
      () => orch.routeTo('unknown', 'test'),
      (err) => {
        assert.ok(err.message.includes('unknown'), 'Error should mention the unknown agent');
        assert.ok(err.message.includes('claude'), 'Error should list available agent: claude');
        assert.ok(err.message.includes('codex'), 'Error should list available agent: codex');
        return true;
      }
    );
  });

  it('fires onEvent callbacks when provided', async () => {
    const claude = createMockAgent('claude', 'event-out');
    const orch = new Orchestrator({ claude });

    const receivedEvents = [];
    await orch.routeTo('claude', 'test', {
      onEvent: (ev) => receivedEvents.push(ev),
    });

    assert.ok(receivedEvents.length >= 2, 'Should receive text_delta and done events');
    assert.equal(receivedEvents[0].type, 'text_delta');
    assert.equal(receivedEvents[1].type, 'done');
  });
});
