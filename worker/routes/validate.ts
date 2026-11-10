import type { ValidationTargets } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

/** zValidator that answers `{ error: "<readable message>" }` like every other API error. */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (result.success) return;
    const issue = result.error.issues[0];
    const path = issue?.path.join(".");
    const message = issue ? (path ? `${path}: ${issue.message}` : issue.message) : "Invalid request";
    return c.json({ error: message }, 400);
  });
}
