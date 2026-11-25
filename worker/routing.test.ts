import { describe, expect, test } from "bun:test";
import { auditProfile, classifyRouteValue, remediate, v4Overlaps } from "./cf/routing";
import { resolveDestination, normalizeDestination } from "../client/src/lib/routing";
import { buildDemoRouting } from "./demo/fixtures";

describe("routing audit", () => {
  test("cidr overlap", () => {
    expect(v4Overlaps("100.64.0.0/10", "100.96.0.0/12")).toBe(true);
    expect(v4Overlaps("172.64.0.0/13", "172.64.128.0/20")).toBe(true);
    expect(v4Overlaps("192.168.0.0/16", "172.64.128.0/20")).toBe(false);
  });

  test("classify route values", () => {
    expect(classifyRouteValue("10.0.0.1")).toEqual({ type: "cidr", value: "10.0.0.1/32" });
    expect(classifyRouteValue("10.0.0.0/8")).toEqual({ type: "cidr", value: "10.0.0.0/8" });
    expect(classifyRouteValue("Reddit.com.")).toEqual({ type: "hostname", value: "reddit.com" });
  });

  test("exclude mode flags bypassed mesh and resolved IPs and excluded routed hosts", () => {
    const profile = {
      mode: "exclude" as const,
      include: [],
      exclude: [{ address: "100.64.0.0/10" }, { address: "172.64.0.0/13" }, { host: "*.reddit.com" }],
    };
    const routes = [{ id: "r", type: "hostname" as const, value: "www.reddit.com", comment: "", connectorId: "t", createdAt: null }];
    const codes = auditProfile(profile, routes).map((i) => i.code).sort();
    expect(codes).toEqual(["mesh_bypassed", "resolved_ip_bypassed", "route_bypassed"]);
    const fixed = remediate(profile, "ensure_mesh");
    expect(fixed.items.some((i) => i.address === "100.64.0.0/10")).toBe(false);
  });

  test("include mode needs resolved range only when hostname routes exist", () => {
    const profile = { mode: "include" as const, include: [{ address: "100.96.0.0/12" }], exclude: [] };
    expect(auditProfile(profile, [])).toEqual([]);
    const routes = [{ id: "r", type: "hostname" as const, value: "x.com", comment: "", connectorId: "t", createdAt: null }];
    expect(auditProfile(profile, routes).map((i) => i.code)).toEqual(["resolved_ip_not_included"]);
    expect(remediate(profile, "ensure_resolved_ip").items).toHaveLength(3);
  });
});

describe("destination check", () => {
  const { profiles, routes, connectors } = buildDemoRouting();
  const def = profiles[0];
  const kind = (d: string, p = def) => resolveDestination(d, p, routes, connectors)?.kind;

  test("normalizes urls", () => {
    expect(normalizeDestination("https://WWW.Reddit.com/r/x?y")).toBe("www.reddit.com");
    expect(normalizeDestination("10.0.0.1:443")).toBe("10.0.0.1");
    expect(normalizeDestination("apollo.mesh.")).toBe("apollo.mesh");
    expect(normalizeDestination("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeDestination("https://[2001:db8::1]:443/")).toBe("2001:db8::1");
  });

  test("withholds routing results for incomplete and malformed destinations", () => {
    for (const input of [
      "reddit", "reddit.", "reddit.c", "bad..com", "-bad.com", "https://", "https:///reddit.com",
      "https://reddit.com:", "reddit.com:65536", "user@reddit.com", "10.10", "10.10.0.",
      "256.0.0.1", "0x7f000001", "2001:db8:", "https://[2001:db8",
    ]) {
      expect(resolveDestination(input, def, routes, connectors)).toBeNull();
    }
  });

  test("default profile", () => {
    expect(kind("www.reddit.com")).toBe("route");
    expect(kind("reddit.com")).toBe("route");
    // A hostname route covers every subdomain, as Gateway does.
    expect(kind("a.b.reddit.com")).toBe("route");
    expect(kind("i.redd.it")).toBe("route");
    expect(kind("notreddit.com")).toBe("warp");
    expect(kind("ibank.klikbca.com")).toBe("bypass");
    expect(kind("klikbca.com")).toBe("bypass");
    expect(kind("192.168.1.5")).toBe("bypass");
    expect(kind("10.10.0.7")).toBe("route");
    expect(kind("100.96.0.3")).toBe("mesh");
    expect(kind("google.com")).toBe("warp");
  });

  test("include-mode connector profile", () => {
    const p = profiles[1];
    expect(kind("google.com", p)).toBe("bypass");
    expect(kind("100.96.0.3", p)).toBe("mesh");
    expect(kind("reddit.com", p)).toBe("route_blocked");
  });
});

describe("profile match rules", () => {
  test("round-trips email rules and leaves others alone", async () => {
    const { matchToEmails, emailsToMatch } = await import("../client/src/lib/routing");
    expect(matchToEmails('identity.email == "a@x.io"')).toEqual(["a@x.io"]);
    expect(matchToEmails('identity.email in {"a@x.io" "b@y.io"}')).toEqual(["a@x.io", "b@y.io"]);
    expect(matchToEmails('identity.groups.name in {"Staff"}')).toBeNull();
    expect(matchToEmails(null)).toBeNull();
    expect(emailsToMatch(["a@x.io"])).toBe('identity.email == "a@x.io"');
    expect(emailsToMatch(["a@x.io", "b@y.io"])).toBe('identity.email in {"a@x.io" "b@y.io"}');
  });
});
