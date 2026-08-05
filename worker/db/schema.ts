import { integer, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  offlineDays: integer("offline_days").notNull().default(7),
  dnsFilterEnabled: integer("dns_filter_enabled", { mode: "boolean" }).notNull().default(false),
  dnsFilterStatus: text("dns_filter_status").notNull().default("idle"),
  dnsFilterUrl: text("dns_filter_url").notNull(),
  dnsFilterLastSyncedAt: text("dns_filter_last_synced_at"),
  dnsFilterCursor: integer("dns_filter_cursor").notNull().default(0),
  meshSuffix: text("mesh_suffix").notNull().default("mesh"),
  lastDnsSyncAt: text("last_dns_sync_at"),
  lastCleanupAt: text("last_cleanup_at"),
  dnsMissingSinceJson: text("dns_missing_since_json").notNull().default("{}"),
});

export const dnsFilterDomains = sqliteTable(
  "dns_filter_domains",
  {
    sourceUrl: text("source_url").notNull(),
    position: integer("position").notNull(),
    domain: text("domain").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sourceUrl, table.position] }),
  }),
);

export const schema = { settings, dnsFilterDomains };
