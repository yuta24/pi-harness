export type RoutingMode = "auto" | "manual" | "off";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface RouteMatch {
  keywords?: string[];
  regex?: string[];
  minContextPercent?: number;
  maxContextPercent?: number;
}

export interface ModelRoute {
  name: string;
  description?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  match?: RouteMatch;
}

export interface RoutingConfig {
  defaultRoute?: string;
  routes: ModelRoute[];
}

export interface ContextSnapshot {
  percent?: number | null;
}

export interface RouteSelection {
  route: ModelRoute;
  reason: string;
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

export function normalizePrompt(prompt: string): string {
  return prompt.toLocaleLowerCase();
}

export function validateConfig(config: unknown): RoutingConfig {
  if (!config || typeof config !== "object") {
    throw new Error("model routing config must be an object");
  }

  const candidate = config as RoutingConfig;
  if (!Array.isArray(candidate.routes) || candidate.routes.length === 0) {
    throw new Error("model routing config must define a non-empty routes array");
  }

  const seen = new Set<string>();
  for (const route of candidate.routes) {
    if (!route || typeof route !== "object") {
      throw new Error("each route must be an object");
    }
    if (!route.name || typeof route.name !== "string") {
      throw new Error("each route must define a string name");
    }
    if (seen.has(route.name)) {
      throw new Error(`duplicate route name: ${route.name}`);
    }
    seen.add(route.name);

    if ((route.provider && !route.model) || (!route.provider && route.model)) {
      throw new Error(`route "${route.name}" must set provider and model together`);
    }
    if (route.thinkingLevel && !THINKING_LEVELS.has(route.thinkingLevel)) {
      throw new Error(`route "${route.name}" has invalid thinkingLevel: ${route.thinkingLevel}`);
    }
    if (route.match?.keywords && !Array.isArray(route.match.keywords)) {
      throw new Error(`route "${route.name}" match.keywords must be an array`);
    }
    if (route.match?.regex && !Array.isArray(route.match.regex)) {
      throw new Error(`route "${route.name}" match.regex must be an array`);
    }
    if (
      route.match?.minContextPercent !== undefined &&
      (typeof route.match.minContextPercent !== "number" ||
        route.match.minContextPercent < 0 ||
        route.match.minContextPercent > 100)
    ) {
      throw new Error(`route "${route.name}" match.minContextPercent must be a number from 0 to 100`);
    }
    if (
      route.match?.maxContextPercent !== undefined &&
      (typeof route.match.maxContextPercent !== "number" ||
        route.match.maxContextPercent < 0 ||
        route.match.maxContextPercent > 100)
    ) {
      throw new Error(`route "${route.name}" match.maxContextPercent must be a number from 0 to 100`);
    }
  }

  if (candidate.defaultRoute && !seen.has(candidate.defaultRoute)) {
    throw new Error(`defaultRoute "${candidate.defaultRoute}" does not match any route`);
  }

  return candidate;
}

export function routeMatches(route: ModelRoute, prompt: string, context: ContextSnapshot = {}): string | undefined {
  const match = route.match;
  if (!match) return undefined;

  const normalized = normalizePrompt(prompt);

  for (const keyword of match.keywords ?? []) {
    if (normalized.includes(keyword.toLocaleLowerCase())) {
      return `keyword:${keyword}`;
    }
  }

  for (const expression of match.regex ?? []) {
    try {
      if (new RegExp(expression, "i").test(prompt)) {
        return `regex:${expression}`;
      }
    } catch {
      continue;
    }
  }

  if (typeof context.percent === "number") {
    if (typeof match.minContextPercent === "number" && context.percent >= match.minContextPercent) {
      return `context>=${match.minContextPercent}`;
    }
    if (typeof match.maxContextPercent === "number" && context.percent <= match.maxContextPercent) {
      return `context<=${match.maxContextPercent}`;
    }
  }

  return undefined;
}

export function selectRoute(config: RoutingConfig, prompt: string, context: ContextSnapshot = {}): RouteSelection {
  for (const route of config.routes) {
    const reason = routeMatches(route, prompt, context);
    if (reason) return { route, reason };
  }

  const fallback =
    config.routes.find((route) => route.name === config.defaultRoute) ??
    config.routes.find((route) => route.match === undefined) ??
    config.routes[0];

  return { route: fallback, reason: "default" };
}

export function formatRoute(route: ModelRoute): string {
  const parts = [route.name];
  if (route.provider && route.model) parts.push(`${route.provider}/${route.model}`);
  if (route.thinkingLevel) parts.push(`thinking:${route.thinkingLevel}`);
  return parts.join(" | ");
}
