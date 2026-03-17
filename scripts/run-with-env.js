#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [, , envFileArg, separator, ...commandArgs] = process.argv;

if (!envFileArg || separator !== '--' || commandArgs.length === 0) {
  console.error('Usage: node scripts/run-with-env.js <env-file> -- <command> [args...]');
  process.exit(1);
}

const envFilePath = path.resolve(process.cwd(), envFileArg);

if (!fs.existsSync(envFilePath)) {
  console.error(`Environment file not found: ${envFilePath}`);
  process.exit(1);
}

const envContent = fs.readFileSync(envFilePath, 'utf8');
const envLines = envContent.split(/\r?\n/);

for (const rawLine of envLines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) {
    continue;
  }

  const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    continue;
  }

  const [, key, rawValue] = match;
  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  process.env[key] = value;
}

const [command, ...args] = commandArgs;
const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
