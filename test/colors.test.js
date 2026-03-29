import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  claude,
  codex,
  gemini,
  system,
  error,
  bold,
  dim,
  header,
  toolBadge,
  errorBlock,
  HEADER_COLORS,
} from '../src/colors.js';

describe('Color helper functions', () => {
  it('claude(text) wraps in blue ANSI codes', () => {
    const result = claude('hello');
    assert.ok(result.includes('\x1b[34m'), 'should include blue code');
    assert.ok(result.includes('hello'), 'should include the text');
    assert.ok(result.includes('\x1b[0m'), 'should include reset code');
  });

  it('codex(text) wraps in green ANSI codes', () => {
    const result = codex('hello');
    assert.ok(result.includes('\x1b[32m'), 'should include green code');
    assert.ok(result.includes('hello'), 'should include the text');
    assert.ok(result.includes('\x1b[0m'), 'should include reset code');
  });

  it('gemini(text) wraps in yellow ANSI codes', () => {
    const result = gemini('hello');
    assert.ok(result.includes('\x1b[33m'), 'should include yellow code');
    assert.ok(result.includes('hello'), 'should include the text');
    assert.ok(result.includes('\x1b[0m'), 'should include reset code');
  });

  it('system(text) wraps in cyan ANSI codes', () => {
    const result = system('hello');
    assert.ok(result.includes('\x1b[36m'), 'should include cyan code');
    assert.ok(result.includes('hello'), 'should include the text');
    assert.ok(result.includes('\x1b[0m'), 'should include reset code');
  });

  it('bold(text) wraps in bold ANSI code', () => {
    const result = bold('hello');
    assert.ok(result.includes('\x1b[1m'), 'should include bold code');
    assert.ok(result.includes('hello'), 'should include the text');
    assert.ok(result.includes('\x1b[0m'), 'should include reset code');
  });

  it('dim(text) wraps in dim ANSI code', () => {
    const result = dim('hello');
    assert.ok(result.includes('\x1b[2m'), 'should include dim code');
    assert.ok(result.includes('hello'), 'should include the text');
    assert.ok(result.includes('\x1b[0m'), 'should include reset code');
  });
});

describe('header()', () => {
  it('header("Claude") includes blue color code', () => {
    const result = header('Claude');
    assert.ok(result.includes('\x1b[34m'), 'should include blue for Claude');
    assert.ok(result.includes('Claude'), 'should include agent name');
  });

  it('header("Codex") includes green color code', () => {
    const result = header('Codex');
    assert.ok(result.includes('\x1b[32m'), 'should include green for Codex');
    assert.ok(result.includes('Codex'), 'should include agent name');
  });

  it('header("Gemini") includes yellow color code', () => {
    const result = header('Gemini');
    assert.ok(result.includes('\x1b[33m'), 'should include yellow for Gemini');
    assert.ok(result.includes('Gemini'), 'should include agent name');
  });

  it('header("Unknown") uses cyan fallback color', () => {
    const result = header('Unknown');
    assert.ok(result.includes('\x1b[36m'), 'should include cyan fallback');
    assert.ok(result.includes('Unknown'), 'should include agent name');
  });

  it('header with phase includes both agent and phase', () => {
    const result = header('Claude', 'Planning');
    assert.ok(result.includes('Claude'), 'should include agent name');
    assert.ok(result.includes('Planning'), 'should include phase');
  });
});

describe('toolBadge()', () => {
  it('includes the tool name', () => {
    const result = toolBadge('readFile');
    assert.ok(result.includes('readFile'), 'should include tool name');
  });

  it('includes yellow and bold ANSI codes', () => {
    const result = toolBadge('bash');
    assert.ok(result.includes('\x1b[33m'), 'should include yellow code');
    assert.ok(result.includes('\x1b[1m'), 'should include bold code');
  });
});

describe('errorBlock()', () => {
  it('includes the error message', () => {
    const result = errorBlock('something went wrong');
    assert.ok(result.includes('something went wrong'), 'should include error message');
  });

  it('includes red ANSI code', () => {
    const result = errorBlock('fail');
    assert.ok(result.includes('\x1b[31m'), 'should include red code');
  });

  it('includes bold ANSI code', () => {
    const result = errorBlock('fail');
    assert.ok(result.includes('\x1b[1m'), 'should include bold code');
  });
});
