import { HTTPException } from "hono/http-exception";
import type { CloudflareClient } from "./client";
import { loadMeshInventory, syncMeshDns } from "./dns";
import type { DnsSyncStats } from "./gateway";
import { recreateMeshNode } from "./mesh";
import { assignMeshHostnames, isValidMeshLabel, meshLabelKey, normalizeMeshLabel } from "./names";
import { deleteMeshEntry, renameWithCollisionHandling } from "./rename";
import { readAppData, updateAppData } from "../db/settings";
import { markDnsSynced } from "../settings";
import type { Env, MeshEntry, MeshKind, MeshNode, RenameResult } from "../types";

export type MeshEntryPatch = { name?: string; meshLabel?: string | null };

export type MeshEntryUpdate = Partial<RenameResult> & {
  entry: MeshEntry;
  dns?: DnsSyncStats;
};

function notFound(kind: MeshKind): HTTPException {
  return new HTTPException(404, {
    message: `${kind === "node" ? "Mesh node" : "Device"} not found`,
  });
}

/**
 * Rename an entry and/or set its hostname label, then resync DNS from the
 * known post-change state so the new hostname resolves immediately and the
 * old one is removed without waiting for the missing-grace period.
 */
export async function updateMeshEntry(
  cf: CloudflareClient,
  env: Env,
  kind: MeshKind,
  id: string,
  patch: MeshEntryPatch,
): Promise<MeshEntryUpdate> {
  const { entries, appData, suffix } = await loadMeshInventory(cf, env);
  const self = entries.find((e) => e.kind === kind && e.id === id);
  if (!self) throw notFound(kind);

  const key = meshLabelKey(kind, id);
  const meshLabels = { ...appData.meshLabels };
  let labelChanged = false;

  if (patch.meshLabel !== undefined) {
    const label = normalizeMeshLabel(patch.meshLabel);
    if (label !== null) {
      if (!isValidMeshLabel(label)) {
        throw new HTTPException(400, {
          message: "Hostname label may only contain a-z, 0-9 and inner hyphens (max 63 characters)",
        });
      }
      const hostname = `${label}.${suffix}`;
      const holder = entries.find((e) => e !== self && e.meshHostname === hostname);
      if (holder) {
        throw new HTTPException(409, {
          message: `${hostname} is already used by ${holder.kind} "${holder.name}"`,
        });
      }
      meshLabels[key] = label;
    } else {
      delete meshLabels[key];
    }
    labelChanged = (appData.meshLabels[key] ?? null) !== (meshLabels[key] ?? null);
  }

  const rename = patch.name !== undefined && patch.name.trim() !== self.name
    ? await renameWithCollisionHandling(cf, kind, id, patch.name)
    : undefined;
  const renamed = rename && rename.renamed.from !== rename.renamed.to;

  if (!renamed && !labelChanged) return { ...rename, entry: self };

  if (labelChanged) await updateAppData(env.DB, { meshLabels });

  // Re-derive hostnames from the patched state; Cloudflare listings may lag the rename.
  const previousHosts = new Map(entries.map((e) => [meshLabelKey(e.kind, e.id), e.meshHostname]));
  const nameChanges = new Map(
    [rename?.renamed, rename?.displaced]
      .filter((change) => change !== undefined)
      .map((change) => [meshLabelKey(change.kind, change.id), change.to]),
  );
  const patched = entries.map((e) => ({
    ...e,
    name: nameChanges.get(meshLabelKey(e.kind, e.id)) ?? e.name,
  }));
  assignMeshHostnames(patched, suffix, meshLabels);

  const purgeHosts = patched
    .map((e) => previousHosts.get(meshLabelKey(e.kind, e.id)))
    .filter((host, idx): host is string => Boolean(host) && host !== patched[idx].meshHostname);

  const dns = await syncMeshDns(cf, env, {
    inventory: { entries: patched, appData: { ...appData, meshLabels } },
    purgeHosts,
  });
  await markDnsSynced(env);

  return {
    ...rename,
    entry: patched.find((e) => e.kind === kind && e.id === id)!,
    dns,
  };
}

/** Delete a node/device, forget its stored label/binding and drop its DNS rule. */
export async function removeMeshEntry(
  cf: CloudflareClient,
  env: Env,
  kind: MeshKind,
  id: string,
): Promise<DnsSyncStats> {
  const { entries, appData, suffix } = await loadMeshInventory(cf, env);
  const entry = entries.find((e) => e.kind === kind && e.id === id);
  await deleteMeshEntry(cf, kind, id);

  const meshLabels = { ...appData.meshLabels };
  delete meshLabels[meshLabelKey(kind, id)];
  const nodeBindings = { ...appData.nodeBindings };
  if (kind === "node") delete nodeBindings[id];
  await updateAppData(env.DB, { meshLabels, nodeBindings });

  const remaining = entries.filter((e) => e !== entry).map((e) => ({ ...e }));
  assignMeshHostnames(remaining, suffix, meshLabels);

  const dns = await syncMeshDns(cf, env, {
    inventory: { entries: remaining, appData: { ...appData, meshLabels, nodeBindings } },
    purgeHosts: entry?.meshHostname ? [entry.meshHostname] : [],
  });
  await markDnsSynced(env);
  return dns;
}

/** Recreate a node with a fresh token; its custom hostname label follows it. */
export async function regenerateMeshNode(
  cf: CloudflareClient,
  env: Env,
  id: string,
): Promise<{ node: MeshNode; dns: DnsSyncStats }> {
  const node = await recreateMeshNode(cf, id);

  const { meshLabels } = await readAppData(env.DB);
  const oldKey = meshLabelKey("node", id);
  if (meshLabels[oldKey]) {
    const next = { ...meshLabels, [meshLabelKey("node", node.id)]: meshLabels[oldKey] };
    delete next[oldKey];
    await updateAppData(env.DB, { meshLabels: next });
  }

  const dns = await syncMeshDns(cf, env);
  await markDnsSynced(env);
  return { node, dns };
}
