import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export class MockProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.killed = false;
    this.pid = 12345;
  }

  writeStdout(data) {
    this.stdout.write(data);
  }

  writeStderr(data) {
    this.stderr.write(data);
  }

  exit(code = 0) {
    this.stdout.end();
    this.stderr.end();
    process.nextTick(() => this.emit('close', code));
  }

  emitError(message) {
    process.nextTick(() => this.emit('error', new Error(message)));
  }

  kill(signal) {
    this.killed = true;
  }
}

export function createMockSpawn(mockProc) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return mockProc;
  };
  fn.calls = calls;
  return fn;
}

export function feedAndClose(proc, data, exitCode = 0) {
  process.nextTick(() => {
    if (data) proc.writeStdout(data);
    proc.exit(exitCode);
  });
}
