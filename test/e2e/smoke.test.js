import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAgent } from '../../src/agents/claude.js';
import { CodexAgent } from '../../src/agents/codex.js';
import { GeminiAgent } from '../../src/agents/gemini.js';
import { detectAgents } from '../../src/agents/detector.js';

const SKIP = !process.env.OMNI_E2E;

describe('E2E Smoke Tests', { skip: SKIP ? 'Set OMNI_E2E=1 to run' : false }, () => {
  let detection;

  before(async () => {
    detection = await detectAgents();
  });

  describe('Claude roundtrip', { skip: SKIP }, () => {
    it('sends prompt and receives response', { skip: SKIP, timeout: 60000 }, async () => {
      if (!detection.claude.available) return;
      const agent = new ClaudeAgent();
      const chunks = [];
      const result = await agent.run('Respond with exactly: OMNI_TEST_OK', {
        onData: (text) => chunks.push(text),
        allowTools: false,
      });
      assert.ok(result.output.length > 0, 'Output should not be empty');
      assert.equal(result.exitCode, 0);
      assert.equal(result.agent, 'claude');
      assert.ok(chunks.length > 0, 'onData should fire');
      agent.kill();
    });
  });

  describe('Codex roundtrip', { skip: SKIP }, () => {
    it('sends prompt and receives response', { skip: SKIP, timeout: 60000 }, async () => {
      if (!detection.codex.available) return;
      const agent = new CodexAgent();
      const chunks = [];
      const result = await agent.run('Respond with exactly: OMNI_TEST_OK', {
        onData: (text) => chunks.push(text),
        readOnly: true,
      });
      assert.ok(result.output.length > 0, 'Output should not be empty');
      assert.equal(result.exitCode, 0);
      assert.equal(result.agent, 'codex');
      assert.ok(chunks.length > 0, 'onData should fire');
      agent.kill();
    });
  });

  describe('Gemini roundtrip', { skip: SKIP }, () => {
    it('sends prompt and receives response', { skip: SKIP, timeout: 60000 }, async () => {
      if (!detection.gemini.available) return;
      const agent = new GeminiAgent();
      const chunks = [];
      const result = await agent.run('Respond with exactly: OMNI_TEST_OK', {
        onData: (text) => chunks.push(text),
        allowTools: false,
      });
      assert.ok(result.output.length > 0, 'Output should not be empty');
      assert.equal(result.exitCode, 0);
      assert.equal(result.agent, 'gemini');
      assert.ok(chunks.length > 0, 'onData should fire');
      agent.kill();
    });
  });

  describe('Multi-agent parallel', { skip: SKIP }, () => {
    it('runs all available agents in parallel', { skip: SKIP, timeout: 120000 }, async () => {
      const AgentClass = { claude: ClaudeAgent, codex: CodexAgent, gemini: GeminiAgent };
      const available = Object.entries(detection)
        .filter(([, info]) => info.available)
        .map(([name]) => name);

      if (available.length === 0) {
        assert.fail('No agents available for parallel test');
      }

      const agents = available.map((name) => new AgentClass[name]());
      const promises = agents.map((agent, i) => {
        const chunks = [];
        const name = available[i];
        const opts = {
          onData: (text) => chunks.push(text),
        };
        // Use appropriate options per agent type
        if (name === 'codex') {
          opts.readOnly = true;
        } else {
          opts.allowTools = false;
        }
        return agent.run('Respond with exactly: OMNI_PARALLEL_OK', opts)
          .then((result) => ({ name, result, chunks }));
      });

      const results = await Promise.all(promises);

      for (const { name, result, chunks } of results) {
        assert.ok(result.output.length > 0, `${name} output should not be empty`);
        assert.equal(result.exitCode, 0, `${name} should exit with 0`);
        assert.equal(result.agent, name, `${name} agent name should match`);
        assert.ok(chunks.length > 0, `${name} onData should fire`);
      }

      // Clean up
      agents.forEach((a) => a.kill());
    });
  });

  describe('Agent result structure', { skip: SKIP }, () => {
    it('all agents return consistent result shape', { skip: SKIP, timeout: 60000 }, async () => {
      const available = Object.entries(detection)
        .filter(([, info]) => info.available)
        .map(([name]) => name);

      if (available.length === 0) return;

      const AgentClass = { claude: ClaudeAgent, codex: CodexAgent, gemini: GeminiAgent };
      const name = available[0];
      const agent = new AgentClass[name]();

      const opts = name === 'codex' ? { readOnly: true } : { allowTools: false };
      const result = await agent.run('Say hello', opts);

      assert.ok('output' in result, 'result should have output');
      assert.ok('stderr' in result, 'result should have stderr');
      assert.ok('exitCode' in result, 'result should have exitCode');
      assert.ok('durationMs' in result, 'result should have durationMs');
      assert.ok('agent' in result, 'result should have agent');
      assert.equal(typeof result.durationMs, 'number');
      assert.ok(result.durationMs > 0, 'durationMs should be positive');

      agent.kill();
    });
  });
});
