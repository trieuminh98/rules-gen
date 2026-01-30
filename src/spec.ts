import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type OutputSpec = {
  cursor?: { path: string };
  codex?: { path: string };
  agent?: { path: string };
};

export type EntrySpec = {
  sources: string[]; // glob patterns in hub repo
  overlays?: string[]; // local files in project
  outputs?: OutputSpec;
};

export type RulesSpec = {
  // legacy (rules) shape
  sources?: string[];
  overlays?: string[];
  outputs?: OutputSpec;
  // new multi-entry shape
  rules?: EntrySpec;
  skills?: EntrySpec;
};

export type NormalizedSpec = {
  rules: EntrySpec;
  skills: EntrySpec;
};

const DEFAULT_RULES_SOURCES = ["rules/**/*.rules.md", "rules/**/*.md"];
const DEFAULT_SKILLS_SOURCES = ["skills/**/*.md"];

export const DEFAULT_SPEC: NormalizedSpec = {
  rules: {
    sources: DEFAULT_RULES_SOURCES,
    overlays: [],
  },
  skills: {
    sources: DEFAULT_SKILLS_SOURCES,
    overlays: [],
  },
};

function readSpecFile(specPath: string): RulesSpec {
  const abs = path.resolve(specPath);
  const raw = fs.readFileSync(abs, "utf8");
  const data = yaml.load(raw) as any;

  if (!data || typeof data !== "object") {
    throw new Error(`Invalid spec: expected an object`);
  }

  return data as RulesSpec;
}

export function readSpec(specPath: string): RulesSpec {
  return readSpecFile(specPath);
}

function normalizeSpec(raw: RulesSpec | null): NormalizedSpec {
  if (!raw) return DEFAULT_SPEC;

  const legacyRules =
    Array.isArray(raw.sources) && raw.sources.length
      ? {
          sources: raw.sources,
          overlays: raw.overlays ?? [],
          outputs: raw.outputs,
        }
      : null;

  const rulesBase = raw.rules ?? legacyRules ?? DEFAULT_SPEC.rules;
  const skillsBase = raw.skills ?? DEFAULT_SPEC.skills;

  const rules: EntrySpec = {
    sources:
      Array.isArray(rulesBase.sources) && rulesBase.sources.length
        ? rulesBase.sources
        : DEFAULT_RULES_SOURCES,
    overlays: rulesBase.overlays ?? [],
  };
  if (rulesBase.outputs) rules.outputs = rulesBase.outputs;

  const skills: EntrySpec = {
    sources:
      Array.isArray(skillsBase.sources) && skillsBase.sources.length
        ? skillsBase.sources
        : DEFAULT_SKILLS_SOURCES,
    overlays: skillsBase.overlays ?? [],
  };
  if (skillsBase.outputs) skills.outputs = skillsBase.outputs;

  return { rules, skills };
}

export function loadSpec(specPath?: string): NormalizedSpec {
  if (specPath) return normalizeSpec(readSpecFile(specPath));

  const defaultPath = path.resolve("rules.yaml");
  if (fs.existsSync(defaultPath)) return normalizeSpec(readSpecFile(defaultPath));

  return DEFAULT_SPEC;
}
