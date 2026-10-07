import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * In a CSS Module every class name is renamed, so `.stats .card` quietly targets a module-only class
 * called "card" and never the global `.card` from globals.css. The rule just does nothing, and nothing says so.
 * This test finds such rules: a global class used in a module that the module never defines itself.
 */
const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f);
    if (f === "node_modules" || f === ".next" || f.startsWith(".")) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const globalClasses = [...readFileSync(path.join(root, "app/globals.css"), "utf8").matchAll(/^\.([a-z][\w-]*)/gm)].map((m) => m[1]);
const selectors = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));

describe("CSS Modules", () => {
  it("knows which classes are global", () => {
    expect(globalClasses).toEqual(expect.arrayContaining(["card", "chip", "btn", "input", "muted", "avatar", "empty", "skeleton"]));
  });

  const modules = walk(root).filter((f) => f.endsWith(".module.css"));

  it("finds the module files", () => expect(modules.length).toBeGreaterThan(20));

  it.each(modules.map((f) => [path.relative(root, f), f]))("%s never relies on a global class it does not define", (_, file) => {
    const sel = selectors(readFileSync(file, "utf8"));
    const problems: string[] = [];
    for (const g of globalClasses) {
      const defined = sel.some((s) => s === `.${g}`);
      const used = sel.filter((s) => new RegExp(`(?<!:global\\()\\.${g}(?![\\w-])`).test(s));
      if (!defined && used.length) problems.push(`.${g} in "${used[0]}" (use :global(.${g}))`);
    }
    expect(problems).toEqual([]);
  });
});
