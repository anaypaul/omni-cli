import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const AGENT_CLIS = {
  claude: { bin: 'claude', versionFlag: '--version' },
  codex: { bin: 'codex', versionFlag: '--version' },
  gemini: { bin: 'gemini', versionFlag: '--version' },
};

export async function detectAgent(name) {
  const cli = AGENT_CLIS[name];
  if (!cli) return { available: false, path: null, version: null };

  try {
    const { stdout } = await exec('which', [cli.bin], { timeout: 5000 });
    const path = stdout.trim();

    let version = null;
    try {
      const { stdout: vOut } = await exec(cli.bin, [cli.versionFlag], { timeout: 5000 });
      version = vOut.trim().split('\n')[0];
    } catch {
      // CLI exists but --version failed; still available
    }

    return { available: true, path, version };
  } catch {
    return { available: false, path: null, version: null };
  }
}

export async function detectAgents() {
  const results = {};
  const names = Object.keys(AGENT_CLIS);
  const detections = await Promise.all(names.map(detectAgent));
  for (let i = 0; i < names.length; i++) {
    results[names[i]] = detections[i];
  }
  return results;
}

export function isAgentAvailable(detection, name) {
  return detection[name]?.available === true;
}
