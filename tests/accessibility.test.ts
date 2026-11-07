import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// NFR-006 (Usability & Accessibility): the interface shall meet WCAG 2.1
// Level AA and be responsive from 320px upward.
//
// These are static checks over the app source so they run in CI without a
// browser. They guard the specific fixes made for NFR-006 against
// regression; a full axe-core audit of every page (light + dark, 1280px and
// 320px) was run manually against a dev server and reported no violations.

const ROOT = join(__dirname, "..");
const APP_DIR = join(ROOT, "app");

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTsx(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const TSX_FILES = listTsx(APP_DIR).map((file) => ({
  file: relative(ROOT, file),
  src: readFileSync(file, "utf8"),
}));
const CSS = readFileSync(join(APP_DIR, "globals.css"), "utf8");
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** Returns each JSX opening tag `<name ...>` (attributes included), skipping
 *  over `{...}` expressions so arrow functions don't end the tag early. */
function openingTags(src: string, name: string): string[] {
  const tags: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

// --- WCAG 2.4.1 Bypass Blocks ---

test("NFR-006: root layout renders a skip link to #main", () => {
  const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
  assert.match(layout, /<SkipLink\s*\/>/);
  const skip = readFileSync(join(APP_DIR, "components", "SkipLink.tsx"), "utf8");
  assert.match(skip, /href="#main"/);
  assert.match(CSS, /\.skip-link:focus/, "skip link must become visible on focus");
});

test("NFR-006: every <main> landmark is the skip-link target (id=\"main\")", () => {
  let mains = 0;
  for (const { file, src } of TSX_FILES) {
    for (const tag of openingTags(src, "main")) {
      mains++;
      assert.match(tag, /\bid="main"/, `${file}: ${tag.slice(0, 80)} is missing id="main"`);
    }
  }
  assert.ok(mains > 0);
});

// --- WCAG 1.3.1 Info and Relationships ---

test("NFR-006: heading levels never skip a level", () => {
  for (const { file, src } of TSX_FILES) {
    const levels = [...src.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    // Pages start at h1; shared components render beneath a page's h1.
    let prev = 1;
    for (const level of levels) {
      assert.ok(
        level <= prev + 1,
        `${file}: <h${level}> follows <h${prev}> (heading levels must increase by one)`,
      );
      prev = level;
    }
  }
});

test("NFR-006: every visible form control has an accessible label", () => {
  for (const { file, src } of TSX_FILES) {
    for (const name of ["input", "select", "textarea"]) {
      for (const tag of openingTags(src, name)) {
        if (/type="hidden"/.test(tag)) continue;
        const idMatch = tag.match(/\bid=(?:"([^"]+)"|\{)/);
        const labelled =
          /aria-label(ledby)?=/.test(tag) ||
          (idMatch !== null &&
            (idMatch[1] === undefined || new RegExp(`htmlFor="${idMatch[1]}"`).test(src)));
        assert.ok(labelled, `${file}: unlabelled <${name}>: ${tag.slice(0, 100)}`);
      }
    }
  }
});

// --- WCAG 2.1.1 Keyboard ---

test("NFR-006: scrollable table containers are keyboard-focusable, labelled regions", () => {
  for (const { file, src } of TSX_FILES) {
    for (const tag of openingTags(src, "div")) {
      if (!/overflow[XY]?:\s*"auto"|className="table-scroll"/.test(tag)) continue;
      // Only containers that directly wrap a table.
      const after = src.slice(src.indexOf(tag) + tag.length).trimStart();
      if (!after.startsWith("<table")) continue;
      assert.match(tag, /tabIndex=\{0\}/, `${file}: scrollable table container needs tabIndex={0}`);
      assert.match(tag, /role="region"/, `${file}: scrollable table container needs role="region"`);
      assert.match(tag, /aria-label=/, `${file}: scrollable table container needs an aria-label`);
    }
  }
});

// --- WCAG 1.4.10 Reflow (responsive from 320px) ---

test("NFR-006: header and action rows wrap instead of overflowing at 320px", () => {
  for (const selector of [".nav", ".event-nav", ".nav-links", ".event-nav-actions", ".form-submit-row"]) {
    const blocks = [...CSS_NO_COMMENTS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
      ([, sel, body]) =>
        sel.split(",").some((s) => s.trim() === selector) && /flex-wrap:\s*wrap/.test(body),
    );
    assert.ok(blocks.length > 0, `${selector} must set flex-wrap: wrap`);
  }
});

test("NFR-006: inline grid tracks never demand more than the viewport width", () => {
  for (const { file, src } of TSX_FILES) {
    // minmax(200px, 1fr) forces a 200px+ column even when the container is
    // narrower; minmax(min(200px, 100%), 1fr) shrinks with it.
    const bad = src.match(/minmax\(\s*\d+px/g);
    assert.equal(bad, null, `${file}: use minmax(min(Npx, 100%), 1fr) for responsive grids`);
  }
});

// --- WCAG 1.4.3 Contrast (Minimum) / 1.4.11 Non-text Contrast ---

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

test("NFR-006: colour tokens meet WCAG AA contrast in light and dark themes", () => {
  const light = tokens(CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("@media (prefers-color-scheme: dark)")));
  const darkStart = CSS.indexOf("@media (prefers-color-scheme: dark)");
  const dark = { ...light, ...tokens(CSS.slice(darkStart, CSS.indexOf("/* ===", darkStart))) };

  // [foreground, background, minimum ratio]
  const pairs: [string, string, number][] = [
    ["text", "bg", 4.5],
    ["text", "surface", 4.5],
    ["text", "surface-2", 4.5],
    ["text-muted", "bg", 4.5],
    ["text-muted", "surface", 4.5],
    ["text-muted", "surface-2", 4.5],
    ["primary", "surface", 4.5],
    ["primary", "bg", 4.5],
    ["primary", "primary-soft", 4.5],
    ["on-primary", "primary", 4.5],
    ["success", "success-soft", 4.5],
    ["danger", "danger-soft", 4.5],
    ["danger", "surface", 4.5],
    ["warn", "surface", 4.5],
    ["border-strong", "surface", 3],
  ];

  for (const [theme, t] of [["light", light], ["dark", dark]] as const) {
    for (const [fg, bg, min] of pairs) {
      assert.ok(t[fg] && t[bg], `${theme}: missing token --${fg} or --${bg}`);
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(
        ratio >= min,
        `${theme}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
      );
    }
  }
});
