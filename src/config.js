import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const VALID_AGENTS = ['claude', 'codex', 'gemini'];

const DEFAULTS = {
  preferredAgent: 'claude',
  judgeAgent: 'claude',
  disableAgents: [],
  agents: {
    claude: {},
    codex: {},
    gemini: {},
  },
};

export async function loadConfig(cwd = process.cwd()) {
  let fileConfig = {};
  try {
    const raw = await readFile(join(cwd, '.omnirc.json'), 'utf-8');
    fileConfig = JSON.parse(raw);
  } catch {
    // No config file or invalid JSON -- use defaults
  }

  const config = {
    preferredAgent: fileConfig.preferredAgent || process.env.OMNI_PREFERRED_AGENT || DEFAULTS.preferredAgent,
    judgeAgent: fileConfig.judgeAgent || process.env.OMNI_JUDGE_AGENT || DEFAULTS.judgeAgent,
    disableAgents: fileConfig.disableAgents || (process.env.OMNI_DISABLE_AGENTS ? process.env.OMNI_DISABLE_AGENTS.split(',').map(s => s.trim()) : DEFAULTS.disableAgents),
    agents: { ...DEFAULTS.agents, ...fileConfig.agents },
  };

  return config;
}

export function validateConfig(config) {
  const problems = [];
  if (config.preferredAgent && !VALID_AGENTS.includes(config.preferredAgent)) {
    problems.push(`preferredAgent must be one of: ${VALID_AGENTS.join(', ')}`);
  }
  if (config.judgeAgent && !VALID_AGENTS.includes(config.judgeAgent)) {
    problems.push(`judgeAgent must be one of: ${VALID_AGENTS.join(', ')}`);
  }
  if (config.disableAgents && !Array.isArray(config.disableAgents)) {
    problems.push('disableAgents must be an array');
  }
  return problems;
}
