import type { CloudflareClient } from "./client";
import {
  createMeshNode,
  deleteDeviceRegistration,
  deleteMeshNode,
  listDeviceRegistrations,
  listMeshNodes,
  renameDevice,
  renameMeshNode,
} from "./mesh";
import { nextSuffixedName } from "./names";
import type { RenameResult } from "../types";

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

type NamedTarget =
  | { kind: "node"; id: string; name: string }
  | { kind: "device"; id: string; deviceId: string; name: string };

async function collectNames(cf: CloudflareClient): Promise<{
  taken: Set<string>;
  byName: Map<string, NamedTarget>;
  targets: NamedTarget[];
}> {
  const [nodes, regs] = await Promise.all([
    listMeshNodes(cf),
    listDeviceRegistrations(cf, "all"),
  ]);

  const taken = new Set<string>();
  const byName = new Map<string, NamedTarget>();
  const targets: NamedTarget[] = [];

  for (const node of nodes) {
    const key = nameKey(node.name);
    taken.add(key);
    const target: NamedTarget = { kind: "node", id: node.id, name: node.name };
    byName.set(key, target);
    targets.push(target);
  }

  for (const reg of regs) {
    const name = reg.device?.name?.trim() || "unnamed";
    const key = nameKey(name);
    const target: NamedTarget = {
      kind: "device",
      id: reg.id,
      deviceId: reg.device?.id ?? reg.id,
      name,
    };
    targets.push(target);
    // Prefer keeping node mapping if both somehow share a name.
    if (byName.has(key)) continue;
    taken.add(key);
    byName.set(key, target);
  }

  return { taken, byName, targets };
}

async function applyRename(
  cf: CloudflareClient,
  target: NamedTarget,
  newName: string,
): Promise<void> {
  if (target.kind === "node") {
    await renameMeshNode(cf, target.id, newName);
  } else {
    await renameDevice(cf, target.deviceId, newName);
  }
}

/**
 * Rename a node or device. If `desired` is already taken by something else,
 * the existing holder is first renamed to slug+suffix (name-2, name-3, …)
 * and a notice is returned for the UI.
 */
export async function renameWithCollisionHandling(
  cf: CloudflareClient,
  kind: "node" | "device",
  id: string,
  desiredRaw: string,
): Promise<RenameResult> {
  const desired = desiredRaw.trim();
  if (!desired) throw new Error("Name is required");

  const { taken, byName, targets } = await collectNames(cf);

  const self = targets.find((t) => t.kind === kind && t.id === id);
  if (!self) {
    throw new Error(`${kind === "node" ? "Mesh node" : "Device registration"} not found`);
  }
  if (nameKey(self.name) === nameKey(desired)) {
    return {
      renamed: { id: self.id, kind: self.kind, from: self.name, to: self.name },
    };
  }

  const occupant = byName.get(nameKey(desired));
  let displaced: RenameResult["displaced"];
  let notice: string | undefined;

  if (occupant && !(occupant.kind === self.kind && occupant.id === self.id)) {
    const free = nextSuffixedName(desired, taken);
    await applyRename(cf, occupant, free);
    taken.delete(nameKey(occupant.name));
    taken.add(nameKey(free));
    displaced = {
      id: occupant.id,
      kind: occupant.kind,
      from: occupant.name,
      to: free,
    };
    notice = `Name "${desired}" was already used by ${occupant.kind} "${occupant.name}". It was renamed to "${free}" so your rename could proceed.`;
  }

  await applyRename(cf, self, desired);

  return {
    renamed: { id: self.id, kind: self.kind, from: self.name, to: desired },
    displaced,
    notice,
  };
}

export async function createNodeWithUniqueName(
  cf: CloudflareClient,
  desiredRaw: string,
): Promise<{ node: Awaited<ReturnType<typeof createMeshNode>>; notice?: string }> {
  const desired = desiredRaw.trim();
  if (!desired) throw new Error("Name is required");

  const { taken } = await collectNames(cf);
  const name = nextSuffixedName(desired, taken);
  const node = await createMeshNode(cf, name);
  const notice =
    name !== desired
      ? `Name "${desired}" was taken; created as "${name}" instead.`
      : undefined;
  return { node, notice };
}

export async function deleteMeshEntry(
  cf: CloudflareClient,
  kind: "node" | "device",
  id: string,
): Promise<void> {
  if (kind === "node") {
    await deleteMeshNode(cf, id);
  } else {
    await deleteDeviceRegistration(cf, id);
  }
}
