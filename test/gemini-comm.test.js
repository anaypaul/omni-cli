import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAgent } from '../src/agents/gemini.js';
import { MockProcess, createMockSpawn, feedAndClose } from './helpers/mock-process.js';
import * as fixtures from './fixtures/gemini-events.js';

describe('GeminiAgent communication', () => {

  // --- Argument Construction ---

  describe('argument construction', () => {
    it('fresh run: spawns gemini with correct default args (no -p flag)', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('hello world');
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      assert.equal(mockSpawn.calls.length, 1);
      const call = mockSpawn.calls[0];
      assert.equal(call.cmd, 'gemini');
      assert.deepEqual(call.args, [
        '--output-format', 'stream-json',
        'hello world',
      ]);
      // Explicitly verify no -p flag for fresh runs
      assert.ok(!call.args.includes('-p'), 'should NOT include -p for fresh run');
    });

    it('allowTools=true: includes --yolo', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test', { allowTools: true });
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      assert.ok(args.includes('--yolo'));
    });

    it('with sessionId: includes --resume, sessionId, -p, and prompt', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });
      agent.sessionId = 'gemini-existing';

      const resultPromise = agent.run('continue please');
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      assert.deepEqual(args, [
        '--output-format', 'stream-json',
        '--resume', 'gemini-existing',
        '-p', 'continue please',
      ]);
    });

    it('with sessionId: -p flag present ONLY when resuming', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });
      agent.sessionId = 'sess-resume';

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      assert.ok(args.includes('-p'), '-p should be present when resuming');
      assert.ok(args.includes('--resume'), '--resume should be present');
    });

    it('custom cwd: spawn options include correct cwd', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test', { cwd: '/custom/gemini' });
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      assert.equal(mockSpawn.calls[0].opts.cwd, '/custom/gemini');
    });

    it('allowTools combined with sessionId: both --yolo and --resume present', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });
      agent.sessionId = 'sess-combo';

      const resultPromise = agent.run('test', { allowTools: true });
      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const args = mockSpawn.calls[0].args;
      assert.ok(args.includes('--yolo'));
      assert.ok(args.includes('--resume'));
      assert.ok(args.includes('-p'));
    });
  });

  // --- Stream Parsing ---

  describe('stream parsing', () => {
    it('basicResponse: init event captures session, message events accumulate text', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.deepEqual(dataChunks, ['Hello from ', 'Gemini!']);
      assert.equal(result.output, 'Hello from Gemini!');
      assert.equal(result.sessionId, 'gemini-g1');
    });

    it('nonAssistantMessage: user role messages IGNORED, only assistant parsed', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.nonAssistantMessage);
      const result = await resultPromise;

      // User message "Ignored user msg" should NOT appear
      assert.ok(!dataChunks.some(c => c.includes('Ignored')), 'user messages should be ignored');
      assert.deepEqual(dataChunks, ['Only this']);
      assert.equal(result.output, 'Only this');
    });

    it('noDeltaFlag: messages with delta=false IGNORED', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.noDeltaFlag);
      const result = await resultPromise;

      assert.ok(!dataChunks.some(c => c.includes('Ignored no delta')), 'delta=false should be ignored');
      assert.deepEqual(dataChunks, ['This counts']);
      assert.equal(result.output, 'This counts');
    });

    it('emptyContent: empty content string SKIPPED (no onData call)', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.emptyContent);
      const result = await resultPromise;

      // Empty string is falsy, so onData should not be called for it
      assert.ok(!dataChunks.includes(''), 'empty content should not trigger onData');
      assert.deepEqual(dataChunks, ['Real content']);
      assert.equal(result.output, 'Real content');
    });

    it('withToolUse: tool_use and tool_result events emitted via onEvent', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.withToolUse);
      await resultPromise;

      const toolUseEvt = evts.find(e => e.type === 'tool_use');
      assert.ok(toolUseEvt, 'should emit tool_use event');
      assert.equal(toolUseEvt.tool.name, 'read_file');
      assert.deepEqual(toolUseEvt.tool.input, { path: '/tmp/test.js' });
      assert.equal(toolUseEvt.agent, 'gemini');

      const toolResultEvt = evts.find(e => e.type === 'tool_result');
      assert.ok(toolResultEvt, 'should emit tool_result event');
      assert.equal(toolResultEvt.tool.name, 'read_file');
      assert.equal(toolResultEvt.tool.output, 'contents');
      assert.equal(toolResultEvt.tool.error, null);
    });

    it('text_delta events emitted for each text chunk', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const textDeltas = evts.filter(e => e.type === 'text_delta');
      assert.equal(textDeltas.length, 2);
      assert.equal(textDeltas[0].text, 'Hello from ');
      assert.equal(textDeltas[1].text, 'Gemini!');
      assert.ok(textDeltas.every(e => e.agent === 'gemini'));
    });
  });

  // --- Session Management ---

  describe('session management', () => {
    it('session ID from init event persisted on agent', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      assert.equal(agent.sessionId, null);

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(agent.sessionId, 'gemini-g1');
      assert.equal(result.sessionId, 'gemini-g1');
    });

    it('remaining buffer processed on close (init event in final buffer)', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');

      // Send init event WITHOUT trailing newline, so it stays in buffer
      // until close processes remaining buffer
      process.nextTick(() => {
        proc.writeStdout('{"type":"init","session_id":"gemini-buffered"}');
        proc.exit(0);
      });

      const result = await resultPromise;

      assert.equal(agent.sessionId, 'gemini-buffered');
      assert.equal(result.sessionId, 'gemini-buffered');
    });

    it('session ID persisted after run allows next run to use --resume', async () => {
      // First run captures session ID
      const proc1 = new MockProcess();
      const mockSpawn1 = createMockSpawn(proc1);
      const agent = new GeminiAgent({ spawn: mockSpawn1 });

      const resultPromise1 = agent.run('first');
      feedAndClose(proc1, fixtures.basicResponse);
      await resultPromise1;

      assert.equal(agent.sessionId, 'gemini-g1');

      // Second run should use --resume
      const proc2 = new MockProcess();
      const mockSpawn2 = createMockSpawn(proc2);
      agent._spawn = mockSpawn2;

      const resultPromise2 = agent.run('second');
      feedAndClose(proc2, fixtures.basicResponse);
      await resultPromise2;

      const args = mockSpawn2.calls[0].args;
      assert.ok(args.includes('--resume'));
      assert.ok(args.includes('gemini-g1'));
      assert.ok(args.includes('-p'));
    });
  });

  // --- Error Handling ---

  describe('error handling', () => {
    it('spawn error: promise rejects with "Failed to start Gemini CLI" message', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      process.nextTick(() => proc.emitError('ENOENT'));

      await assert.rejects(resultPromise, {
        message: /Failed to start Gemini CLI.*ENOENT/,
      });
    });

    it('non-zero exit: promise resolves with exitCode set', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse, 1);
      const result = await resultPromise;

      assert.equal(result.exitCode, 1);
    });

    it('stderr content: captured in result.stderr', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      process.nextTick(() => {
        proc.writeStderr('gemini warning: rate limit');
        proc.writeStdout(fixtures.basicResponse);
        proc.exit(0);
      });
      const result = await resultPromise;

      assert.equal(result.stderr, 'gemini warning: rate limit');
    });

    it('error event emitted on spawn error when onEvent provided', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      process.nextTick(() => proc.emitError('ENOENT'));
      await assert.rejects(resultPromise);

      const errorEvt = evts.find(e => e.type === 'error');
      assert.ok(errorEvt, 'should emit error event');
      assert.equal(errorEvt.agent, 'gemini');
    });
  });

  // --- Event Emission ---

  describe('event emission', () => {
    it('done event emitted on completion', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const evts = [];
      const resultPromise = agent.run('test', {
        onEvent: (event) => evts.push(event),
      });

      feedAndClose(proc, fixtures.basicResponse);
      await resultPromise;

      const doneEvt = evts.find(e => e.type === 'done');
      assert.ok(doneEvt, 'should emit done event');
      assert.equal(doneEvt.agent, 'gemini');
      assert.equal(doneEvt.result.exitCode, 0);
      assert.equal(doneEvt.result.output, 'Hello from Gemini!');
    });

    it('when only onData provided: onData still works, no crash', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.ok(dataChunks.length > 0);
      assert.equal(result.output, 'Hello from Gemini!');
    });

    it('when neither provided: output still accumulates', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(result.output, 'Hello from Gemini!');
    });
  });

  // --- Buffer handling ---

  describe('buffer handling', () => {
    it('chunked data: buffer logic handles split JSON correctly', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      // Split the fixture so a JSON line is broken across two writes
      const lines = fixtures.basicResponse.split('\n');
      const firstLine = lines[0] + '\n';
      const secondLine = lines[1];
      const mid = Math.floor(secondLine.length / 2);

      process.nextTick(() => {
        proc.writeStdout(firstLine + secondLine.slice(0, mid));
        setTimeout(() => {
          proc.writeStdout(secondLine.slice(mid) + '\n' + lines[2] + '\n');
          proc.exit(0);
        }, 10);
      });

      const result = await resultPromise;
      assert.equal(result.output, 'Hello from Gemini!');
      assert.equal(result.sessionId, 'gemini-g1');
    });

    it('non-JSON lines passed through to onData', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const dataChunks = [];
      const resultPromise = agent.run('test', {
        onData: (text) => dataChunks.push(text),
      });

      const mixed = 'raw text output\n' + fixtures.basicResponse;
      feedAndClose(proc, mixed);
      const result = await resultPromise;

      assert.ok(dataChunks.some(c => c.includes('raw text output')));
    });
  });

  // --- Result structure ---

  describe('result structure', () => {
    it('result contains all expected fields', async () => {
      const proc = new MockProcess();
      const mockSpawn = createMockSpawn(proc);
      const agent = new GeminiAgent({ spawn: mockSpawn });

      const resultPromise = agent.run('test');
      feedAndClose(proc, fixtures.basicResponse);
      const result = await resultPromise;

      assert.equal(result.agent, 'gemini');
      assert.equal(typeof result.durationMs, 'number');
      assert.equal(typeof result.output, 'string');
      assert.equal(typeof result.stderr, 'string');
      assert.equal(typeof result.exitCode, 'number');
      assert.equal(result.sessionId, 'gemini-g1');
    });
  });
});
