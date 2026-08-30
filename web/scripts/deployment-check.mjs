#!/usr/bin/env node
/**
 * EDULINK Production Deployment Checklist
 * Run this before promoting to production
 */

import fs from 'fs';
import path from 'path';

interface CheckItem {
  name: string;
  check: () => boolean | Promise<boolean>;
  critical: boolean;
}

const checks: CheckItem[] = [
  {
    name: 'Environment variables configured',
    check: () => {
      const vars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_APP_URL'];
      return vars.every((v) => process.env[v]);
    },
    critical: true,
  },
  {
    name: 'Build directory exists',
    check: () => fs.existsSync(path.join(process.cwd(), '.next')),
    critical: true,
  },
  {
    name: 'Node modules installed',
    check: () => fs.existsSync(path.join(process.cwd(), 'node_modules')),
    critical: true,
  },
  {
    name: 'Security headers configured',
    check: () => {
      const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf-8');
      return config.includes('Content-Security-Policy') && config.includes('Strict-Transport-Security');
    },
    critical: true,
  },
  {
    name: 'Vercel config present',
    check: () => fs.existsSync(path.join(process.cwd(), '..', 'vercel.json')),
    critical: true,
  },
];

async function runChecks() {
  console.log('🔍 EDULINK Production Deployment Checklist\n');

  let passed = 0;
  let failed = 0;
  let criticalFailed = false;

  for (const item of checks) {
    try {
      const result = await item.check();
      const status = result ? '✓' : '✗';
      const severity = item.critical ? '⚠️  CRITICAL' : '';

      if (result) {
        console.log(`${status} ${item.name}`);
        passed++;
      } else {
        console.log(`${status} ${item.name} ${severity}`);
        failed++;
        if (item.critical) criticalFailed = true;
      }
    } catch (error) {
      console.log(`✗ ${item.name} (ERROR: ${(error as Error).message})`);
      failed++;
      if (item.critical) criticalFailed = true;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (criticalFailed) {
    console.log('\n❌ Critical checks failed. Cannot deploy to production.');
    process.exit(1);
  }

  if (failed === 0) {
    console.log('\n✅ All checks passed! Ready for production deployment.');
    process.exit(0);
  }

  console.log('\n⚠️  Some non-critical checks failed. Review before deploying.');
  process.exit(0);
}

runChecks().catch((error) => {
  console.error('Checklist error:', error);
  process.exit(1);
});
