export interface IgnoreRule {
  readonly base: string;
  readonly directoryOnly: boolean;
  readonly hasSlash: boolean;
  readonly matcher: RegExp;
}

const globToRegex = (pattern: string): RegExp => {
  if (
    pattern.includes("[") ||
    pattern.includes("]") ||
    pattern.includes("\\")
  ) {
    // Fallar hacia la privacidad: un patrón no soportado excluye el ámbito base.
    return /^.*$/u;
  }
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[.+^${}()|]/gu, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "u");
};

export const parseIgnoreFile = (content: string, base: string): IgnoreRule[] =>
  content.split(/\r?\n/u).flatMap((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) return [];
    const withoutRoot = line.startsWith("/") ? line.slice(1) : line;
    const directoryOnly = withoutRoot.endsWith("/");
    const pattern = directoryOnly ? withoutRoot.slice(0, -1) : withoutRoot;
    if (!pattern) return [];
    return [
      {
        base,
        directoryOnly,
        hasSlash: pattern.includes("/"),
        matcher: globToRegex(pattern),
      },
    ];
  });

export const isIgnored = (
  relativePath: string,
  isDirectory: boolean,
  rules: readonly IgnoreRule[],
): boolean =>
  rules.some((rule) => {
    if (
      rule.base &&
      relativePath !== rule.base &&
      !relativePath.startsWith(`${rule.base}/`)
    ) {
      return false;
    }
    const local = rule.base
      ? relativePath.slice(rule.base.length + 1)
      : relativePath;
    if (!local) return false;
    if (rule.hasSlash) {
      if (rule.matcher.test(local)) return true;
      if (rule.directoryOnly) {
        const segments = local.split("/");
        return segments.some((_, index) =>
          rule.matcher.test(segments.slice(0, index + 1).join("/")),
        );
      }
      return false;
    }
    const segments = local.split("/");
    return segments.some((segment, index) => {
      if (!rule.matcher.test(segment)) return false;
      return !rule.directoryOnly || isDirectory || index < segments.length - 1;
    });
  });
