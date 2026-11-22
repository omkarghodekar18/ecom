// Verifies the user-space PostgreSQL instance and ensures dev/test databases exist.
const { Client } = require('pg');

async function main() {
  const c = new Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' });
  await c.connect();
  for (const db of ['toolhub', 'toolhub_test']) {
    const exists = await c.query('select 1 from pg_database where datname = $1', [db]);
    if (exists.rowCount === 0) {
      await c.query(`CREATE DATABASE ${db}`);
      console.log(`DB ${db} created`);
    } else {
      console.log(`DB ${db} ok`);
    }
  }
  await c.end();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
