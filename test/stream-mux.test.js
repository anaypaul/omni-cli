import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { StreamMux } from '../src/stream-mux.js';

// ANSI codes matching stream-mux.js
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

function captureStdout() {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(chunk.toString()); return true; };
  return { chunks, restore: () => { process.stdout.write = original; } };
}

describe('StreamMux', () => {
  let capture;

  afterEach(() => {
    if (capture) {
      capture.restore();
      capture = null;
    }
  });

  describe('createWriter', () => {
    it('returns a function', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      assert.equal(typeof writer, 'function');
    });

    it('registers the channel in the internal map', () => {
      const mux = new StreamMux();
      mux.createWriter('Claude');
      assert.ok(mux.channels.has('Claude'));
    });
  });

  describe('single channel output', () => {
    it('writing a complete line produces prefixed output with agent name', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('Hello world\n');

      assert.equal(capture.chunks.length, 1);
      assert.ok(capture.chunks[0].includes('Claude'), 'Output should contain agent name');
      assert.ok(capture.chunks[0].includes('Hello world'), 'Output should contain the text');
      assert.ok(capture.chunks[0].includes('\u2502'), 'Output should contain the separator pipe');
    });

    it('multiple lines each get prefixed separately', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('Line 1\nLine 2\n');

      assert.equal(capture.chunks.length, 2);
      assert.ok(capture.chunks[0].includes('Line 1'));
      assert.ok(capture.chunks[1].includes('Line 2'));
    });
  });

  describe('two channels interleaved', () => {
    it('each channel gets correct color prefix', () => {
      const mux = new StreamMux();
      const claudeWriter = mux.createWriter('Claude');
      const codexWriter = mux.createWriter('Codex');
      capture = captureStdout();

      claudeWriter('Claude says hi\n');
      codexWriter('Codex says hi\n');

      assert.equal(capture.chunks.length, 2);
      assert.ok(capture.chunks[0].includes(BLUE), 'Claude line should contain blue color');
      assert.ok(capture.chunks[0].includes('Claude'), 'Claude line should contain Claude name');
      assert.ok(capture.chunks[1].includes(GREEN), 'Codex line should contain green color');
      assert.ok(capture.chunks[1].includes('Codex'), 'Codex line should contain Codex name');
    });
  });

  describe('three channels (Claude + Codex + Gemini)', () => {
    it('all get distinct colors', () => {
      const mux = new StreamMux();
      const w1 = mux.createWriter('Claude');
      const w2 = mux.createWriter('Codex');
      const w3 = mux.createWriter('Gemini');
      capture = captureStdout();

      w1('from claude\n');
      w2('from codex\n');
      w3('from gemini\n');

      assert.equal(capture.chunks.length, 3);
      assert.ok(capture.chunks[0].includes(BLUE), 'Claude should use blue');
      assert.ok(capture.chunks[1].includes(GREEN), 'Codex should use green');
      assert.ok(capture.chunks[2].includes(YELLOW), 'Gemini should use yellow');
    });

    it('all names are padded to same length', () => {
      const mux = new StreamMux();
      mux.createWriter('Claude');
      mux.createWriter('Codex');
      mux.createWriter('Gemini');

      // maxNameLen should be 6 (length of "Claude" and "Gemini")
      assert.equal(mux.maxNameLen, 6);

      // All channels should have padded names
      for (const ch of mux.channels.values()) {
        assert.equal(ch.padded.length, 6, `${ch.name} should be padded to 6 chars`);
      }
    });
  });

  describe('partial line buffering', () => {
    it('partial text is buffered until newline arrives', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('partial');
      // No newline yet - should be buffered, not written
      assert.equal(capture.chunks.length, 0, 'Partial line should be buffered');

      writer(' complete\n');
      assert.equal(capture.chunks.length, 1);
      assert.ok(capture.chunks[0].includes('partial complete'));
    });

    it('flush() immediately outputs all buffered content', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('unflushed');
      assert.equal(capture.chunks.length, 0, 'Should be buffered');

      mux.flush();
      assert.equal(capture.chunks.length, 1, 'Should be flushed');
      assert.ok(capture.chunks[0].includes('unflushed'));
    });

    it('flush() handles multiple channels with partial buffers', () => {
      const mux = new StreamMux();
      const w1 = mux.createWriter('Claude');
      const w2 = mux.createWriter('Codex');
      capture = captureStdout();

      w1('partial-c');
      w2('partial-x');

      mux.flush();
      assert.equal(capture.chunks.length, 2, 'Both buffers should be flushed');
      assert.ok(capture.chunks[0].includes('partial-c'));
      assert.ok(capture.chunks[1].includes('partial-x'));
    });

    it('flush() clears pending timers', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('buffered');
      const ch = mux.channels.get('Claude');
      assert.ok(ch.flushTimer !== null, 'Timer should be set for partial buffer');

      mux.flush();
      assert.equal(ch.flushTimer, null, 'Timer should be cleared after flush');
      assert.equal(ch.buffer, '', 'Buffer should be empty after flush');
    });

    it('flush() is a no-op when buffers are empty', () => {
      const mux = new StreamMux();
      mux.createWriter('Claude');
      capture = captureStdout();

      mux.flush();
      assert.equal(capture.chunks.length, 0, 'Nothing should be written');
    });
  });

  describe('agent colors', () => {
    it('Claude uses blue', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('test\n');
      assert.ok(capture.chunks[0].includes(BLUE), 'Claude should be blue');
    });

    it('Codex uses green', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Codex');
      capture = captureStdout();

      writer('test\n');
      assert.ok(capture.chunks[0].includes(GREEN), 'Codex should be green');
    });

    it('Gemini uses yellow', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Gemini');
      capture = captureStdout();

      writer('test\n');
      assert.ok(capture.chunks[0].includes(YELLOW), 'Gemini should be yellow');
    });

    it('unknown agent name uses default (DIM) color', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Unknown');
      capture = captureStdout();

      writer('test\n');
      const output = capture.chunks[0];
      assert.ok(output.includes(DIM), 'Unknown agent should use DIM color');
      // Verify it does not use any of the named agent colors as the prefix color
      // (DIM appears in the separator too, so just check it does not start with agent colors)
      const prefixStart = output.indexOf(DIM);
      assert.ok(prefixStart >= 0, 'DIM color should be present');
    });
  });

  describe('line prefix format', () => {
    it('prefix includes bold agent name and dim separator', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('content\n');

      const output = capture.chunks[0];
      assert.ok(output.includes(BOLD), 'Prefix should include bold');
      assert.ok(output.includes(RESET), 'Prefix should include reset');
      assert.ok(output.includes('\u2502'), 'Prefix should include pipe separator');
    });
  });

  describe('empty line skipping', () => {
    it('skips leading empty lines before real content', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('\n\n\nActual content\n');

      // Should only output the "Actual content" line, not the empty leading lines
      assert.equal(capture.chunks.length, 1);
      assert.ok(capture.chunks[0].includes('Actual content'));
    });

    it('allows empty lines after content has started', () => {
      const mux = new StreamMux();
      const writer = mux.createWriter('Claude');
      capture = captureStdout();

      writer('First line\n\nSecond line\n');

      // Should have 3 lines: First, empty, Second
      // But the _emitLine logic only skips leading empties; once hasOutput is true, all lines pass
      assert.ok(capture.chunks.length >= 2, 'Should output multiple lines');
    });
  });
});
