import type { CloudflareClient } from "./client";
import { deleteDeviceRegistration, listDeviceRegistrations } from "./mesh";
import { daysSince, isConnectorRegistration } from "./names";

export type CleanupStats = {
  scanned: number;
  deleted: number;
  skippedConnector: number;
  skippedRecent: number;
  deletedNames: string[];
};

/** Delete device registrations offline longer than `offlineDays`. Nodes never auto-deleted. */
export async function cleanupOfflineDevices(
  cf: CloudflareClient,
  offlineDays: number,
  now = Date.now(),
): Promise<CleanupStats> {
  const regs = await listDeviceRegistrations(cf, "active");
  const stats: CleanupStats = {
    scanned: regs.length,
    deleted: 0,
    skippedConnector: 0,
    skippedRecent: 0,
    deletedNames: [],
  };

  for (const reg of regs) {
    if (isConnectorRegistration(reg)) {
      stats.skippedConnector += 1;
      continue;
    }

    const effectiveTimestamp = reg.last_seen_at ?? reg.created_at;
    const days = daysSince(effectiveTimestamp, now);
    if (days === null || days <= offlineDays) {
      stats.skippedRecent += 1;
      continue;
    }

    await deleteDeviceRegistration(cf, reg.id);
    stats.deleted += 1;
    stats.deletedNames.push(reg.device?.name ?? reg.id);
  }

  return stats;
}
