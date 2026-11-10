import { describe, expect, it } from "bun:test";
import { auditMeshRouting, ensureMeshRouting, type SplitTunnelConfig } from "./cf/split-tunnels";
import {
  assignMeshHostnames,
  isReservedFallbackSuffix,
  isValidMeshLabel,
  meshHostname,
  normalizeMeshLabel,
  slugifyName,
} from "./cf/names";
import { desiredMeshHosts } from "./cf/dns";
import { managedMeshRulesByHost, sameIps } from "./cf/gateway";
import { decodeConnectorToken } from "./wg/token";
import { meshEntrySchema, splitTunnelsSchema, settingsSchema } from "./routes/schemas";
import type { MeshEntry } from "./types";

function entry(kind: "node" | "device", id: string, name: string, ipv4: string | null = null): MeshEntry {
  return {
    kind,
    id,
    name,
    meshHostname: null,
    meshLabel: null,
    ipv4,
    ipv6: null,
    status: "online",
    lastSeenAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    isConnector: kind === "node",
  };
}

describe("Cloudflare Split Tunnels & Mesh Routing", () => {
  it("detects when mesh subnet is missing in include mode", () => {
    const config: SplitTunnelConfig = {
      mode: "include",
      include: [{ address: "192.168.1.0/24" }],
      exclude: [],
    };
    const audit = auditMeshRouting(config);
    expect(audit.meshIpsRouted).toBe(false);
    expect(audit.warning).toBeDefined();
  });

  it("ensures mesh subnet is added in include mode", () => {
    const config: SplitTunnelConfig = {
      mode: "include",
      include: [{ address: "192.168.1.0/24" }],
      exclude: [],
    };
    const remediated = ensureMeshRouting(config);
    expect(remediated.include.some((i) => i.address === "100.96.0.0/12")).toBe(true);
    const audit = auditMeshRouting(remediated);
    expect(audit.meshIpsRouted).toBe(true);
  });

  it("ensures 100.64.0.0/10 and 100.96.0.0/12 are removed in exclude mode", () => {
    const config: SplitTunnelConfig = {
      mode: "exclude",
      include: [],
      exclude: [
        { address: "100.64.0.0/10", description: "RFC 6598" },
        { address: "192.168.0.0/16", description: "LAN" },
      ],
    };
    const audit = auditMeshRouting(config);
    expect(audit.meshIpsRouted).toBe(false);

    const remediated = ensureMeshRouting(config);
    expect(remediated.exclude.some((i) => i.address === "100.64.0.0/10")).toBe(false);
    expect(remediated.exclude.some((i) => i.address === "192.168.0.0/16")).toBe(true);
    const postAudit = auditMeshRouting(remediated);
    expect(postAudit.meshIpsRouted).toBe(true);
  });
});

describe("DNS & Local Domain Fallback", () => {
  it("identifies reserved fallback suffixes that bypass Gateway", () => {
    expect(isReservedFallbackSuffix("local")).toBe(true);
    expect(isReservedFallbackSuffix("internal")).toBe(true);
    expect(isReservedFallbackSuffix("lan")).toBe(true);
    expect(isReservedFallbackSuffix("home.arpa")).toBe(true);
    expect(isReservedFallbackSuffix("mesh")).toBe(false);
    expect(isReservedFallbackSuffix("net")).toBe(false);
  });

  it("validates settingsSchema rejects reserved fallback suffixes", () => {
    const valid = settingsSchema.safeParse({ meshSuffix: "lab" });
    expect(valid.success).toBe(true);

    const reserved = settingsSchema.safeParse({ meshSuffix: "internal" });
    expect(reserved.success).toBe(false);

    const dotReserved = settingsSchema.safeParse({ meshSuffix: ".local" });
    expect(dotReserved.success).toBe(false);
  });

  it("formats RFC 1123 compliant mesh hostnames", () => {
    expect(slugifyName("my-server")).toBe("my-server");
    expect(slugifyName("---my-server---")).toBe("my-server");
    expect(meshHostname("Production Server #1", "mesh")).toBe("production-server-1.mesh");
  });
});

describe("WARP Connector Token Decoder", () => {
  it("decodes valid connector token", () => {
    const payload = { a: "account-123", t: "tunnel-456", s: "secret-789" };
    const encoded = btoa(JSON.stringify(payload));
    const decoded = decodeConnectorToken(encoded);
    expect(decoded.account_tag).toBe("account-123");
    expect(decoded.tunnel_id).toBe("tunnel-456");
    expect(decoded.tunnel_secret).toBe("secret-789");
  });

  it("safely rejects invalid or malformed tokens", () => {
    expect(() => decodeConnectorToken("invalid-base64!@#")).toThrow();
    expect(() => decodeConnectorToken(btoa("not-json"))).toThrow();
    expect(() => decodeConnectorToken(btoa(JSON.stringify({ a: "1" })))).toThrow();
  });
});

describe("Mesh hostname labels", () => {
  it("derives unique hostnames from names with numeric suffixes", () => {
    const entries = assignMeshHostnames(
      [entry("node", "a", "Laptop"), entry("device", "b", "laptop"), entry("device", "c", "LAPTOP")],
      "mesh",
      {},
    );
    expect(entries.map((e) => e.meshHostname)).toEqual(["laptop.mesh", "laptop-2.mesh", "laptop-3.mesh"]);
    expect(entries.every((e) => e.meshLabel === null)).toBe(true);
  });

  it("lets custom labels claim their hostname before derived names", () => {
    const entries = assignMeshHostnames(
      [entry("node", "a", "laptop"), entry("device", "b", "Work PC")],
      "mesh",
      { "device:b": "laptop" },
    );
    expect(entries[1].meshHostname).toBe("laptop.mesh");
    expect(entries[1].meshLabel).toBe("laptop");
    expect(entries[0].meshHostname).toBe("laptop-2.mesh");
  });

  it("ignores invalid or duplicate stored labels", () => {
    const entries = assignMeshHostnames(
      [entry("node", "a", "one"), entry("node", "b", "two"), entry("node", "c", "three")],
      "lan.example",
      { "node:a": "shared", "node:b": "shared", "node:c": "Bad_Label" },
    );
    expect(entries.map((e) => e.meshHostname)).toEqual([
      "shared.lan.example",
      "two.lan.example",
      "three.lan.example",
    ]);
  });

  it("validates and normalizes labels", () => {
    expect(normalizeMeshLabel("  NAS ")).toBe("nas");
    expect(normalizeMeshLabel("   ")).toBeNull();
    expect(normalizeMeshLabel(null)).toBeNull();
    expect(isValidMeshLabel("nas-01")).toBe(true);
    expect(isValidMeshLabel("-nas")).toBe(false);
    expect(isValidMeshLabel("nas.home")).toBe(false);
    expect(isValidMeshLabel("a".repeat(64))).toBe(false);
  });

  it("requires a name or label when editing an entry", () => {
    expect(meshEntrySchema.safeParse({}).success).toBe(false);
    expect(meshEntrySchema.safeParse({ meshLabel: null }).success).toBe(true);
    expect(meshEntrySchema.safeParse({ name: "box", meshLabel: "nas" }).success).toBe(true);
  });
});

describe("Mesh DNS desired state", () => {
  it("only publishes entries with mesh IPs", () => {
    const entries = assignMeshHostnames(
      [entry("node", "a", "gw", "100.96.0.1"), entry("device", "b", "phone")],
      "mesh",
      {},
    );
    expect([...desiredMeshHosts(entries)]).toEqual([["gw.mesh", ["100.96.0.1"]]]);
  });

  it("indexes managed override rules by host", () => {
    const managed = managedMeshRulesByHost([
      { id: "1", name: "meshflare DNS: gw.mesh", action: "override", filters: ["dns"] },
      { id: "2", name: "meshflare DNS filter", action: "block", filters: ["dns"] },
      { id: "3", name: "someone else", action: "override", filters: ["dns"] },
    ]);
    expect([...managed.keys()]).toEqual(["gw.mesh"]);
    expect(sameIps(["b", "a"], ["a", "b"])).toBe(true);
    expect(sameIps(["a"], ["a", "b"])).toBe(false);
  });
});

describe("Split tunnel payload validation", () => {
  it("trims items and rejects ambiguous ones", () => {
    const ok = splitTunnelsSchema.safeParse({
      mode: "include",
      items: [{ address: " 10.0.0.0/8 ", description: " " }],
    });
    expect(ok.success && ok.data.items).toEqual([{ address: "10.0.0.0/8" }]);
    expect(
      splitTunnelsSchema.safeParse({ mode: "include", items: [{ address: "a", host: "b" }] }).success,
    ).toBe(false);
    expect(splitTunnelsSchema.safeParse({ mode: "include", items: [{}] }).success).toBe(false);
  });
});
