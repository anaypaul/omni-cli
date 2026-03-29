import { describe, it, before, afterEach } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatch,
  registerBuiltinRoutes,
  registerRoute,
  getRoutes,
} from '../src/dispatcher.js';

// Mock agent that records calls and returns controlled responses
function createMockAgent(name, output = `${name} response`) {
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

function createMockOrch() {
  const agents = new Map();
  const mockAgent = (name) => createMockAgent(name, `${name} response`);
  agents.set('claude', mockAgent('claude'));
  agents.set('codex', mockAgent('codex'));
  agents.set('gemini', mockAgent('gemini'));

  return {
    _agents: agents,
    agents,
    getAvailableAgents() { return [...agents.keys()]; },
    routeTo: mock.fn(async (name, prompt, opts) => {
      const agent = agents.get(name);
      if (!agent) throw new Error(`Agent "${name}" not available`);
      return agent.run(prompt, opts);
    }),
    planAndImplement: mock.fn(async (task, opts) => {
      if (opts?.onPhase) { opts.onPhase('planning'); opts.onPhase('implementing'); }
      if (opts?.onPlanData) opts.onPlanData('plan text');
      if (opts?.onImplData) opts.onImplData('impl text');
      return { plan: 'plan text', implementation: 'impl text' };
    }),
    reversePlanAndImplement: mock.fn(async (task, opts) => {
      if (opts?.onPhase) { opts.onPhase('planning'); opts.onPhase('implementing'); }
      if (opts?.onPlanData) opts.onPlanData('plan');
      if (opts?.onImplData) opts.onImplData('impl');
      return { plan: 'plan', implementation: 'impl' };
    }),
    askBoth: mock.fn(async (prompt, opts) => {
      return { claude: { output: 'c' }, codex: { output: 'x' } };
    }),
  };
}

// Suppress console.log and process.stdout.write during handler tests
// (the handlers print headers/footers to stdout)
function suppressOutput() {
  const origLog = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = () => {};
  process.stdout.write = (chunk) => true;
  return () => {
    console.log = origLog;
    process.stdout.write = origWrite;
  };
}

describe('Dispatcher Integration', () => {
  let restore;

  before(() => {
    registerBuiltinRoutes();
  });

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  describe('route registration', () => {
    it('builtin routes are registered', () => {
      const routes = getRoutes();
      const names = routes.map((r) => r.name);
      assert.ok(names.includes('claude'));
      assert.ok(names.includes('codex'));
      assert.ok(names.includes('gemini'));
      assert.ok(names.includes('plan'));
      assert.ok(names.includes('reverse'));
      assert.ok(names.includes('both'));
      assert.ok(names.includes('all'));
    });
  });

  describe('dispatch to claude', () => {
    it('calls orch.routeTo with claude', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('claude', 'hello claude', orch);

      assert.equal(orch.routeTo.mock.calls.length, 1);
      assert.equal(orch.routeTo.mock.calls[0].arguments[0], 'claude');
      assert.equal(orch.routeTo.mock.calls[0].arguments[1], 'hello claude');
    });

    it('passes allowTools: true to claude', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('claude', 'test', orch);

      const opts = orch.routeTo.mock.calls[0].arguments[2];
      assert.equal(opts.allowTools, true);
    });

    it('passes onData callback for streaming output', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('claude', 'test', orch);

      const opts = orch.routeTo.mock.calls[0].arguments[2];
      assert.equal(typeof opts.onData, 'function');
    });

    it('passes onEvent callback for structured events', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('claude', 'test', orch);

      const opts = orch.routeTo.mock.calls[0].arguments[2];
      assert.equal(typeof opts.onEvent, 'function');
    });
  });

  describe('dispatch to codex', () => {
    it('calls orch.routeTo with codex', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('codex', 'hello codex', orch);

      assert.equal(orch.routeTo.mock.calls.length, 1);
      assert.equal(orch.routeTo.mock.calls[0].arguments[0], 'codex');
      assert.equal(orch.routeTo.mock.calls[0].arguments[1], 'hello codex');
    });

    it('passes onData and onEvent callbacks', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('codex', 'test', orch);

      const opts = orch.routeTo.mock.calls[0].arguments[2];
      assert.equal(typeof opts.onData, 'function');
      assert.equal(typeof opts.onEvent, 'function');
    });
  });

  describe('dispatch to gemini', () => {
    it('calls orch.routeTo with gemini', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('gemini', 'hello gemini', orch);

      assert.equal(orch.routeTo.mock.calls.length, 1);
      assert.equal(orch.routeTo.mock.calls[0].arguments[0], 'gemini');
      assert.equal(orch.routeTo.mock.calls[0].arguments[1], 'hello gemini');
    });

    it('passes allowTools: true to gemini', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('gemini', 'test', orch);

      const opts = orch.routeTo.mock.calls[0].arguments[2];
      assert.equal(opts.allowTools, true);
    });

    it('passes onData and onEvent callbacks', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('gemini', 'test', orch);

      const opts = orch.routeTo.mock.calls[0].arguments[2];
      assert.equal(typeof opts.onData, 'function');
      assert.equal(typeof opts.onEvent, 'function');
    });
  });

  describe('dispatch plan', () => {
    it('calls orch.planAndImplement', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('plan', 'build a feature', orch);

      assert.equal(orch.planAndImplement.mock.calls.length, 1);
      assert.equal(orch.planAndImplement.mock.calls[0].arguments[0], 'build a feature');
    });

    it('passes onPhase callback', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('plan', 'task', orch);

      const opts = orch.planAndImplement.mock.calls[0].arguments[1];
      assert.equal(typeof opts.onPhase, 'function');
    });

    it('passes onPlanData and onImplData callbacks for streaming', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('plan', 'task', orch);

      const opts = orch.planAndImplement.mock.calls[0].arguments[1];
      assert.equal(typeof opts.onPlanData, 'function');
      assert.equal(typeof opts.onImplData, 'function');
    });
  });

  describe('dispatch reverse', () => {
    it('calls orch.reversePlanAndImplement', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('reverse', 'build a feature', orch);

      assert.equal(orch.reversePlanAndImplement.mock.calls.length, 1);
      assert.equal(orch.reversePlanAndImplement.mock.calls[0].arguments[0], 'build a feature');
    });

    it('passes onPhase callback', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('reverse', 'task', orch);

      const opts = orch.reversePlanAndImplement.mock.calls[0].arguments[1];
      assert.equal(typeof opts.onPhase, 'function');
    });

    it('passes onPlanData and onImplData callbacks for streaming', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('reverse', 'task', orch);

      const opts = orch.reversePlanAndImplement.mock.calls[0].arguments[1];
      assert.equal(typeof opts.onPlanData, 'function');
      assert.equal(typeof opts.onImplData, 'function');
    });
  });

  describe('dispatch both', () => {
    it('calls orch.askBoth', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('both', 'compare answers', orch);

      assert.equal(orch.askBoth.mock.calls.length, 1);
      assert.equal(orch.askBoth.mock.calls[0].arguments[0], 'compare answers');
    });

    it('passes onClaudeData and onCodexData callbacks', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('both', 'test', orch);

      const opts = orch.askBoth.mock.calls[0].arguments[1];
      assert.equal(typeof opts.onClaudeData, 'function');
      assert.equal(typeof opts.onCodexData, 'function');
    });

    it('passes onPhase callback', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('both', 'test', orch);

      const opts = orch.askBoth.mock.calls[0].arguments[1];
      assert.equal(typeof opts.onPhase, 'function');
    });
  });

  describe('dispatch all', () => {
    it('calls orch.routeTo for all available agents', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('all', 'everyone answer', orch);

      // Should call routeTo once per agent (claude, codex, gemini)
      assert.equal(orch.routeTo.mock.calls.length, 3);

      const calledAgents = orch.routeTo.mock.calls.map((c) => c.arguments[0]);
      assert.ok(calledAgents.includes('claude'));
      assert.ok(calledAgents.includes('codex'));
      assert.ok(calledAgents.includes('gemini'));
    });

    it('passes the same prompt to all agents', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('all', 'shared prompt', orch);

      for (const call of orch.routeTo.mock.calls) {
        assert.equal(call.arguments[1], 'shared prompt');
      }
    });

    it('passes onData callback for each agent', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('all', 'test', orch);

      for (const call of orch.routeTo.mock.calls) {
        const opts = call.arguments[2];
        assert.equal(typeof opts.onData, 'function');
      }
    });

    it('passes allowTools: true for each agent', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      await dispatch('all', 'test', orch);

      for (const call of orch.routeTo.mock.calls) {
        const opts = call.arguments[2];
        assert.equal(opts.allowTools, true);
      }
    });

    it('returns results keyed by agent name', async () => {
      const orch = createMockOrch();
      restore = suppressOutput();

      const result = await dispatch('all', 'test', orch);

      assert.ok(result.claude, 'Result should have claude key');
      assert.ok(result.codex, 'Result should have codex key');
      assert.ok(result.gemini, 'Result should have gemini key');
    });
  });

  describe('dispatch unknown route', () => {
    it('throws descriptive error for unknown route', async () => {
      const orch = createMockOrch();

      await assert.rejects(
        () => dispatch('nonexistent', 'test', orch),
        (err) => {
          assert.ok(err.message.includes('Unknown route'), 'Error should mention unknown route');
          assert.ok(err.message.includes('nonexistent') || err.message.includes('@nonexistent'),
            'Error should mention the route name');
          return true;
        }
      );
    });

    it('error lists available routes', async () => {
      const orch = createMockOrch();

      await assert.rejects(
        () => dispatch('notaroute', 'test', orch),
        (err) => {
          assert.ok(err.message.includes('@claude') || err.message.includes('claude'),
            'Error should list available routes');
          return true;
        }
      );
    });
  });

  describe('handler output callbacks', () => {
    it('claude handler onData writes to stdout', async () => {
      const orch = createMockOrch();
      const written = [];
      const origLog = console.log;
      console.log = () => {};
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk) => { written.push(chunk.toString()); return true; };

      try {
        await dispatch('claude', 'test', orch);
      } finally {
        console.log = origLog;
        process.stdout.write = origWrite;
      }

      // The onData callback in the handler does process.stdout.write(text)
      // Since our mock agent calls onData with the output, it should appear
      assert.ok(written.some((w) => w.includes('claude response')),
        'stdout should contain agent output');
    });

    it('codex handler onData writes to stdout', async () => {
      const orch = createMockOrch();
      const written = [];
      const origLog = console.log;
      console.log = () => {};
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk) => { written.push(chunk.toString()); return true; };

      try {
        await dispatch('codex', 'test', orch);
      } finally {
        console.log = origLog;
        process.stdout.write = origWrite;
      }

      assert.ok(written.some((w) => w.includes('codex response')),
        'stdout should contain agent output');
    });
  });
});
