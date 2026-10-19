/** Create the application database if it does not exist (connects to the `postgres` maintenance database). */
import { databaseUrl, withClient } from './lib/db';

const target = new URL(databaseUrl);
const name = decodeURIComponent(target.pathname.replace(/^\//, ''));
if (!/^[A-Za-z0-9_]+$/.test(name)) {
  console.error(`Refusing to create database with unsafe name "${name}".`);
  process.exit(1);
}

const admin = new URL(databaseUrl);
admin.pathname = '/postgres';

await withClient(admin.toString(), async (client) => {
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (exists.rowCount) {
    console.log(`database "${name}" already exists`);
    return;
  }
  await client.query(`CREATE DATABASE "${name}"`);
  console.log(`created database "${name}"`);
});
