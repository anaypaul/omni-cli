import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAgent } from '../src/agents/claude.js';
import { MockProcess, createMockSpawn, feedAndClose } from './helpers/mock-process.js';
import * as fixtures from './fixtures/claude-events.js';

describe('ClaudeAgent communication', () => {

  // --- Argument Construction ---

  describe('argument construction', () => {
    it('fresh run: spawns claude with correct default args', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('hello world');
      feedAndClose(proc, fixtures.basicText);
      await resultPromise;

      assert.equal(mockSpawn.calls.length, 1);
      const call = mockSpawn.calls[0];
      assert.equal(call.cmd, 'claude');
      assert.deepEqual(call.args, [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
        'hello world',
      ]);
    });

    it('with sessionId: args include --resume and sessionId', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });
      agent.sessionId = 'sess-existing';

      const resultPromise = agent.run('continue');
      feedAndClose(proc, fixtures.basicText);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      const resumeIdx = args.indexOf('--resume');
      assert.ok(resumeIdx !== -1, 'should include --resume flag');
      assert.equal(args[resumeIdx + 1], 'sess-existing');
    });

    it('allowTools=true: args include --dangerously-skip-permissions', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('do stuff', { allowTools: true });
      feedAndClose(proc, fixtures.basicText);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      assert.ok(args.includes('--dangerously-skip-permissions'));
    });

    it('custom cwd: spawn options include correct cwd', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test', { cwd: '/custom/path' });
      feedAndClose(proc, fixtures.basicText);
      await resultPromise;

      assert.equal(mockSpawn.calls[0].opts.cwd, '/custom/path');
    });

    it('uses agent cwd when no per-run cwd is provided', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn, cwd: '/agent/cwd' });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicText);
      await resultPromise;

      assert.equal(mockSpawn.calls[0].opts.cwd, '/agent/cwd');
    });
  });

  // --- Stream Parsing ---

  describe('stream parsing', () => {
    it('basicText fixture: onData called with correct chunks, output assembled', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.basicText);
      const result = await resultPromise;

      assert.deepEqual(dataChunks, ['Hello ', 'world!']);
      assert.equal(result.output, 'Hello world!');
      assert.equal(result.sessionId, 'sess-c1');
    });

    it('withToolUse fixture: onEvent receives toolUse event with name readFile', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.withToolUse);
      await resultPromise;

      const toolEvt = evts.find(e => e.type === 'tool_use');
      assert.ok(toolEvt, 'should emit a tool_use event');
      assert.equal(toolEvt.tool.name, 'readFile');
      assert.deepEqual(toolEvt.tool.input, { path: '/tmp/test.js' });
      assert.equal(toolEvt.agent, 'claude');
    });

    it('withThinking fixture: onEvent receives thinking event', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.withThinking);
      await resultPromise;

      const thinkEvt = evts.find(e => e.type === 'thinking');
      assert.ok(thinkEvt, 'should emit a thinking event');
      assert.equal(thinkEvt.text, 'Let me think...');
      assert.equal(thinkEvt.agent, 'claude');
    });

    it('nonJsonMixed: raw text passed through onData, JSON also parsed', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.nonJsonMixed);
      const result = await resultPromise;

      // Raw text line produces "Raw text line\n", JSON produces "Parsed"
      assert.ok(dataChunks.some(c => c.includes('Raw text line')), 'should pass through raw text');
      assert.ok(dataChunks.some(c => c === 'Parsed'), 'should parse JSON text delta');
      assert.ok(result.output.includes('Raw text line'));
      assert.ok(result.output.includes('Parsed'));
    });

    it('emptyLines: blank lines skipped, text still parsed', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.emptyLines);
      const result = await resultPromise;

      assert.ok(result.output.includes('After blanks'));
      assert.ok(dataChunks.some(c => c === 'After blanks'));
    });

    it('chunked data: buffer logic handles split JSON correctly', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      // Split a single JSON line into two writes
      const fullLine = '{"type":"stream_event","session_id":"sess-chunk","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"buffered"}}}';
      const mid = Math.floor(fullLine.length / 2);
      const part1 = fullLine.slice(0, mid);
      const part2 = fullLine.slice(mid) + '\n';

      process.nextTick(() => {
        proc.writeStdout(part1);
        // Small delay then write rest
        setTimeout(() => {
          proc.writeStdout(part2);
          proc.exit(0);
        }, 10);
      });

      const result = await resultPromise;
      assert.ok(dataChunks.includes('buffered'), 'should parse buffered JSON line');
      assert.ok(result.output.includes('buffered'));
    });
  });

  // --- Session Management ---

  describe('session management', () => {
    it('session ID captured from events, persisted on agent after run', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      assert.equal(agent.sessionId, null);

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicText);
      const result = await resultPromise;

      assert.equal(agent.sessionId, 'sess-c1');
      assert.equal(result.sessionId, 'sess-c1');
    });

    it('result contains correct sessionId', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.withToolUse);
      const result = await resultPromise;

      assert.equal(result.sessionId, 'sess-c2');
    });
  });

  // --- Error Handling ---

  describe('error handling', () => {
    it('spawn error: promise rejects with "Failed to start Claude Code" message', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      process.nextTick(() => proc.emitError('ENOENT'));

      await assert.rejects(resultPromise, {
        message: /Failed to start Claude Code.*ENOENT/,
      });
    });

    it('non-zero exit: promise resolves (not rejects) with exitCode set', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicText, 1);
      const result = await resultPromise;

      assert.equal(result.exitCode, 1);
    });

    it('stderr content: captured in result.stderr', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      process.nextTick(() => {
        proc.writeStderr('warning: something went wrong');
        proc.writeStdout(fixtures.basicText);
        proc.exit(0);
      });
      const result = await resultPromise;

      assert.equal(result.stderr, 'warning: something went wrong');
    });
  });

  // --- Event Emission ---

  describe('event emission', () => {
    it('when onEvent provided: text_delta, tool_use, thinking, done events emitted', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.withThinking);
      await resultPromise;

      const types = evts.map(e => e.type);
      assert.ok(types.includes('thinking'), 'should have thinking event');
      assert.ok(types.includes('text_delta'), 'should have text_delta event');
      assert.ok(types.includes('done'), 'should have done event');
    });

    it('when only onData provided: onData still works, no crash', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.basicText);
      const result = await resultPromise;

      assert.ok(dataChunks.length > 0);
      assert.equal(result.output, 'Hello world!');
    });

    it('when neither provided: output still accumulates', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicText);
      const result = await resultPromise;

      assert.equal(result.output, 'Hello world!');
    });

    it('done event contains output and exitCode', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.basicText);
      await resultPromise;

      const doneEvt = evts.find(e => e.type === 'done');
      assert.ok(doneEvt, 'should emit done event');
      assert.equal(doneEvt.agent, 'claude');
      assert.equal(doneEvt.result.exitCode, 0);
      assert.equal(doneEvt.result.output, 'Hello world!');
    });

    it('error event emitted on spawn error when onEvent provided', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      process.nextTick(() => proc.emitError('ENOENT'));

      await assert.rejects(resultPromise);

      const errorEvt = evts.find(e => e.type === 'error');
      assert.ok(errorEvt, 'should emit error event');
      assert.equal(errorEvt.agent, 'claude');
      assert.ok(errorEvt.message.includes('ENOENT'));
    });
  });

  // --- Result structure ---

  describe('result structure', () => {
    it('result contains all expected fields', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new ClaudeAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicText);
      const result = await resultPromise;

      assert.equal(result.agent, 'claude');
      assert.equal(typeof result.durationMs, 'number');
      assert.equal(typeof result.output, 'string');
      assert.equal(typeof result.stderr, 'string');
      assert.equal(typeof result.exitCode, 'number');
    });
  });
});
