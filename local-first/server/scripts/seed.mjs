import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
const seedPath = path.join(__dirname, '../../db/seed/dev_seed.sql');
const sql = fs.readFileSync(seedPath, 'utf8');

await client.connect();
await client.query(sql);
await client.end();
console.log('Seed applied:', seedPath);
