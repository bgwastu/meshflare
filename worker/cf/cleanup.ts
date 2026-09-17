import type { CloudflareClient } from "./client";
import { deleteDeviceRegistration, listDeviceRegistrations, listMeshNodes } from "./mesh";
import { daysSince, isConnectorRegistration } from "./names";

export type CleanupStats = {
  scanned: number;
  deleted: number;
  deletedOrphanConnectors: number;
  skippedConnector: number;
  skippedRecent: number;
  deletedNames: string[];
};

/** Delete device registrations offline longer than `offlineDays` and prune orphan connector registrations. */
export async function cleanupOfflineDevices(
  cf: CloudflareClient,
  offlineDays: number,
  now = Date.now(),
): Promise<CleanupStats> {
  const [nodes, regs] = await Promise.all([
    listMeshNodes(cf),
    listDeviceRegistrations(cf, "all"),
  ]);

  const activeNodeNames = new Set(nodes.map((n) => n.name.trim().toLowerCase()));
  const activeConnectionClientIds = new Set<string>();
  for (const node of nodes) {
    for (const conn of node.connections ?? []) {
      const id = conn.client_id ?? conn.id ?? conn.uuid;
      if (id) activeConnectionClientIds.add(id);
    }
  }

  const stats: CleanupStats = {
    scanned: regs.length,
    deleted: 0,
    deletedOrphanConnectors: 0,
    skippedConnector: 0,
    skippedRecent: 0,
    deletedNames: [],
  };

  const toDelete: Array<{ id: string; name: string; isOrphanConnector: boolean }> = [];

  for (const reg of regs) {
    const isConnector = isConnectorRegistration(reg);

    if (isConnector) {
      const regName = reg.device?.name?.trim().toLowerCase() ?? "";
      const matchesActiveTunnel =
        activeConnectionClientIds.has(reg.id) ||
        (reg.device?.id && activeConnectionClientIds.has(reg.device.id)) ||
        (regName && activeNodeNames.has(regName));

      if (!matchesActiveTunnel) {
        // Orphan connector registration from a deleted or recreated mesh node.
        toDelete.push({ id: reg.id, name: reg.device?.name ?? reg.id, isOrphanConnector: true });
        continue;
      }

      stats.skippedConnector += 1;
      continue;
    }

    const effectiveTimestamp = reg.last_seen_at ?? reg.created_at;
    const days = daysSince(effectiveTimestamp, now);
    if (days === null || days <= offlineDays) {
      stats.skippedRecent += 1;
      continue;
    }

    toDelete.push({ id: reg.id, name: reg.device?.name ?? reg.id, isOrphanConnector: false });
  }

  const BATCH_SIZE = 6;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = toDelete.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        await deleteDeviceRegistration(cf, item.id);
        stats.deleted += 1;
        if (item.isOrphanConnector) {
          stats.deletedOrphanConnectors += 1;
        }
        stats.deletedNames.push(item.name);
      }),
    );
  }

  return stats;
}
