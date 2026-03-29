import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseREPLInput, parseCommand } from '../src/dispatcher.js';

describe('parseREPLInput', () => {
  it('parses @agent prefix', () => {
    const result = parseREPLInput('@codex do something');
    assert.equal(result.route, 'codex');
    assert.equal(result.prompt, 'do something');
  });

  it('defaults to claude when no prefix', () => {
    const result = parseREPLInput('just a prompt');
    assert.equal(result.route, 'claude');
    assert.equal(result.prompt, 'just a prompt');
  });

  it('handles @plan prefix', () => {
    const result = parseREPLInput('@plan build a feature');
    assert.equal(result.route, 'plan');
    assert.equal(result.prompt, 'build a feature');
  });

  it('is case insensitive for agent name', () => {
    const result = parseREPLInput('@Claude do this');
    assert.equal(result.route, 'claude');
  });

  it('handles @eval prefix', () => {
    const result = parseREPLInput('@eval planner');
    assert.equal(result.route, 'eval');
    assert.equal(result.prompt, 'planner');
  });

  it('handles @auto prefix', () => {
    const result = parseREPLInput('@auto fix the login bug');
    assert.equal(result.route, 'auto');
    assert.equal(result.prompt, 'fix the login bug');
  });

  it('handles @gemini prefix', () => {
    const result = parseREPLInput('@gemini explain this');
    assert.equal(result.route, 'gemini');
    assert.equal(result.prompt, 'explain this');
  });
});

describe('parseCommand', () => {
  it('splits into command and args', () => {
    const result = parseCommand('skills list');
    assert.equal(result.command, 'skills');
    assert.equal(result.args, 'list');
  });

  it('handles single command with no args', () => {
    const result = parseCommand('help');
    assert.equal(result.command, 'help');
    assert.equal(result.args, '');
  });

  it('handles multi-word args', () => {
    const result = parseCommand('implement planner add new feature');
    assert.equal(result.command, 'implement');
    assert.equal(result.args, 'planner add new feature');
  });
});
