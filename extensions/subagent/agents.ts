/**
 * Agent discovery for the subagent extension.
 *
 * Agents are markdown files with YAML-like frontmatter:
 *
 * ---
 * name: scout
 * description: Fast codebase reconnaissance
 * tools: read, grep, find, ls
 * model: claude-haiku-4-5
 * ---
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";
export type AgentSource = "user" | "project";

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: AgentSource;
  filePath: string;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  userAgentsDir: string;
  projectAgentsDir: string | null;
  projectRoot: string | null;
}

interface AgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string;
  model?: string;
}

function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
  if (!fs.existsSync(dir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
    if (!frontmatter.name || !frontmatter.description) continue;

    const tools = frontmatter.tools
      ?.split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      systemPrompt: body.trim(),
      source,
      filePath,
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function findNearestProjectRoot(cwd: string): string | null {
  let current = cwd;
  while (true) {
    if (isDirectory(path.join(current, ".pi", "agents"))) return current;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
  const userAgentsDir = path.join(getAgentDir(), "agents");
  const projectRoot = findNearestProjectRoot(cwd);
  const projectAgentsDir = projectRoot ? path.join(projectRoot, ".pi", "agents") : null;

  const userAgents = scope === "project" ? [] : loadAgentsFromDir(userAgentsDir, "user");
  const projectAgents =
    scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

  const byName = new Map<string, AgentConfig>();
  if (scope === "both") {
    for (const agent of userAgents) byName.set(agent.name, agent);
    for (const agent of projectAgents) byName.set(agent.name, agent);
  } else {
    for (const agent of scope === "user" ? userAgents : projectAgents) {
      byName.set(agent.name, agent);
    }
  }

  return {
    agents: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
    userAgentsDir,
    projectAgentsDir,
    projectRoot,
  };
}

export function formatAgentList(agents: AgentConfig[]): string {
  if (agents.length === 0) return "none";
  return agents
    .map((agent) => {
      const tools = agent.tools?.length ? ` tools=${agent.tools.join(",")}` : "";
      const model = agent.model ? ` model=${agent.model}` : "";
      return `- ${agent.name} (${agent.source})${model}${tools}: ${agent.description}`;
    })
    .join("\n");
}
