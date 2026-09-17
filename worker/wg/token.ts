export function decodeConnectorToken(token: string): {
  account_tag: string;
  tunnel_id: string;
  tunnel_secret: string;
} {
  let json: { a?: string; t?: string; s?: string };
  try {
    json = JSON.parse(atob(token)) as { a?: string; t?: string; s?: string };
  } catch {
    throw new Error("Invalid base64 connector token");
  }
  if (!json.a || !json.t || !json.s) {
    throw new Error("Invalid connector token payload");
  }
  return {
    account_tag: json.a,
    tunnel_id: json.t,
    tunnel_secret: json.s,
  };
}
