/**
 * Skill manifest loader and validator.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const REQUIRED_FIELDS = ['id', 'name', 'targetAgent', 'systemPrompt', 'taskTemplate'];
const VALID_AGENTS = ['claude', 'codex'];

export class SkillValidationError extends Error {
  constructor(id, problems) {
    super(`Skill "${id}" validation failed:\n  - ${problems.join('\n  - ')}`);
    this.name = 'SkillValidationError';
    this.problems = problems;
  }
}

export function validateManifest(manifest) {
  const problems = [];

  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      problems.push(`missing required field: ${field}`);
    }
  }

  if (manifest.targetAgent && !VALID_AGENTS.includes(manifest.targetAgent)) {
    problems.push(`targetAgent must be one of: ${VALID_AGENTS.join(', ')}`);
  }

  if (manifest.allowTools !== undefined && typeof manifest.allowTools !== 'boolean') {
    problems.push('allowTools must be a boolean');
  }

  if (manifest.taskTemplate && !manifest.taskTemplate.includes('{{task}}')) {
    problems.push('taskTemplate must contain {{task}} placeholder');
  }

  return problems;
}

export async function loadSkill(skillPath) {
  const raw = await readFile(skillPath, 'utf-8');
  const manifest = JSON.parse(raw);

  const problems = validateManifest(manifest);
  if (problems.length > 0) {
    throw new SkillValidationError(manifest.id || skillPath, problems);
  }

  return manifest;
}

export async function loadAllSkills(skillsDir) {
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const fullPath = join(skillsDir, entry.name);
      const skill = await loadSkill(fullPath);
      skills.push(skill);
    }
  }

  return skills;
}

export function renderPrompt(skill, task) {
  const rendered = skill.taskTemplate.replace('{{task}}', task);
  return `${skill.systemPrompt}\n\n${rendered}`;
}
