import { execFileSync } from 'node:child_process';

export function spawnFileSync(command, args, cwd) {
  try {
    const stdout = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    throw new Error(`${command} failed with exit code ${error.status ?? 'unknown'}: ${(error.stderr || error.message || '').toString().trim()}`);
  }
}
