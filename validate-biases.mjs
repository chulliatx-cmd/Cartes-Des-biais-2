#!/usr/bin/env node
/* Valide biases.json avant publication.
   Usage : node tools/validate-biases.mjs [chemin/vers/biases.json]
   Utilise la même validation que l'application (content.js) et la taxonomie de data.js.
   Code de sortie 1 en cas d'erreur : le déploiement GitHub Pages est alors interrompu. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(process.argv[2] || resolve(root, "biases.json"));
const ctx = { console, window: {}, document: { querySelector: () => null, getElementById: () => null } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync(resolve(root, "data.js"), "utf8") + "\n;this.CATS = CATS; this.FICHES = FICHES;", ctx);
vm.runInContext(readFileSync(resolve(root, "content.js"), "utf8"), ctx);

const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const known = {};
for (const c of ctx.CATS) for (const g of c.groups) for (const raw of g.b) {
  const name = raw.split("::")[0].replace(/\|\?$/, "");
  const id = slug(name);
  if (known[id]) { console.error(`✗ Identifiant en double dans data.js : ${id}`); process.exit(1); }
  known[id] = name;
}
const C = ctx.AtlasContent;
C.useTaxonomy(known);

let doc;
try { doc = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error(`✗ ${file} n'est pas un JSON valide : ${e.message}`); process.exit(1); }

const res = C.validate(doc);
const errors = [...res.errors];
if (doc.schema !== "cognitive-atlas/biases") errors.push(`Le champ "schema" doit valoir "cognitive-atlas/biases".`);
const missing = Object.keys(known).filter(id => !(doc.biases && doc.biases[id]));
const noDef = Object.keys(known).filter(id => doc.biases && doc.biases[id] && !String(doc.biases[id].def || "").trim());

for (const w of res.warnings) console.warn("! " + w);
if (missing.length) console.warn(`! ${missing.length} biais sans fiche (contenu vide affiché) : ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`);
if (noDef.length) console.warn(`! ${noDef.length} fiche(s) sans définition courte.`);
if (errors.length) { for (const e of errors) console.error("✗ " + e); process.exit(1); }

// statistiques éditoriales
const st = { todo: 0, wip: 0, done: 0, verified: 0 };
for (const id of Object.keys(known)) st[C.statusOf(Object.assign({}, doc.biases[id] || {}))]++;
console.log(`✓ biases.json valide · ${Object.keys(res.entries).length}/${Object.keys(known).length} fiches avec contenu`);
console.log(`  Vérifiées ${st.verified} · Complètes ${st.done} · En cours ${st.wip} · À compléter ${st.todo}`);
