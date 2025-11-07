import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Create SQLite database with WAL mode for better concurrent access
const sqlite = new Database(process.env.DATABASE_URL || 'optimizer.db');
sqlite.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle({ client: sqlite, schema });
