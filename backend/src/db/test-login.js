// Tries both logins against the RUNNING server (npm run dev must be on), using the passwords in backend/.env.
// Also checks how the password lines are written in .env. Never prints a password.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env');

function inspectLine(name) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => l.trim().startsWith(`${name}=`) || l.trim().startsWith(`${name} =`));
  if (lines.length === 0) return `  ${name}: line not found in .env`;
  const notes = [];
  if (lines.length > 1) notes.push(`written ${lines.length} times (only the first counts)`);
  const raw = lines[0].slice(lines[0].indexOf('=') + 1);
  if (/^\s|\s$/.test(raw)) notes.push('has spaces before/after the password (they are removed)');
  if (/^["']/.test(raw.trim())) notes.push('is inside quotes (the quotes are NOT part of the password)');
  if (/\s#/.test(raw) || (/#/.test(raw) && !/^["']/.test(raw.trim()))) notes.push('has # (without quotes, everything after # is ignored)');
  return `  ${name}: ${notes.length ? notes.join('; ') : 'written normally'}`;
}

async function tryLogin(label, url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    console.log(`  ${label}: ${res.ok ? 'LOGIN WORKS' : `FAILED (${res.status}) – ${data.error || 'no message'}`}`);
  } catch (e) {
    console.log(`  ${label}: could not reach ${url} – is "npm run dev" running? (${e.cause?.code || e.message})`);
  }
}

console.log('\nHow the passwords are written in backend/.env:');
console.log(inspectLine('OWNER_PASSWORD'));
console.log(inspectLine('SEED_ADMIN_PASSWORD'));

const base = `http://localhost:${env.port}/api`;
console.log(`\nLogging in on the running server (${base}) with the .env passwords:`);
await tryLogin(`Owner  "${env.ownerUsername}"`, `${base}/owner/login`, { username: env.ownerUsername, password: env.ownerPassword });
await tryLogin(`Client "${env.seedAdminUsername}" (${env.defaultCompanyCode})`, `${base}/auth/login`, { username: env.seedAdminUsername, password: env.seedAdminPassword });
console.log('\nIf both say LOGIN WORKS, the server is fine: type exactly the password from .env (without quotes or spaces).');
