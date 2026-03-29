import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAgent } from '../src/agents/gemini.js';
import { BaseAgent } from '../src/agents/base.js';

describe('GeminiAgent', () => {
  it('extends BaseAgent', () => {
    const agent = new GeminiAgent();
    assert.ok(agent instanceof BaseAgent);
    assert.ok(agent instanceof GeminiAgent);
  });

  it('name returns gemini', () => {
    const agent = new GeminiAgent();
    assert.equal(agent.name, 'gemini');
  });

  it('constructor sets cwd from options', () => {
    const agent = new GeminiAgent({ cwd: '/tmp/gemini-test' });
    assert.equal(agent.cwd, '/tmp/gemini-test');
  });

  it('constructor defaults cwd to process.cwd()', () => {
    const agent = new GeminiAgent();
    assert.equal(agent.cwd, process.cwd());
  });

  it('sessionId starts as null', () => {
    const agent = new GeminiAgent();
    assert.equal(agent.sessionId, null);
  });

  it('sessionId getter/setter works', () => {
    const agent = new GeminiAgent();
    agent.sessionId = 'gemini-sess-abc';
    assert.equal(agent.sessionId, 'gemini-sess-abc');
  });

  it('resetSession clears sessionId', () => {
    const agent = new GeminiAgent();
    agent.sessionId = 'gemini-sess-xyz';
    agent.resetSession();
    assert.equal(agent.sessionId, null);
  });

  it('kill is safe with no process', () => {
    const agent = new GeminiAgent();
    // Should not throw when no process is running
    agent.kill();
  });

  it('has a run method that is a function', () => {
    const agent = new GeminiAgent();
    assert.equal(typeof agent.run, 'function');
  });
});
