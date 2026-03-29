#!/usr/bin/env node

import { startUI } from '../src/ui.js';
import { runCLI } from '../src/cli.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  // No arguments → interactive REPL
  startUI({ cwd: process.cwd() });
} else {
  // Non-interactive subcommand
  runCLI(args, { cwd: process.cwd() });
}
