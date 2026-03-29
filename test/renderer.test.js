import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, createEventHandler } from '../src/renderer.js';
import * as events from '../src/events.js';

function createMockStream() {
  const writes = [];
  return {
    writes,
    write(data) {
      writes.push(data);
      return true;
    },
  };
}

describe('Renderer', () => {
  it('text_delta writes text to stream', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    renderer.handleEvent(events.textDelta('claude', 'hello'));
    assert.ok(stream.writes.some((w) => w === 'hello'));
    renderer.destroy();
  });

  it('tool_use writes badge to stream', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    renderer.handleEvent(events.toolUse('claude', 'readFile', {}));
    const combined = stream.writes.join('');
    assert.ok(combined.includes('readFile'), 'should include tool name');
    renderer.destroy();
  });

  it('tool_result writes result to stream', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    renderer.handleEvent(events.toolResult('claude', 'bash', 'ok', null));
    const combined = stream.writes.join('');
    assert.ok(combined.includes('bash'), 'should include tool name');
    renderer.destroy();
  });

  it('tool_result with error writes error result', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    renderer.handleEvent(events.toolResult('claude', 'bash', null, 'fail'));
    const combined = stream.writes.join('');
    assert.ok(combined.includes('bash'), 'should include tool name');
    renderer.destroy();
  });

  it('error writes error block to stream', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    renderer.handleEvent(events.error('claude', 'something broke'));
    const combined = stream.writes.join('');
    assert.ok(combined.includes('something broke'), 'should include error message');
    renderer.destroy();
  });

  it('done stops spinner without crash', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    // Should not throw even if no spinner is running
    renderer.handleEvent(events.done('claude', { output: 'done', exitCode: 0 }));
    renderer.destroy();
  });

  it('destroy cleans up', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream });
    // Start a spinner via thinking event
    renderer.handleEvent(events.thinking('claude', 'analyzing'));
    // destroy should clean up the interval
    renderer.destroy();
    // Calling destroy again should be safe
    renderer.destroy();
  });

  it('thinking with showThinking=false does not start spinner', () => {
    const stream = createMockStream();
    const renderer = new Renderer({ stream, showThinking: false });
    renderer.handleEvent(events.thinking('claude', 'analyzing'));
    // No spinner writes expected immediately (spinner uses setInterval)
    assert.equal(stream.writes.length, 0);
    renderer.destroy();
  });
});

describe('createEventHandler', () => {
  it('returns a function', () => {
    const handler = createEventHandler();
    assert.equal(typeof handler, 'function');
  });

  it('handles events via returned function', () => {
    const stream = createMockStream();
    const handler = createEventHandler({ stream });
    handler(events.textDelta('claude', 'hi'));
    assert.ok(stream.writes.some((w) => w === 'hi'));
  });
});
