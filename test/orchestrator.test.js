import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/orchestrator.js';

function createMockAgent(name, opts = {}) {
  let _sessionId = null;
  let _killed = false;

  return {
    get name() { return name; },
    cwd: opts.cwd || '/tmp/mock',
    get sessionId() { return _sessionId; },
    set sessionId(id) { _sessionId = id; },
    resetSession() { _sessionId = null; },
    kill() { _killed = true; },
    get killed() { return _killed; },
    async run(prompt, options = {}) {
      return {
        output: `${name}: ${prompt}`,
        agent: name,
        exitCode: 0,
        ...opts.runResult,
      };
    },
  };
}

describe('Orchestrator', () => {
  describe('routeTo', () => {
    it('routes to claude correctly', async () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      const result = await orch.routeTo('claude', 'hello');
      assert.equal(result.output, 'claude: hello');
      assert.equal(result.agent, 'claude');
    });

    it('routes to codex correctly', async () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      const result = await orch.routeTo('codex', 'build it');
      assert.equal(result.output, 'codex: build it');
      assert.equal(result.agent, 'codex');
    });

    it('routes to gemini correctly', async () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      const result = await orch.routeTo('gemini', 'explain this');
      assert.equal(result.output, 'gemini: explain this');
      assert.equal(result.agent, 'gemini');
    });

    it('throws descriptive error for unknown agent', async () => {
      const claude = createMockAgent('claude');
      const orch = new Orchestrator({ claude });

      await assert.rejects(
        () => orch.routeTo('unknown', 'test'),
        { message: /Agent "unknown" is not available/ }
      );
    });

    it('error message mentions installation hint', async () => {
      const claude = createMockAgent('claude');
      const orch = new Orchestrator({ claude });

      await assert.rejects(
        () => orch.routeTo('codex', 'test'),
        { message: /Is the CLI installed/ }
      );
    });
  });

  describe('getSessions', () => {
    it('returns all agent sessions', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      claude.sessionId = 'sess-c';
      codex.sessionId = 'sess-x';
      gemini.sessionId = 'sess-g';

      const sessions = orch.getSessions();
      assert.equal(sessions.claude, 'sess-c');
      assert.equal(sessions.codex, 'sess-x');
      assert.equal(sessions.gemini, 'sess-g');
    });

    it('returns null for agents without sessions', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const orch = new Orchestrator({ claude, codex });

      const sessions = orch.getSessions();
      assert.equal(sessions.claude, null);
      assert.equal(sessions.codex, null);
    });
  });

  describe('resetSessions', () => {
    it('resets all agent sessions', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      claude.sessionId = 'sess-c';
      codex.sessionId = 'sess-x';
      gemini.sessionId = 'sess-g';

      orch.resetSessions();

      const sessions = orch.getSessions();
      assert.equal(sessions.claude, null);
      assert.equal(sessions.codex, null);
      assert.equal(sessions.gemini, null);
    });
  });

  describe('killAll', () => {
    it('kills all agents', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      orch.killAll();

      assert.equal(claude.killed, true);
      assert.equal(codex.killed, true);
      assert.equal(gemini.killed, true);
    });
  });

  describe('getAvailableAgents', () => {
    it('returns all registered agent names', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const gemini = createMockAgent('gemini');
      const orch = new Orchestrator({ claude, codex, gemini });

      const agents = orch.getAvailableAgents();
      assert.deepEqual(agents, ['claude', 'codex', 'gemini']);
    });

    it('only includes agents that were provided', () => {
      const claude = createMockAgent('claude');
      const orch = new Orchestrator({ claude });

      const agents = orch.getAvailableAgents();
      assert.deepEqual(agents, ['claude']);
    });

    it('handles optional agents gracefully', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const orch = new Orchestrator({ claude, codex });

      const agents = orch.getAvailableAgents();
      assert.deepEqual(agents, ['claude', 'codex']);
      assert.ok(!agents.includes('gemini'));
    });
  });

  describe('agents getter', () => {
    it('exposes the internal agents Map', () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const orch = new Orchestrator({ claude, codex });

      assert.ok(orch.agents instanceof Map);
      assert.equal(orch.agents.size, 2);
      assert.equal(orch.agents.get('claude'), claude);
      assert.equal(orch.agents.get('codex'), codex);
    });
  });

  describe('askBoth', () => {
    it('runs both claude and codex in parallel', async () => {
      const claude = createMockAgent('claude');
      const codex = createMockAgent('codex');
      const orch = new Orchestrator({ claude, codex });

      const result = await orch.askBoth('test prompt');
      assert.ok(result.claude);
      assert.ok(result.codex);
      assert.equal(result.claude.output, 'claude: test prompt');
      assert.equal(result.codex.output, 'codex: test prompt');
    });

    it('runs only available agents gracefully', async () => {
      const claude = createMockAgent('claude');
      const orch = new Orchestrator({ claude });

      const result = await orch.askBoth('test prompt');
      assert.ok(result.claude);
      assert.equal(result.codex, undefined);
    });

    it('throws when no agents are available', async () => {
      const orch = new Orchestrator({});

      await assert.rejects(
        () => orch.askBoth('test prompt'),
        { message: /No agents available/ }
      );
    });
  });
});
