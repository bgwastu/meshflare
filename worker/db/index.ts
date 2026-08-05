import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { schema } from "./schema";
import type { AppDatabase } from "../types";

export function createD1Database(database: D1Database): AppDatabase {
  return drizzleD1(database, { schema }) as AppDatabase;
}
