import { spawn } from 'node:child_process';

/**
 * @typedef {Object} AgentRunOptions
 * @property {Function} [onData] - Streaming callback, called with text chunks
 * @property {Function} [onEvent] - Structured event callback for AgentEvent objects
 * @property {string} [cwd] - Override working directory for this run
 * @property {boolean} [allowTools] - Allow the agent to use tools (Claude-specific)
 * @property {boolean} [readOnly] - Run in read-only/sandbox mode (Codex-specific)
 */

/**
 * @typedef {Object} AgentResult
 * @property {string} output - Full accumulated text output
 * @property {string} stderr - Stderr content
 * @property {number} exitCode - Process exit code
 * @property {number} durationMs - Wall-clock execution time in milliseconds
 * @property {string} agent - Agent name identifier (e.g., 'claude', 'codex')
 * @property {string|null} sessionId - Session/thread ID for conversation continuation
 */

/**
 * BaseAgent — abstract base class for all CLI agent adapters.
 * Subclasses must override: run(prompt, options), get name()
 */
export class BaseAgent {
  constructor(options = {}) {
    if (new.target === BaseAgent) {
      throw new Error('BaseAgent is abstract and cannot be instantiated directly');
    }
    this.cwd = options.cwd || process.cwd();
    this._spawn = options.spawn || null;
    this._sessionId = null;
    this._proc = null;
  }

  get name() {
    throw new Error('Subclass must implement get name()');
  }

  get sessionId() {
    return this._sessionId;
  }

  set sessionId(value) {
    this._sessionId = value;
  }

  async run(_prompt, _options = {}) {
    throw new Error('Subclass must implement run()');
  }

  resetSession() {
    this._sessionId = null;
  }

  kill() {
    if (this._proc && !this._proc.killed) {
      this._proc.kill('SIGTERM');
    }
  }
}
