import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CodexAgent } from '../src/agents/codex.js';
import { MockProcess, createMockSpawn, feedAndClose } from './helpers/mock-process.js';
import * as fixtures from './fixtures/codex-events.js';

describe('CodexAgent communication', () => {

  // --- Argument Construction ---

  describe('argument construction', () => {
    it('fresh run: spawns codex with correct default args', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('hello world');
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      assert.equal(mockSpawn.calls.length, 1);
      const call = mockSpawn.calls[0];
      assert.equal(call.cmd, 'codex');
      assert.deepEqual(call.args, [
        'exec',
        '--full-auto',
        '--skip-git-repo-check',
        '--json',
        'hello world',
      ]);
    });

    it('readOnly=true: uses --sandbox read-only instead of --full-auto', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('query', { readOnly: true });
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      assert.ok(args.includes('--sandbox'), 'should include --sandbox');
      assert.ok(args.includes('read-only'), 'should include read-only');
      assert.ok(!args.includes('--full-auto'), 'should not include --full-auto');
    });

    it('with threadId: args include resume (no -- prefix) and threadId', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });
      agent.threadId = 'thread-existing';

      const resultPromise = agent.run('continue');
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      const resumeIdx = args.indexOf('resume');
      assert.ok(resumeIdx !== -1, 'should include resume (no -- prefix)');
      assert.equal(args[resumeIdx + 1], 'thread-existing');
      // Ensure it's 'resume' not '--resume'
      assert.ok(!args.includes('--resume'), 'should NOT include --resume');
    });

    it('custom cwd: spawn options include correct cwd', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test', { cwd: '/custom/codex' });
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      assert.equal(mockSpawn.calls[0].opts.cwd, '/custom/codex');
    });
  });

  // --- Stream Parsing - Delta Tracking ---

  describe('stream parsing - delta tracking', () => {
    it('basicResponse: single item.completed produces full text in onData', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(result.output, 'Hello from Codex!');
      // item.completed with no prior updates: delta is full text
      assert.ok(dataChunks.includes('Hello from Codex!'));
    });

    it('progressiveDeltas: incremental deltas computed correctly', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.progressiveDeltas);
      const result = await resultPromise;

      // Delta tracking: prev="" -> "Hel" (delta "Hel")
      // prev="Hel" -> "Hello " (delta "lo ")
      // prev="Hello " -> "Hello world" (delta "world")
      // prev="Hello world" -> "Hello world!" (delta "!")
      assert.deepEqual(dataChunks, ['Hel', 'lo ', 'world', '!']);
      assert.equal(result.output, 'Hello world!');
    });

    it('progressiveDeltas: text_delta events emitted for each delta', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.progressiveDeltas);
      await resultPromise;

      const textDeltas = evts.filter(e => e.type === 'text_delta');
      assert.equal(textDeltas.length, 4);
      assert.equal(textDeltas[0].text, 'Hel');
      assert.equal(textDeltas[1].text, 'lo ');
      assert.equal(textDeltas[2].text, 'world');
      assert.equal(textDeltas[3].text, '!');
      assert.ok(textDeltas.every(e => e.agent === 'codex'));
    });

    it('withToolCall: tool_use and tool_result events emitted via onEvent', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.withToolCall);
      const result = await resultPromise;

      const toolUseEvt = evts.find(e => e.type === 'tool_use');
      assert.ok(toolUseEvt, 'should emit tool_use event');
      assert.equal(toolUseEvt.tool.name, 'shell');
      assert.deepEqual(toolUseEvt.tool.input, { cmd: 'ls' });

      const toolResultEvt = evts.find(e => e.type === 'tool_result');
      assert.ok(toolResultEvt, 'should emit tool_result event');
      assert.equal(toolResultEvt.tool.name, 'shell');
      assert.equal(toolResultEvt.tool.output, 'file1.txt');
      assert.equal(toolResultEvt.tool.error, null);

      assert.equal(result.output, 'Done.');
    });

    it('multipleMessages: two messages joined in output', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.multipleMessages);
      const result = await resultPromise;

      // messages.join('\n').trim() => "First.\nSecond."
      assert.equal(result.output, 'First.\nSecond.');
      assert.ok(dataChunks.includes('First.'));
      assert.ok(dataChunks.includes('Second.'));
    });
  });

  // --- Session (Thread) Management ---

  describe('session management', () => {
    it('thread ID captured from thread.started event, persisted on agent', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      assert.equal(agent.threadId, null);

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(agent.threadId, 'thread-x1');
      assert.equal(result.sessionId, 'thread-x1');
    });

    it('threadId aliases sessionId', async () => {
      const agent = new CodexAgent({ spawn: createMockSpawn(new MockProcess()) });
      agent.threadId = 'thread-abc';
      assert.equal(agent.sessionId, 'thread-abc');
      agent.sessionId = 'thread-xyz';
      assert.equal(agent.threadId, 'thread-xyz');
    });
  });

  // --- Error Handling (Codex-specific) ---

  describe('error handling', () => {
    it('non-zero exit + no output + has stderr: promise REJECTS', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');

      process.nextTick(() => {
        proc.writeStderr('fatal error occurred');
        proc.exit(1);
      });

      await assert.rejects(resultPromise, {
        message: /Codex failed.*fatal error occurred/,
      });
    });

    it('non-zero exit but HAS output: promise RESOLVES', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse, 1);
      const result = await resultPromise;

      assert.equal(result.exitCode, 1);
      assert.equal(result.output, 'Hello from Codex!');
    });

    it('spawn error: promise rejects with "Failed to start Codex CLI" message', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      process.nextTick(() => proc.emitError('ENOENT'));

      await assert.rejects(resultPromise, {
        message: /Failed to start Codex CLI.*ENOENT/,
      });
    });

    it('error event emitted on non-zero exit failure', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      process.nextTick(() => {
        proc.writeStderr('something bad');
        proc.exit(1);
      });

      await assert.rejects(resultPromise);

      const errorEvt = evts.find(e => e.type === 'error');
      assert.ok(errorEvt, 'should emit error event');
      assert.equal(errorEvt.agent, 'codex');
    });

    it('stderr captured in result on successful run', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      process.nextTick(() => {
        proc.writeStderr('warning: deprecation');
        proc.writeStdout(fixtures.basicResponse);
        proc.exit(0);
      });
      const result = await resultPromise;

      assert.equal(result.stderr, 'warning: deprecation');
    });
  });

  // --- Event Emission ---

  describe('event emission', () => {
    it('done event emitted on successful completion', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const doneEvt = evts.find(e => e.type === 'done');
      assert.ok(doneEvt, 'should emit done event');
      assert.equal(doneEvt.agent, 'codex');
      assert.equal(doneEvt.result.exitCode, 0);
      assert.equal(doneEvt.result.output, 'Hello from Codex!');
    });

    it('when only onData provided: onData still works, no crash', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.ok(dataChunks.length > 0);
      assert.equal(result.output, 'Hello from Codex!');
    });

    it('when neither provided: output still accumulates', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(result.output, 'Hello from Codex!');
    });
  });

  // --- Buffer handling ---

  describe('buffer handling', () => {
    it('chunked data: buffer logic handles split JSON correctly', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      // Split the fixture into two parts mid-line
      const lines = fixtures.basicResponse.split('\n');
      const firstLine = lines[0] + '\n';
      const secondLine = lines[1];
      const mid = Math.floor(secondLine.length / 2);

      process.nextTick(() => {
        proc.writeStdout(firstLine + secondLine.slice(0, mid));
        setTimeout(() => {
          proc.writeStdout(secondLine.slice(mid) + '\n');
          proc.exit(0);
        }, 10);
      });

      const result = await resultPromise;
      assert.equal(result.output, 'Hello from Codex!');
    });

    it('non-JSON lines passed through to onData', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      const mixed = 'plain text line\n' + fixtures.basicResponse;
      feedAndClose(proc, mixed);
      const result = await resultPromise;

      assert.ok(dataChunks.some(c => c.includes('plain text line')));
    });
  });

  // --- Result structure ---

  describe('result structure', () => {
    it('result contains all expected fields', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new CodexAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(result.agent, 'codex');
      assert.equal(typeof result.durationMs, 'number');
      assert.equal(typeof result.output, 'string');
      assert.equal(typeof result.stderr, 'string');
      assert.equal(typeof result.exitCode, 'number');
      assert.equal(result.sessionId, 'thread-x1');
    });
  });
});
