import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockProcess, createMockSpawn, feedAndClose } from './mock-process.js';

describe('MockProcess', () => {
  it('stdout is writable and readable', async () => {
    const proc = new MockProcess();
    const chunks = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk.toString()));

    proc.writeStdout('hello');
    proc.writeStdout(' world');
    proc.stdout.end();

    await new Promise((resolve) => proc.stdout.on('end', resolve));
    assert.equal(chunks.join(''), 'hello world');
  });

  it('stderr is writable and readable', async () => {
    const proc = new MockProcess();
    const chunks = [];
    proc.stderr.on('data', (chunk) => chunks.push(chunk.toString()));

    proc.writeStderr('err msg');
    proc.stderr.end();

    await new Promise((resolve) => proc.stderr.on('end', resolve));
    assert.equal(chunks.join(''), 'err msg');
  });

  it('exit emits close event with code', async () => {
    const proc = new MockProcess();
    const code = await new Promise((resolve) => {
      proc.on('close', resolve);
      proc.exit(42);
    });
    assert.equal(code, 42);
  });

  it('exit defaults to code 0', async () => {
    const proc = new MockProcess();
    const code = await new Promise((resolve) => {
      proc.on('close', resolve);
      proc.exit();
    });
    assert.equal(code, 0);
  });

  it('emitError emits an error event', async () => {
    const proc = new MockProcess();
    const err = await new Promise((resolve) => {
      proc.on('error', resolve);
      proc.emitError('spawn failed');
    });
    assert.equal(err.message, 'spawn failed');
  });

  it('kill sets killed flag', () => {
    const proc = new MockProcess();
    assert.equal(proc.killed, false);
    proc.kill('SIGTERM');
    assert.equal(proc.killed, true);
  });

  it('has a pid', () => {
    const proc = new MockProcess();
    assert.equal(proc.pid, 12345);
  });
});

describe('createMockSpawn', () => {
  it('returns the mock process when called', () => {
    const proc = new MockProcess();
    const mockSpawn = createMockSpawn(proc);
    const result = mockSpawn('claude', ['-p'], { cwd: '/tmp' });
    assert.equal(result, proc);
  });

  it('records call arguments', () => {
    const proc = new MockProcess();
    const mockSpawn = createMockSpawn(proc);
    mockSpawn('claude', ['--json'], { cwd: '/home' });
    mockSpawn('codex', ['exec'], { cwd: '/work' });

    assert.equal(mockSpawn.calls.length, 2);
    assert.equal(mockSpawn.calls[0].cmd, 'claude');
    assert.deepEqual(mockSpawn.calls[0].args, ['--json']);
    assert.equal(mockSpawn.calls[1].cmd, 'codex');
  });
});

describe('feedAndClose', () => {
  it('sends data and emits close', async () => {
    const proc = new MockProcess();
    const chunks = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk.toString()));

    const closeCode = new Promise((resolve) => proc.on('close', resolve));
    feedAndClose(proc, 'test data', 0);

    const code = await closeCode;
    assert.equal(code, 0);
    assert.equal(chunks.join(''), 'test data');
  });

  it('handles null data gracefully', async () => {
    const proc = new MockProcess();
    const closeCode = new Promise((resolve) => proc.on('close', resolve));
    feedAndClose(proc, null, 1);

    const code = await closeCode;
    assert.equal(code, 1);
  });

  it('defaults exit code to 0', async () => {
    const proc = new MockProcess();
    const closeCode = new Promise((resolve) => proc.on('close', resolve));
    feedAndClose(proc, 'data');

    const code = await closeCode;
    assert.equal(code, 0);
  });
});
