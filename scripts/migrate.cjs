'use strict';
require('dotenv').config({ path: '.env' });

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const count = direction === 'down' ? Number(process.argv[3] || 1) : Infinity;

(async () => {
  const { runner } = await import('node-pg-migrate');
  try {
    const applied = await runner({
      databaseUrl: process.env.DATABASE_URL,
      dir: 'migrations',
      migrationsTable: 'pgmigrations',
      direction,
      count,
      verbose: false,
    });
    console.log(`[migrate] applied ${applied.length} migration(s)`);
  } catch (err) {
    console.error('[migrate] failed:', err.message);
    process.exit(1);
  }
})();
