import { readFileSync } from "node:fs";

const typeOnlyImport = /^\s*import\s+type\s+[^;]+;\s*$/gm;
const inlineTypeSpecifiers = /,\s*type\s+/g;
const interfaceBlock = /^\s*(?:export\s+)?interface\s+\w+[^{]*\{[\s\S]*?^\}\s*$/gm;
const typeBlock = /^\s*(?:export\s+)?type\s+\w+\s*=\s*[\s\S]*?;\s*$/gm;
const simpleReturnTypes = /\)\s*:\s*(?:string|number|boolean|void|undefined|string\[\]|number\[\])\s*\{/g;

function stripTypes(source) {
  return source
    .replace(typeOnlyImport, "")
    .replace(inlineTypeSpecifiers, ", ")
    .replace(interfaceBlock, "")
    .replace(typeBlock, "")
    .replace(simpleReturnTypes, ") {")
    .replace(/: RoutingMode/g, "")
    .replace(/: ModelRoute\[\]/g, "")
    .replace(/: ModelRoute/g, "")
    .replace(/: RoutingConfig/g, "")
    .replace(/: RouteMatch/g, "")
    .replace(/: RouteSelection/g, "")
    .replace(/: ContextSnapshot/g, "")
    .replace(/: string\[\]/g, "")
    .replace(/: string/g, "")
    .replace(/: number/g, "")
    .replace(/: boolean/g, "");
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context);

  return {
    format: "module",
    shortCircuit: true,
    source: stripTypes(readFileSync(new URL(url), "utf-8")),
  };
}
