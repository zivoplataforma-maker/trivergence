import { z } from "zod";

export const workspaceReadInputSchema = z.object({
  path: z.string().min(1).max(2_048),
});
export type WorkspaceReadInput = z.infer<typeof workspaceReadInputSchema>;

export const workspaceSearchInputSchema = z.object({
  query: z.string().min(1).max(200),
});
export type WorkspaceSearchInput = z.infer<typeof workspaceSearchInputSchema>;

export const workspaceGitStatusInputSchema = z.object({}).strict();

export const workspaceGitDiffInputSchema = z.object({
  paths: z
    .array(z.string().min(1).max(2_048))
    .min(1)
    .max(32)
    .refine((paths) => new Set(paths).size === paths.length, {
      message: "Git diff paths must be unique",
    }),
  staged: z.boolean().optional().default(false),
});
export type WorkspaceGitDiffInput = z.infer<typeof workspaceGitDiffInputSchema>;

export const workspaceFileResultSchema = z.object({
  path: z.string().min(1).max(2_048),
  content: z.string().max(1_048_576),
  bytes: z.number().int().nonnegative().max(1_048_576),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type WorkspaceFileResult = z.infer<typeof workspaceFileResultSchema>;

export const workspaceSearchResultSchema = z.object({
  query: z.string().min(1).max(200),
  matches: z
    .array(
      z.object({
        path: z.string().min(1).max(2_048),
        line: z.number().int().positive(),
        column: z.number().int().positive(),
        preview: z.string().max(500),
      }),
    )
    .max(200),
  filesScanned: z.number().int().nonnegative().max(5_000),
  bytesScanned: z
    .number()
    .int()
    .nonnegative()
    .max(20 * 1_048_576),
  truncated: z.boolean(),
});
export type WorkspaceSearchResult = z.infer<typeof workspaceSearchResultSchema>;

export const gitStatusResultSchema = z.object({
  entries: z
    .array(
      z.object({
        path: z.string().min(1).max(2_048),
        index: z.string().length(1),
        worktree: z.string().length(1),
        originalPath: z.string().min(1).max(2_048).optional(),
      }),
    )
    .max(5_000),
  truncated: z.boolean(),
});
export type GitStatusResult = z.infer<typeof gitStatusResultSchema>;

export const gitDiffResultSchema = z.object({
  paths: z.array(z.string().min(1).max(2_048)).min(1).max(32),
  staged: z.boolean(),
  diff: z.string().max(1_048_576),
  truncated: z.boolean(),
});
export type GitDiffResult = z.infer<typeof gitDiffResultSchema>;
