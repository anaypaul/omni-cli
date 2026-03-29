import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES,
  textDelta,
  toolUse,
  toolResult,
  thinking,
  error,
  done,
  extractText,
} from '../src/events.js';

describe('AgentEvent factories', () => {
  it('EVENT_TYPES contains all six types', () => {
    assert.equal(EVENT_TYPES.size, 6);
    for (const t of ['text_delta', 'tool_use', 'tool_result', 'thinking', 'error', 'done']) {
      assert.ok(EVENT_TYPES.has(t), `missing type: ${t}`);
    }
  });

  it('textDelta returns correct shape', () => {
    const ev = textDelta('claude', 'hello');
    assert.equal(ev.type, 'text_delta');
    assert.equal(ev.agent, 'claude');
    assert.equal(ev.text, 'hello');
    assert.equal(typeof ev.ts, 'number');
  });

  it('toolUse returns correct shape', () => {
    const ev = toolUse('codex', 'readFile', { path: '/tmp' });
    assert.equal(ev.type, 'tool_use');
    assert.equal(ev.agent, 'codex');
    assert.equal(ev.tool.name, 'readFile');
    assert.deepEqual(ev.tool.input, { path: '/tmp' });
    assert.equal(typeof ev.ts, 'number');
  });

  it('toolResult returns correct shape', () => {
    const ev = toolResult('gemini', 'readFile', 'contents', null);
    assert.equal(ev.type, 'tool_result');
    assert.equal(ev.agent, 'gemini');
    assert.equal(ev.tool.name, 'readFile');
    assert.equal(ev.tool.output, 'contents');
    assert.equal(ev.tool.error, null);
    assert.equal(typeof ev.ts, 'number');
  });

  it('toolResult defaults error to null', () => {
    const ev = toolResult('claude', 'bash', 'ok');
    assert.equal(ev.tool.error, null);
  });

  it('toolResult accepts an error string', () => {
    const ev = toolResult('claude', 'bash', null, 'something failed');
    assert.equal(ev.tool.error, 'something failed');
  });

  it('thinking returns correct shape', () => {
    const ev = thinking('claude', 'analyzing...');
    assert.equal(ev.type, 'thinking');
    assert.equal(ev.agent, 'claude');
    assert.equal(ev.text, 'analyzing...');
    assert.equal(typeof ev.ts, 'number');
  });

  it('error returns correct shape', () => {
    const ev = error('codex', 'process crashed');
    assert.equal(ev.type, 'error');
    assert.equal(ev.agent, 'codex');
    assert.equal(ev.message, 'process crashed');
    assert.equal(typeof ev.ts, 'number');
  });

  it('done returns correct shape', () => {
    const ev = done('claude', { output: 'result', exitCode: 0 });
    assert.equal(ev.type, 'done');
    assert.equal(ev.agent, 'claude');
    assert.deepEqual(ev.result, { output: 'result', exitCode: 0 });
    assert.equal(typeof ev.ts, 'number');
  });

  it('all factories return frozen objects', () => {
    const events = [
      textDelta('a', 'b'),
      toolUse('a', 'b', {}),
      toolResult('a', 'b', 'c'),
      thinking('a', 'b'),
      error('a', 'b'),
      done('a', {}),
    ];
    for (const ev of events) {
      assert.ok(Object.isFrozen(ev), `${ev.type} should be frozen`);
    }
  });

  it('ts is a recent timestamp', () => {
    const before = Date.now();
    const ev = textDelta('claude', 'x');
    const after = Date.now();
    assert.ok(ev.ts >= before && ev.ts <= after);
  });
});

describe('extractText', () => {
  it('returns text for text_delta events', () => {
    const ev = textDelta('claude', 'hello world');
    assert.equal(extractText(ev), 'hello world');
  });

  it('returns null for non-text_delta events', () => {
    assert.equal(extractText(error('claude', 'oops')), null);
    assert.equal(extractText(done('claude', {})), null);
    assert.equal(extractText(thinking('claude', 'hmm')), null);
    assert.equal(extractText(toolUse('claude', 'x', {})), null);
  });
});
