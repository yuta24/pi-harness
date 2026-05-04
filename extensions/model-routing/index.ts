/**
 * Model Routing Extension
 *
 * Selects a route from .pi/model-routing.json for each user prompt and applies
 * the route's model and/or thinking level before the agent starts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  type ModelRoute,
  type RouteSelection,
  type RoutingConfig,
  type RoutingMode,
  formatRoute,
  selectRoute,
  validateConfig,
} from "./utils.js";

interface RouterState {
  mode: RoutingMode;
  manualRoute?: string;
  activeRoute?: string;
  lastReason?: string;
  modelOverride?: boolean;
}

const CONFIG_PATH = ".pi/model-routing.json";

export default function modelRoutingExtension(pi: ExtensionAPI): void {
  let config: RoutingConfig | undefined;
  let state: RouterState = { mode: "auto" };
  let pendingAppliedModel: Model<Api> | undefined;

  pi.registerFlag("model-route", {
    description: "Use a named model routing route",
    type: "string",
  });

  pi.registerFlag("no-model-routing", {
    description: "Disable automatic model routing",
    type: "boolean",
    default: false,
  });

  function persistState(): void {
    pi.appendEntry("model-routing-state", state);
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (state.mode === "off") {
      ctx.ui.setStatus("model-routing", undefined);
      return;
    }

    const label =
      state.mode === "manual"
        ? `route:${state.manualRoute ?? "manual"}`
        : state.modelOverride
          ? "route:auto-paused"
          : `route:${state.activeRoute ?? "auto"}`;
    ctx.ui.setStatus("model-routing", ctx.ui.theme.fg("accent", label));
  }

  function loadConfig(cwd: string): RoutingConfig | undefined {
    const path = join(cwd, CONFIG_PATH);
    if (!existsSync(path)) return undefined;

    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return validateConfig(parsed);
  }

  function getRoute(name: string): ModelRoute | undefined {
    return config?.routes.find((route) => route.name === name);
  }

  function getContextPercent(ctx: ExtensionContext): number | null | undefined {
    return ctx.getContextUsage()?.percent;
  }

  function chooseRoute(prompt: string, ctx: ExtensionContext): RouteSelection | undefined {
    if (!config || state.mode === "off") return undefined;
    if (state.mode === "auto" && state.modelOverride) return undefined;

    if (state.mode === "manual" && state.manualRoute) {
      const route = getRoute(state.manualRoute);
      return route ? { route, reason: "manual" } : undefined;
    }

    return selectRoute(config, prompt, { percent: getContextPercent(ctx) });
  }

  async function applyRoute(
    selection: RouteSelection,
    ctx: ExtensionContext,
    options: { announce?: boolean } = {},
  ): Promise<void> {
    const { route, reason } = selection;
    const previousRoute = state.activeRoute;
    state.activeRoute = route.name;
    state.lastReason = reason;
    if (state.mode !== "auto") state.modelOverride = false;

    if (route.provider && route.model) {
      const model = ctx.modelRegistry.find(route.provider, route.model);
      if (model) {
        pendingAppliedModel = model;
        const success = await pi.setModel(model);
        if (!success) {
          pendingAppliedModel = undefined;
          ctx.ui.notify(`Route "${route.name}": no API key for ${route.provider}/${route.model}`, "warning");
        }
      } else {
        ctx.ui.notify(`Route "${route.name}": model ${route.provider}/${route.model} not found`, "warning");
      }
    }

    if (route.thinkingLevel) {
      pi.setThinkingLevel(route.thinkingLevel);
    }

    updateStatus(ctx);
    persistState();
    if (options.announce ?? (previousRoute !== route.name)) {
      ctx.ui.notify(`Model route "${route.name}" selected (${reason})`, "info");
    }
  }

  function listRoutes(): string {
    if (!config) return "No model routing config loaded.";
    return config.routes.map((route) => formatRoute(route)).join("\n");
  }

  pi.registerCommand("route", {
    description: "Inspect or switch model routing",
    handler: async (args, ctx) => {
      const value = args?.trim();

      if (!value) {
        ctx.ui.notify(
          [
            `Mode: ${state.mode}`,
            `Active: ${state.activeRoute ?? "(none)"}`,
            `Reason: ${state.lastReason ?? "(none)"}`,
            `Auto paused by model override: ${state.modelOverride ? "yes" : "no"}`,
            "",
            listRoutes(),
          ].join("\n"),
          "info",
        );
        return;
      }

      if (value === "auto") {
        state = { mode: "auto" };
        updateStatus(ctx);
        persistState();
        ctx.ui.notify("Model routing set to auto.", "info");
        return;
      }

      if (value === "off") {
        state = { mode: "off" };
        updateStatus(ctx);
        persistState();
        ctx.ui.notify("Model routing disabled.", "info");
        return;
      }

      const route = getRoute(value);
      if (!route) {
        ctx.ui.notify(`Unknown route "${value}".\n\n${listRoutes()}`, "error");
        return;
      }

      state = { mode: "manual", manualRoute: value, activeRoute: value, modelOverride: false };
      await applyRoute({ route, reason: "command" }, ctx, { announce: true });
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const selection = chooseRoute(event.prompt, ctx);
    if (!selection) return;

    await applyRoute(selection, ctx);
    return {
      message: {
        customType: "model-routing",
        content: `Model route: ${formatRoute(selection.route)} (${selection.reason})`,
        display: false,
      },
    };
  });

  pi.on("model_select", async (event, ctx) => {
    if (
      pendingAppliedModel &&
      event.model.provider === pendingAppliedModel.provider &&
      event.model.id === pendingAppliedModel.id
    ) {
      pendingAppliedModel = undefined;
      return;
    }

    if (state.mode === "auto") {
      state.activeRoute = undefined;
      state.lastReason = "manual model selection";
      state.modelOverride = true;
      updateStatus(ctx);
      persistState();
      ctx.ui.notify("Model routing paused after manual model selection. Use /route auto to resume.", "info");
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      config = loadConfig(ctx.cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Failed to load ${CONFIG_PATH}: ${message}`, "error");
      state = { mode: "off" };
    }

    const entry = ctx.sessionManager
      .getEntries()
      .filter((candidate: { type: string; customType?: string }) => {
        return candidate.type === "custom" && candidate.customType === "model-routing-state";
      })
      .pop() as { data?: RouterState } | undefined;

    const routeFlag = pi.getFlag("model-route");
    if (entry?.data) {
      state = {
        mode: entry.data.mode,
        manualRoute: entry.data.manualRoute,
        modelOverride: entry.data.modelOverride,
      };
    }

    if (typeof routeFlag === "string" && routeFlag.trim()) {
      const routeName = routeFlag.trim();
      if (getRoute(routeName)) {
        state = { mode: "manual", manualRoute: routeName, activeRoute: routeName, modelOverride: false };
      } else {
        ctx.ui.notify(`Unknown model route "${routeName}".\n\n${listRoutes()}`, "warning");
      }
    }

    if (pi.getFlag("no-model-routing") === true) {
      state = { mode: "off" };
    }

    updateStatus(ctx);
  });
}
