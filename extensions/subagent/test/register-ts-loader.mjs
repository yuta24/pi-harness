import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const globalRoot = "/opt/homebrew/lib/node_modules";
const typeOnlyImport = /^\s*import\s+type\s+[^;]+;\s*$/gm;
const inlineTypeSpecifiers = /,\s*type\s+/g;
const interfaceBlock = /^\s*(?:export\s+)?interface\s+\w+[^{]*\{[\s\S]*?^\}\s*$/gm;
const typeBlock = /^\s*(?:export\s+)?type\s+\w+\s*=\s*[\s\S]*?;\s*$/gm;
const simpleReturnTypes = /\)\s*:\s*(?:string|number|boolean|void|undefined|string\[\]|number\[\])\s*\{/g;
const exportedTypeAlias = /export\s+\{[^}]*\}\s*;\s*$/gm;

function stripTypes(source) {
  return source
    .replace(typeOnlyImport, "")
    .replace(inlineTypeSpecifiers, ", ")
    .replace(interfaceBlock, "")
    .replace(typeBlock, "")
    .replace(simpleReturnTypes, ") {")
    .replace(/: AgentConfig/g, "")
    .replace(/: string \| undefined/g, "")
    .replace(/: string\[\]/g, "")
    .replace(/: boolean/g, "")
    .replace(/: number/g, "")
    .replace(/: string/g, "")
    .replace(/ as any/g, "")
    .replace(exportedTypeAlias, "");
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) {
    return nextLoad(url, context);
  }

  const source = readFileSync(new URL(url), "utf-8");
  return {
    format: "module",
    shortCircuit: true,
    source: stripTypes(source),
  };
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@mariozechner/pi-coding-agent" || specifier === "@mariozechner/pi-tui") {
    return {
      shortCircuit: true,
      url: require.resolve(specifier, { paths: [globalRoot] }).replace(/^/, "file://"),
    };
  }

  return nextResolve(specifier, context);
}
