#!/usr/bin/env node

import { startUI } from '../src/ui.js';
import { runCLI } from '../src/cli.js';
import { loadConfig, validateConfig } from '../src/config.js';
import { detectAgents } from '../src/agents/detector.js';

const args = process.argv.slice(2);
const cwd = process.cwd();

// Load config and detect agents before branching
const [config, detection] = await Promise.all([
  loadConfig(cwd),
  detectAgents(),
]);

const problems = validateConfig(config);
if (problems.length > 0) {
  console.error('Config warnings:', problems.join('; '));
}

if (args.length === 0) {
  // No arguments → interactive REPL
  startUI({ cwd, config, detection });
} else {
  // Non-interactive subcommand
  runCLI(args, { cwd, config, detection });
}
