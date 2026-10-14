#!/usr/bin/env node
/* Construit la version autonome (un seul fichier HTML, données intégrées).
   Usage : node tools/build-standalone.mjs [index.html] [sortie.html]
   Par défaut : index.html -> cognitive-atlas.html, à la racine du projet. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(process.argv[2] || resolve(root, "index.html"));
const output = resolve(process.argv[3] || resolve(root, "cognitive-atlas.html"));
const dir = dirname(input);
let html = readFileSync(input, "utf8");

const biases = JSON.parse(readFileSync(resolve(dir, "biases.json"), "utf8"));
const json = JSON.stringify(biases).replace(/</g, "\\u003c");
const safe = js => js.replace(/<\/script/gi, "<\\/script");

let count = 0;
html = html.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) => {
  count++;
  const code = readFileSync(resolve(dir, src), "utf8");
  const extra = src === "data.js" ? `<script type="application/json" id="atlas-content">${json}</script>\n` : "";
  return `${extra}<script>\n/* ${src} */\n${safe(code)}\n</script>`;
});
if (count < 4) { console.error(`✗ ${count} script(s) intégré(s) seulement, 4 attendus.`); process.exit(1); }
writeFileSync(output, html);
console.log(`✓ Version autonome écrite : ${output} (${Math.round(html.length / 1024)} Ko)`);
