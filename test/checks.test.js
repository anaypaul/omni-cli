import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../src/evals/checks.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('runCheck', () => {
  describe('substring', () => {
    it('passes when substring is found', async () => {
      const result = await runCheck(
        { type: 'substring', value: 'hello' },
        { output: 'hello world', stderr: '' },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });

    it('fails when substring is missing', async () => {
      const result = await runCheck(
        { type: 'substring', value: 'missing' },
        { output: 'hello world', stderr: '' },
        '/tmp'
      );
      assert.equal(result.passed, false);
    });

    it('supports negate flag', async () => {
      const result = await runCheck(
        { type: 'substring', value: 'bad', negate: true },
        { output: 'good output', stderr: '' },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });

    it('checks stderr when specified', async () => {
      const result = await runCheck(
        { type: 'substring', value: 'warn', in: 'stderr' },
        { output: '', stderr: 'warning: something' },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });
  });

  describe('regex', () => {
    it('passes when pattern matches', async () => {
      const result = await runCheck(
        { type: 'regex', pattern: '\\d+ steps' },
        { output: 'Plan has 5 steps', stderr: '' },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });

    it('supports flags', async () => {
      const result = await runCheck(
        { type: 'regex', pattern: 'hello', flags: 'i' },
        { output: 'HELLO', stderr: '' },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });

    it('fails when pattern does not match', async () => {
      const result = await runCheck(
        { type: 'regex', pattern: '^exact$' },
        { output: 'not exact match', stderr: '' },
        '/tmp'
      );
      assert.equal(result.passed, false);
    });
  });

  describe('exit_code', () => {
    it('passes when exit code matches', async () => {
      const result = await runCheck(
        { type: 'exit_code', value: 0 },
        { exitCode: 0 },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });

    it('defaults to 0', async () => {
      const result = await runCheck(
        { type: 'exit_code' },
        { exitCode: 0 },
        '/tmp'
      );
      assert.equal(result.passed, true);
    });

    it('fails on mismatch', async () => {
      const result = await runCheck(
        { type: 'exit_code', value: 0 },
        { exitCode: 1 },
        '/tmp'
      );
      assert.equal(result.passed, false);
    });
  });

  describe('file_exists', () => {
    it('passes when file exists', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'omni-test-'));
      await writeFile(join(dir, 'test.txt'), 'hi');
      const result = await runCheck(
        { type: 'file_exists', path: 'test.txt' },
        {},
        dir
      );
      assert.equal(result.passed, true);
      await rm(dir, { recursive: true });
    });

    it('fails when file does not exist', async () => {
      const result = await runCheck(
        { type: 'file_exists', path: 'nope.txt' },
        {},
        '/tmp'
      );
      assert.equal(result.passed, false);
    });
  });

  describe('unknown type', () => {
    it('fails with detail', async () => {
      const result = await runCheck(
        { type: 'magic' },
        {},
        '/tmp'
      );
      assert.equal(result.passed, false);
      assert.ok(result.detail.includes('Unknown'));
    });
  });
});
