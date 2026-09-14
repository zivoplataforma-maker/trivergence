import { z } from "zod";

// Configuration contains preferences, never credentials or execution authority.
export const providerPreferencesSchema = z
  .object({
    version: z.literal(1),
    preferredProviderId: z
      .string()
      .regex(/^[a-z][a-z0-9._-]{0,79}$/u)
      .nullable(),
    ollama: z
      .object({
        endpoint: z.enum(["http://127.0.0.1:11434", "http://localhost:11434"]),
        model: z
          .string()
          .max(120)
          .regex(/^[a-zA-Z0-9._:/-]*$/u),
      })
      .strict(),
  })
  .strict();
export type ProviderPreferences = z.infer<typeof providerPreferencesSchema>;

export const providerConfigurationEntrySchema = z
  .object({
    id: z.string().min(1).max(80),
    displayName: z.string(),
    method: z.enum(["managed_login", "official_oauth", "local_service"]),
    guidance: z.string(),
    installation: z.enum(["detected", "not_detected", "unknown"]),
    authentication: z.enum([
      "not_checked",
      "authenticated",
      "not_authenticated",
      "not_required",
    ]),
    gate: z.enum(["pending", "authorized", "denied"]),
    executionEnabled: z.boolean(),
    blocked: z.boolean(),
    blockers: z.array(z.string()),
  })
  .strict();
export const providerConfigurationSchema = z
  .object({
    preferences: providerPreferencesSchema,
    providers: z.array(providerConfigurationEntrySchema).max(64),
    storage: z.enum(["ready", "read_only"]),
    notice: z.string(),
  })
  .strict();
export type ProviderConfiguration = z.infer<typeof providerConfigurationSchema>;
