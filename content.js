/* ============================================================
   COUCHE DE CONTENU — Cognitive Atlas
   - Charge biases.json (contenu publié).
   - Superpose les modifications locales (navigateur uniquement).
   - Calcule les statuts éditoriaux.
   - Valide, importe et exporte les données.
   Aucune donnée n'est jamais envoyée sur le réseau : publier = remplacer
   biases.json dans le dépôt GitHub (voir README).
   ============================================================ */
(function(){
"use strict";

const SCHEMA = "cognitive-atlas/biases";
const BACKUP_SCHEMA = "cognitive-atlas/backup";
const EDITS_KEY = "atlas:edits:v1";

/* Champs éditables d'une fiche. "list" = une ligne par élément. */
const FIELDS = [
  { key:"def",          label:"Définition courte",                      type:"text", rows:2, help:"Une à deux phrases. Elle apparaît aussi dans l'infobulle de la carte." },
  { key:"explanation",  label:"Explication détaillée",                  type:"text", rows:5, help:"Ce que recouvre le biais, ses variantes, ses limites." },
  { key:"mechanism",    label:"Mécanisme psychologique",                type:"text", rows:4, help:"Pourquoi le cerveau procède ainsi." },
  { key:"daily",        label:"Exemple dans la vie quotidienne",        type:"text", rows:3 },
  { key:"professional", label:"Exemple professionnel",                  type:"text", rows:3 },
  { key:"consequences", label:"Conséquences possibles",                 type:"list", rows:4, help:"Une conséquence par ligne." },
  { key:"mitigation",   label:"Comment limiter l'influence du biais",   type:"text", rows:4 },
  { key:"question",     label:"Question de réflexion",                  type:"text", rows:2, help:"Si vide, la question du mécanisme est affichée." },
  { key:"sources",      label:"Sources et références scientifiques",    type:"list", rows:4, help:"Une référence par ligne. Ex. : Tversky, A. & Kahneman, D. (1974). Judgment under uncertainty. Science, 185, 1124-1131." }
];
const FIELD_KEYS = FIELDS.map(f => f.key);
const LIST_KEYS = FIELDS.filter(f => f.type === "list").map(f => f.key);

const STATUS = {
  todo:     { label:"Fiche à compléter", short:"À compléter" },
  wip:      { label:"Fiche en cours",    short:"En cours" },
  done:     { label:"Fiche complète",    short:"Complète" },
  verified: { label:"Fiche vérifiée",    short:"Vérifiée" }
};

const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } }
};
const now = () => new Date().toISOString();
const isFilled = v => Array.isArray(v) ? v.some(x => String(x).trim()) : typeof v === "string" && v.trim() !== "";
const cleanList = v => (Array.isArray(v) ? v : String(v ?? "").split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean);

let base = null;          // contenu publié (biases.json)
let ids = new Set();      // identifiants valides (issus de la taxonomie)
let names = {};           // id -> nom
let edits = store.get(EDITS_KEY, null) || { entries:{}, exportedAt:null, baseUpdatedAt:null };
let source = "";          // "fichier" | "intégré"
const listeners = new Set();
const emit = () => listeners.forEach(fn => { try { fn(); } catch(e){ console.error(e); } });

function persist(){ store.set(EDITS_KEY, edits); emit(); }

function emptyEntry(id){
  return { name: names[id] || id, def:"", explanation:"", mechanism:"", daily:"", professional:"",
           consequences:[], mitigation:"", question:"", sources:[], related:[], verified:false };
}

/* ---------- Validation ---------- */
/* Vérifie un document biases.json ou une sauvegarde.
   Retourne { ok, kind, errors[], warnings[], entries{id: champs utiles}, prefs? } */
function validate(doc){
  const errors = [], warnings = [], entries = {};
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok:false, errors:["Le fichier ne contient pas un objet JSON."], warnings, entries };
  let kind = "biases", content = doc, prefs = null;
  if (doc.schema === BACKUP_SCHEMA) {
    kind = "backup";
    content = doc.content;
    prefs = doc.prefs && typeof doc.prefs === "object" ? doc.prefs : null;
    if (doc.localEdits && doc.localEdits.entries && typeof doc.localEdits.entries === "object") {
      // les modifications locales de la sauvegarde complètent le contenu
      content = { schema: SCHEMA, biases: Object.assign({}, content && content.biases) };
      for (const id in doc.localEdits.entries) content.biases[id] = Object.assign({}, content.biases[id], doc.localEdits.entries[id]);
    }
  }
  if (!content || typeof content !== "object") return { ok:false, kind, errors:["La sauvegarde ne contient pas de contenu."], warnings, entries };
  if (content.schema && content.schema !== SCHEMA) errors.push(`Format inconnu : « ${content.schema} ». Attendu : « ${SCHEMA} ».`);
  if (content.schemaVersion && content.schemaVersion > 1) errors.push(`Version de format ${content.schemaVersion} non prise en charge par cette version de l'application.`);
  const b = content.biases;
  if (!b || typeof b !== "object" || Array.isArray(b)) errors.push("La clé « biases » est absente ou n'est pas un objet { identifiant: fiche }.");
  if (errors.length) return { ok:false, kind, errors, warnings, entries };

  const unknown = [];
  for (const id in b) {
    if (id.startsWith("_")) continue;
    if (!ids.has(id)) { unknown.push(id); continue; }
    const e = b[id];
    if (!e || typeof e !== "object" || Array.isArray(e)) { warnings.push(`${id} : fiche ignorée (ce n'est pas un objet).`); continue; }
    if (e.name && e.name !== names[id]) warnings.push(`${id} : le nom « ${e.name} » diffère du nom de la carte « ${names[id]} ». Le nom de la carte est conservé.`);
    const out = {};
    for (const k of FIELD_KEYS) {
      if (!(k in e) || e[k] === null) continue;
      const v = e[k];
      if (LIST_KEYS.includes(k)) {
        if (!Array.isArray(v) && typeof v !== "string") { warnings.push(`${id} : champ « ${k} » ignoré (liste attendue).`); continue; }
        if (Array.isArray(v) && v.some(x => typeof x !== "string")) { warnings.push(`${id} : champ « ${k} » ignoré (la liste doit contenir du texte).`); continue; }
        const l = cleanList(v); if (l.length) out[k] = l;
      } else {
        if (typeof v !== "string") { warnings.push(`${id} : champ « ${k} » ignoré (texte attendu).`); continue; }
        if (v.trim()) out[k] = v.trim();
      }
    }
    if ("related" in e) {
      if (Array.isArray(e.related) && e.related.every(x => typeof x === "string")) {
        const rel = e.related.filter(r => ids.has(r));
        if (rel.length < e.related.length) warnings.push(`${id} : ${e.related.length - rel.length} biais associé(s) inconnu(s) ignoré(s).`);
        if (rel.length) out.related = rel;
      } else warnings.push(`${id} : champ « related » ignoré (liste d'identifiants attendue).`);
    }
    if ("verified" in e) {
      if (typeof e.verified === "boolean") out.verified = e.verified;
      else warnings.push(`${id} : champ « verified » ignoré (vrai/faux attendu).`);
    }
    if (Object.keys(out).length) entries[id] = out;
  }
  if (unknown.length) warnings.unshift(`${unknown.length} identifiant(s) inconnu(s) ignoré(s) : ${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? "…" : ""}`);
  if (!Object.keys(entries).length) errors.push("Aucune fiche valide n'a été trouvée dans ce fichier.");
  return { ok: errors.length === 0, kind, errors, warnings, entries, prefs, updatedAt: content.updatedAt || null };
}

/* ---------- Lecture ---------- */
function published(id){ return Object.assign(emptyEntry(id), base && base.biases[id] || {}, { name: names[id] }); }
function get(id){
  const p = published(id), l = edits.entries[id];
  if (!l) return p;
  const out = Object.assign({}, p);
  for (const k of [...FIELD_KEYS, "related", "verified"]) if (k in l) out[k] = l[k];
  return out;
}
function statusOf(e){
  const rest = FIELD_KEYS.filter(k => k !== "def");
  const n = rest.filter(k => isFilled(e[k])).length;
  if (n === 0) return "todo";
  if (n < rest.length || !isFilled(e.def)) return "wip";
  return e.verified ? "verified" : "done";
}
const status = id => statusOf(get(id));
function stats(){
  const s = { todo:0, wip:0, done:0, verified:0, total: ids.size };
  ids.forEach(id => s[status(id)]++);
  return s;
}
const isModified = id => !!edits.entries[id];
const modifiedIds = () => Object.keys(edits.entries).filter(id => ids.has(id));
const unexportedIds = () => modifiedIds().filter(id => !edits.exportedAt || (edits.entries[id]._t || "") > edits.exportedAt);
const missingFields = e => FIELDS.filter(f => !isFilled(e[f.key])).map(f => f.label);

/* ---------- Écriture locale ---------- */
const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
function save(id, data){
  if (!ids.has(id)) throw new Error("Identifiant inconnu : " + id);
  const p = published(id), entry = {};
  for (const k of FIELD_KEYS) {
    if (!(k in data)) continue;
    const v = LIST_KEYS.includes(k) ? cleanList(data[k]) : String(data[k] ?? "").trim();
    if (!same(v, p[k])) entry[k] = v;
  }
  if ("verified" in data && !!data.verified !== !!p.verified) entry.verified = !!data.verified;
  const prev = edits.entries[id];
  if (prev && "related" in prev && !same(prev.related, p.related)) entry.related = prev.related;
  if (Object.keys(entry).length) { entry._t = now(); edits.entries[id] = entry; }
  else delete edits.entries[id];          // identique à la version publiée
  edits.baseUpdatedAt = base.updatedAt || null;
  persist(); syncFiches();
}
function reset(id){ delete edits.entries[id]; persist(); syncFiches(); }
function resetAll(){ edits = { entries:{}, exportedAt:null, baseUpdatedAt: base.updatedAt || null }; persist(); syncFiches(); }

/* Fusion d'un import : seuls les champs présents et non vides remplacent le contenu actuel. */
function applyImport(result){
  let changed = 0;
  for (const id in result.entries) {
    const cur = get(id), inc = result.entries[id], next = {};
    for (const k of FIELD_KEYS) next[k] = k in inc ? inc[k] : cur[k];
    next.verified = "verified" in inc ? inc.verified : cur.verified;
    const before = JSON.stringify(cur);
    save(id, next);
    if ("related" in inc) {
      const p = published(id);
      if (!same(inc.related, p.related)) { edits.entries[id] = Object.assign(edits.entries[id] || {}, { related: inc.related, _t: now() }); persist(); }
    }
    if (JSON.stringify(get(id)) !== before) changed++;
  }
  syncFiches();
  return changed;
}

/* ---------- Export ---------- */
function exportDoc(){
  const biases = {};
  [...ids].forEach(id => {
    const e = get(id), o = { name: e.name };
    for (const k of FIELD_KEYS) o[k] = e[k];
    o.related = e.related || []; o.verified = !!e.verified;
    biases[id] = o;
  });
  return { schema: SCHEMA, schemaVersion: 1, updatedAt: now(), note: (base && base.note) || "", biases };
}
function backupDoc(prefs){
  return { schema: BACKUP_SCHEMA, schemaVersion: 1, createdAt: now(),
           content: exportDoc(), localEdits: edits, prefs: prefs || {} };
}
function markExported(){ edits.exportedAt = now(); persist(); }

/* Remplit FICHES (structure conservée de data.js) à partir du contenu fusionné. */
function syncFiches(){
  if (typeof FICHES !== "object") return;
  for (const k in FICHES) delete FICHES[k];
  ids.forEach(id => { const e = get(id); FICHES[e.name] = e; });
}

/* ---------- Chargement ---------- */
function useTaxonomy(knownIds){ ids = new Set(Object.keys(knownIds)); names = knownIds; }
async function load(knownIds){
  useTaxonomy(knownIds);
  const build = document.querySelector('meta[name="atlas-build"]')?.content || "";
  const v = build && !build.includes("__") ? build : String(Date.now());
  let doc = null, err = null;
  // Version autonome : le contenu est intégré dans la page (<script id="atlas-content">).
  // Version GitHub Pages : le contenu est lu dans biases.json, sans cache périmé.
  if (!document.getElementById("atlas-content")) {
    try {
      const r = await fetch("biases.json?v=" + encodeURIComponent(v), { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      doc = await r.json(); source = "fichier";
    } catch (e) { err = e; }
  }
  if (!doc) {
    const el = document.getElementById("atlas-content");
    if (el) { try { doc = JSON.parse(el.textContent); source = "intégré"; } catch (e) { err = e; } }
  }
  if (!doc) throw new Error("Impossible de charger biases.json" + (err ? " (" + err.message + ")" : "") + ".");
  const res = validate(doc);
  if (!res.ok) throw new Error("biases.json invalide : " + res.errors.join(" "));
  if (res.warnings.length) console.warn("[Cognitive Atlas] biases.json :", res.warnings);
  base = { schema: SCHEMA, updatedAt: doc.updatedAt || null, note: doc.note || "", biases: {} };
  ids.forEach(id => base.biases[id] = Object.assign(emptyEntry(id), res.entries[id] || {}, { name: names[id] }));
  // nettoie les modifications locales d'identifiants disparus
  for (const id in edits.entries) if (!ids.has(id)) delete edits.entries[id];
  syncFiches();
  return base;
}

window.AtlasContent = {
  FIELDS, STATUS, load, useTaxonomy, get, published, status, statusOf, stats, missingFields,
  save, reset, resetAll, isModified, modifiedIds, unexportedIds,
  validate, applyImport, exportDoc, backupDoc, markExported,
  onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); },
  get meta(){ return { source, updatedAt: base && base.updatedAt, exportedAt: edits.exportedAt,
    baseChangedSinceEdits: !!(modifiedIds().length && edits.baseUpdatedAt && base && base.updatedAt && base.updatedAt > edits.baseUpdatedAt) }; }
};
})();
