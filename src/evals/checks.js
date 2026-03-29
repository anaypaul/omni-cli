/**
 * Deterministic check functions for eval cases.
 *
 * Each check receives the agent run result and the case workspace path,
 * and returns { passed: boolean, detail: string }.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runCheck(check, result, workDir) {
  switch (check.type) {
    case 'file_exists':
      return checkFileExists(check, workDir);
    case 'substring':
      return checkSubstring(check, result);
    case 'regex':
      return checkRegex(check, result);
    case 'exit_code':
      return checkExitCode(check, result);
    case 'command':
      return checkCommand(check, workDir);
    default:
      return { passed: false, detail: `Unknown check type: ${check.type}` };
  }
}

async function checkFileExists(check, workDir) {
  const filePath = join(workDir, check.path);
  try {
    await access(filePath);
    return { passed: true, detail: `File exists: ${check.path}` };
  } catch {
    return { passed: false, detail: `File not found: ${check.path}` };
  }
}

function checkSubstring(check, result) {
  const target = check.in === 'stderr' ? result.stderr : result.output;
  const found = target.includes(check.value);
  return {
    passed: check.negate ? !found : found,
    detail: found
      ? `Found substring: "${check.value}"`
      : `Missing substring: "${check.value}"`,
  };
}

function checkRegex(check, result) {
  const target = check.in === 'stderr' ? result.stderr : result.output;
  const re = new RegExp(check.pattern, check.flags || '');
  const matched = re.test(target);
  return {
    passed: check.negate ? !matched : matched,
    detail: matched
      ? `Regex matched: /${check.pattern}/`
      : `Regex did not match: /${check.pattern}/`,
  };
}

function checkExitCode(check, result) {
  const expected = check.value ?? 0;
  const passed = result.exitCode === expected;
  return {
    passed,
    detail: passed
      ? `Exit code: ${result.exitCode}`
      : `Expected exit code ${expected}, got ${result.exitCode}`,
  };
}

async function checkCommand(check, workDir) {
  try {
    const { stdout } = await execFileAsync(check.command, check.args || [], {
      cwd: workDir,
      timeout: check.timeout || 30_000,
      shell: true,
    });
    return { passed: true, detail: `Command succeeded: ${stdout.trim().slice(0, 100)}` };
  } catch (err) {
    return { passed: false, detail: `Command failed: ${err.message.slice(0, 100)}` };
  }
}
