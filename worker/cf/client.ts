import type { CfApiResult, Env } from "../types";

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Array<{ code: number; message: string }> = [],
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

export class CloudflareClient {
  readonly accountId: string;
  private readonly headers: HeadersInit;

  constructor(env: Env) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (!accountId) {
      throw new CloudflareApiError(
        "CLOUDFLARE_ACCOUNT_ID is required",
        500,
      );
    }
    this.accountId = accountId;

    if (env.CLOUDFLARE_API_TOKEN?.trim()) {
      this.headers = {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}`,
        "Content-Type": "application/json",
      };
    } else {
      throw new CloudflareApiError(
        "CLOUDFLARE_API_TOKEN is required",
        500,
      );
    }
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<CfApiResult<T>> {
    const url = path.startsWith("http")
      ? path
      : `https://api.cloudflare.com/client/v4${path}`;

    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const json = (await res.json()) as CfApiResult<T>;
    if (!res.ok || !json.success) {
      const msg =
        json.errors?.map((e) => e.message).join("; ") ||
        `Cloudflare API ${res.status}`;
      throw new CloudflareApiError(msg, res.status, json.errors ?? []);
    }
    return json;
  }

  accountPath(suffix: string): string {
    return `/accounts/${this.accountId}${suffix}`;
  }
}

export function createCfClient(env: Env): CloudflareClient {
  return new CloudflareClient(env);
}
