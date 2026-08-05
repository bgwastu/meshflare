import { z } from "zod";

export const nameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const settingsSchema = z.object({
  offlineDays: z.number().int().min(1).max(365).optional(),
  dnsFilterEnabled: z.boolean().optional(),
  dnsFilterUrl: z.url().optional(),
  meshSuffix: z.string().trim().min(1).max(63).optional(),
  dnsIpv4Enabled: z.boolean().optional(),
  dnsIpv6Enabled: z.boolean().optional(),
  dnsDohEnabled: z.boolean().optional(),
  dnsSourceNetwork: z.string().trim().max(100).optional(),
});

export const routeSchema = z.object({
  type: z.enum(["cidr", "hostname"]).default("cidr"),
  network: z.string().trim().optional(),
  hostname: z.string().trim().optional(),
  comment: z.string().trim().max(100).optional(),
});

export const splitTunnelsSchema = z.object({
  mode: z.enum(["include", "exclude"]),
  items: z.array(z.object({
    address: z.string().trim().optional(),
    host: z.string().trim().optional(),
    description: z.string().trim().optional(),
  })),
});

export const tunnelSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config_src: z.enum(["local", "cloudflare"]).optional(),
});

export const tunnelConfigSchema = z.object({
  config: z.object({
    ingress: z.array(z.object({
      hostname: z.string().optional(),
      path: z.string().optional(),
      service: z.string().min(1),
    })),
  }),
});
