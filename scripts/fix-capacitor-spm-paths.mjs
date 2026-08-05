import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageFile = resolve('ios/App/CapApp-SPM/Package.swift');
if (existsSync(packageFile)) {
  const source = readFileSync(packageFile, 'utf8');
  const normalized = source.replaceAll('\\', '/');
  if (normalized !== source) writeFileSync(packageFile, normalized, 'utf8');
}
