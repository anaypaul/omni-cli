import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAgent, detectAgents, isAgentAvailable } from '../src/agents/detector.js';

describe('detectAgents', () => {
  it('returns object with claude, codex, gemini keys', async () => {
    const result = await detectAgents();
    assert.ok('claude' in result);
    assert.ok('codex' in result);
    assert.ok('gemini' in result);
  });

  it('each entry has available, path, and version fields', async () => {
    const result = await detectAgents();
    for (const name of ['claude', 'codex', 'gemini']) {
      const entry = result[name];
      assert.ok('available' in entry, `${name} missing available`);
      assert.ok('path' in entry, `${name} missing path`);
      assert.ok('version' in entry, `${name} missing version`);
      assert.equal(typeof entry.available, 'boolean');
    }
  });
});

describe('isAgentAvailable', () => {
  it('returns true for available agent', () => {
    const detection = {
      claude: { available: true, path: '/usr/bin/claude', version: '1.0' },
      codex: { available: false, path: null, version: null },
      gemini: { available: false, path: null, version: null },
    };
    assert.equal(isAgentAvailable(detection, 'claude'), true);
  });

  it('returns false for unavailable agent', () => {
    const detection = {
      claude: { available: false, path: null, version: null },
      codex: { available: false, path: null, version: null },
      gemini: { available: false, path: null, version: null },
    };
    assert.equal(isAgentAvailable(detection, 'claude'), false);
  });

  it('returns false for unknown agent name', () => {
    const detection = {
      claude: { available: true, path: '/usr/bin/claude', version: '1.0' },
    };
    assert.equal(isAgentAvailable(detection, 'unknown'), false);
  });
});

describe('detectAgent', () => {
  it('returns unavailable for nonexistent CLI name', async () => {
    const result = await detectAgent('nonexistent_cli_xyz');
    assert.equal(result.available, false);
    assert.equal(result.path, null);
    assert.equal(result.version, null);
  });
});
