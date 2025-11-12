import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const sqlite = new Database(process.env.DATABASE_URL || "optimizer.db");
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./drizzle" });
