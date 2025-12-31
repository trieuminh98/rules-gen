export type Target = "all" | "cursor" | "codex";

export function extractTargets(md: string, targets: Set<Target>) {
  const lines = md.split("\n");
  let active: Target = "all";
  const out: string[] = [];

  for (const line of lines) {
    const m = line.match(/<!--\s*target:(all|cursor|codex)\s*-->/);
    if (m) {
      active = m[1] as Target;
      continue;
    }
    if (targets.has(active)) out.push(line);
  }

  return out.join("\n").trimEnd() + "\n";
}
