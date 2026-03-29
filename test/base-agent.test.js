import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BaseAgent } from '../src/agents/base.js';

describe('BaseAgent', () => {
  it('cannot be instantiated directly (throws abstract)', () => {
    assert.throws(
      () => new BaseAgent(),
      { message: /abstract/ }
    );
  });

  it('can be subclassed', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent();
    assert.ok(agent instanceof BaseAgent);
    assert.ok(agent instanceof TestAgent);
  });

  it('sets cwd from options', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent({ cwd: '/tmp/test' });
    assert.equal(agent.cwd, '/tmp/test');
  });

  it('defaults cwd to process.cwd()', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent();
    assert.equal(agent.cwd, process.cwd());
  });

  it('initializes sessionId to null', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent();
    assert.equal(agent.sessionId, null);
  });

  it('sessionId getter/setter works', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent();
    agent.sessionId = 'sess-123';
    assert.equal(agent.sessionId, 'sess-123');
  });

  it('resetSession clears sessionId', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent();
    agent.sessionId = 'sess-456';
    agent.resetSession();
    assert.equal(agent.sessionId, null);
  });

  it('kill is safe with no process', () => {
    class TestAgent extends BaseAgent {
      get name() { return 'test'; }
    }
    const agent = new TestAgent();
    // Should not throw
    agent.kill();
  });

  it('name getter throws when not overridden', () => {
    class BadAgent extends BaseAgent {}
    const agent = Object.create(BadAgent.prototype);
    // Bypass constructor to test name getter directly
    assert.throws(
      () => agent.name,
      { message: /Subclass must implement get name/ }
    );
  });

  it('run() rejects when not overridden', async () => {
    class BadAgent extends BaseAgent {}
    const agent = Object.create(BadAgent.prototype);
    await assert.rejects(
      () => agent.run('hello'),
      { message: /Subclass must implement run/ }
    );
  });
});
