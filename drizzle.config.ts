import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/meshflare.sqlite",
  },
});
