import { readFileSync } from "node:fs";

const typeOnlyImport = /^\s*import\s+type\s+[^;]+;\s*$/gm;
const inlineTypeSpecifiers = /,\s*type\s+/g;
const interfaceBlock = /^\s*(?:export\s+)?interface\s+\w+[^{]*\{[\s\S]*?^\}\s*$/gm;
const typeBlock = /^\s*(?:export\s+)?type\s+\w+\s*=\s*[\s\S]*?;\s*$/gm;
const simpleReturnTypes = /\)\s*:\s*(?:string|number|boolean|void|undefined|string\[\]|number\[\]|Record<string, string>)\s*\{/g;

function stripTypes(source) {
  return source
    .replace(typeOnlyImport, "")
    .replace(inlineTypeSpecifiers, ", ")
    .replace(interfaceBlock, "")
    .replace(typeBlock, "")
    .replace(simpleReturnTypes, ") {")
    .replace(/: StatuslineConfig/g, "")
    .replace(/: NormalizedStatuslineConfig/g, "")
    .replace(/: StatuslineContext/g, "")
    .replace(/: ScriptResult/g, "")
    .replace(/: string\[\]/g, "")
    .replace(/: Record<string, string>/g, "")
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
