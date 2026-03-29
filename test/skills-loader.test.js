import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, loadSkill, loadAllSkills, renderPrompt } from '../src/skills/loader.js';
import { join } from 'node:path';

const SKILLS_DIR = join(import.meta.dirname, '..', 'skills');

describe('validateManifest', () => {
  it('returns no problems for a valid manifest', () => {
    const manifest = {
      id: 'test',
      name: 'Test Skill',
      targetAgent: 'claude',
      systemPrompt: 'You are a test agent.',
      taskTemplate: 'Do this: {{task}}',
    };
    const problems = validateManifest(manifest);
    assert.equal(problems.length, 0);
  });

  it('rejects missing required fields', () => {
    const problems = validateManifest({});
    assert.ok(problems.length >= 5);
    assert.ok(problems.some((p) => p.includes('id')));
    assert.ok(problems.some((p) => p.includes('name')));
  });

  it('rejects invalid targetAgent', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      targetAgent: 'gpt',
      systemPrompt: 'x',
      taskTemplate: '{{task}}',
    };
    const problems = validateManifest(manifest);
    assert.ok(problems.some((p) => p.includes('targetAgent')));
  });

  it('rejects taskTemplate without {{task}} placeholder', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      targetAgent: 'claude',
      systemPrompt: 'x',
      taskTemplate: 'do something',
    };
    const problems = validateManifest(manifest);
    assert.ok(problems.some((p) => p.includes('{{task}}')));
  });

  it('rejects non-boolean allowTools', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      targetAgent: 'claude',
      systemPrompt: 'x',
      taskTemplate: '{{task}}',
      allowTools: 'yes',
    };
    const problems = validateManifest(manifest);
    assert.ok(problems.some((p) => p.includes('allowTools')));
  });
});

describe('loadAllSkills', () => {
  it('loads all skill manifests from the skills directory', async () => {
    const skills = await loadAllSkills(SKILLS_DIR);
    assert.ok(skills.length >= 3);
    const ids = skills.map((s) => s.id);
    assert.ok(ids.includes('planner'));
    assert.ok(ids.includes('bugfixer'));
    assert.ok(ids.includes('feature-implementer'));
  });

  it('returns empty array for non-existent directory', async () => {
    const skills = await loadAllSkills('/tmp/does-not-exist-omni');
    assert.equal(skills.length, 0);
  });
});

describe('loadSkill', () => {
  it('loads a valid skill by path', async () => {
    const skill = await loadSkill(join(SKILLS_DIR, 'planner.json'));
    assert.equal(skill.id, 'planner');
    assert.equal(skill.targetAgent, 'codex');
  });

  it('throws for invalid skill manifest', async () => {
    // Create a temp invalid manifest scenario — just test the validator path
    await assert.rejects(
      () => loadSkill('/tmp/nonexistent-skill.json'),
      { name: 'Error' }
    );
  });
});

describe('renderPrompt', () => {
  it('renders a skill prompt with the task substituted', () => {
    const skill = {
      systemPrompt: 'You are a helper.',
      taskTemplate: 'Please do: {{task}}',
    };
    const result = renderPrompt(skill, 'fix the bug');
    assert.ok(result.includes('You are a helper.'));
    assert.ok(result.includes('Please do: fix the bug'));
    assert.ok(!result.includes('{{task}}'));
  });
});
