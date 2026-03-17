#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');

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

const loaded = dotenv.config({ path: envFilePath, override: true });

if (loaded.error) {
  console.error(`Failed to load env file: ${envFilePath}`);
  console.error(loaded.error.message);
  process.exit(1);
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
