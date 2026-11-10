import { z } from "zod";
import { isReservedFallbackSuffix } from "../cf/names";

export const nameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const meshEntryParamSchema = z.object({
  kind: z.enum(["node", "device"], { message: "kind must be node or device" }),
  id: z.string().min(1),
});

/** Rename and/or set the hostname label; `meshLabel: null` or "" resets to the derived default. */
export const meshEntrySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    meshLabel: z.string().trim().max(63).nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.meshLabel !== undefined, {
    message: "Provide name and/or meshLabel",
  });

export const settingsSchema = z.object({
  offlineDays: z.number().int().min(1).max(365).optional(),
  dnsFilterEnabled: z.boolean().optional(),
  dnsFilterUrl: z.url().optional(),
  meshSuffix: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .refine(
      (val: string) => !isReservedFallbackSuffix(val.replace(/^\.+/, "")),
      {
        message:
          "This suffix is reserved by Cloudflare WARP Local Domain Fallback and will bypass Gateway DNS resolution. Choose another suffix.",
      },
    )
    .optional(),
});

export const routeSchema = z
  .object({
    type: z.enum(["cidr", "hostname"]).default("cidr"),
    network: z.string().trim().optional(),
    hostname: z.string().trim().optional(),
    comment: z.string().trim().max(100, "comment must be 100 characters or fewer").optional(),
  })
  .refine((body) => Boolean(body.type === "hostname" ? body.hostname : body.network), {
    message: "network or hostname is required",
  });

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

export const splitTunnelsSchema = z.object({
  mode: z.enum(["include", "exclude"]),
  items: z.array(
    z
      .object({ address: optionalText, host: optionalText, description: optionalText })
      .refine((item) => Boolean(item.address) !== Boolean(item.host), {
        message: "each item must contain one address or host",
      })
      .transform(({ address, host, description }) => ({
        ...(address ? { address } : {}),
        ...(host ? { host } : {}),
        ...(description ? { description } : {}),
      })),
  ),
});

export const createTunnelSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  config_src: z.enum(["local", "cloudflare"]).optional(),
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
