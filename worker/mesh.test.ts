import { describe, expect, it } from "bun:test";
import { auditMeshRouting, ensureMeshRouting, type SplitTunnelConfig } from "./cf/split-tunnels";
import { isReservedFallbackSuffix, meshHostname, slugifyName } from "./cf/names";
import { decodeConnectorToken } from "./wg/token";
import { settingsSchema } from "./routes/schemas";

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
