/* ============================================================
   ÉDITEUR DE CONTENU — Cognitive Atlas
   Mode édition LOCAL : les modifications sont enregistrées dans ce navigateur
   (localStorage). Rien n'est envoyé sur Internet.
   Publication : exporter biases.json puis le remplacer dans le dépôt GitHub.
   Ce mode n'est PAS protégé : n'importe quel visiteur peut l'activer, mais il ne
   modifie que sa propre copie locale et ne peut rien publier.
   ============================================================ */
(function(){
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const C = () => window.AtlasContent, A = () => window.Atlas;
const KEY = "atlas:editing";
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const meta = n => document.querySelector(`meta[name="${n}"]`)?.content?.trim() || "";
const repo = () => { const r = meta("atlas-repo"); return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : ""; };
const branch = () => meta("atlas-branch") || "main";
const fmtDate = iso => { if (!iso) return "jamais"; try { return new Date(iso).toLocaleString("fr-FR", { dateStyle:"medium", timeStyle:"short" }); } catch(e){ return iso; } };
const stamp = () => new Date().toISOString().slice(0, 10);

const ICON = {
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 20V9m-4 4 4-4 4 4M5 4h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  pub: '<svg viewBox="0 0 24 24"><path d="M12 3v12m-4-8 4-4 4 4"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg>',
  disk: '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>'
};

let editing = false, bar = null, btn = null, root = null;

/* ---------- Mise en place ---------- */
function init(){
  // bouton discret dans la barre haute
  btn = document.createElement("button");
  btn.className = "icon-btn edit-toggle"; btn.id = "editBtn";
  btn.setAttribute("aria-pressed", "false"); btn.setAttribute("aria-label", "Mode édition"); btn.title = "Mode édition (local)";
  btn.innerHTML = ICON.pen + '<span class="pending-dot" hidden></span>';
  $("#motionBtn").before(btn);
  btn.onclick = () => setEditing(!editing);

  bar = document.createElement("div");
  bar.className = "editbar"; bar.id = "editbar"; bar.hidden = true;
  bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Outils d'édition");
  $(".stage").before(bar);
  bar.addEventListener("click", onBarClick);

  root = document.createElement("div"); root.id = "editorRoot"; document.body.appendChild(root);
  document.addEventListener("keydown", onKey, true);

  C().onChange(() => { renderBar(); syncDot(); A().refreshPanel(); });
  if (location.hash === "#edition") store.set(KEY, true);
  setEditing(!!store.get(KEY, false), true);
  syncDot();
}
function setEditing(on, silent){
  editing = on; store.set(KEY, on);
  document.documentElement.classList.toggle("editing", on);
  btn.setAttribute("aria-pressed", String(on));
  bar.hidden = !on;
  if (on) renderBar();
  A().refreshPanel(); A().refreshList();
  window.dispatchEvent(new Event("resize"));
  if (!silent) A().toast(on ? "Mode édition activé · modifications locales" : "Mode édition désactivé");
}
function syncDot(){ const d = btn?.querySelector(".pending-dot"); if (d) d.hidden = C().unexportedIds().length === 0; }

/* ---------- Barre d'outils ---------- */
function renderBar(){
  if (!bar || !editing) return;
  const s = C().stats(), un = C().unexportedIds().length, mod = C().modifiedIds().length, m = C().meta;
  const pct = k => (100 * s[k] / s.total).toFixed(2);
  bar.innerHTML = `
    <div class="eb-mode"><span class="eb-dot"></span><b>Édition locale</b><span class="eb-sub">Ce navigateur uniquement · non publié</span></div>
    <div class="eb-prog" title="Progression éditoriale">
      <div class="eb-bar" aria-hidden="true"><i class="st-verified" style="width:${pct("verified")}%"></i><i class="st-done" style="width:${pct("done")}%"></i><i class="st-wip" style="width:${pct("wip")}%"></i></div>
      <span class="eb-nums"><b>${s.done + s.verified}</b>/${s.total} complètes · ${s.verified} vérifiée${s.verified > 1 ? "s" : ""} · ${s.wip} en cours · ${s.todo} à compléter</span>
    </div>
    ${un ? `<button class="eb-pill warn" data-a="export">${un} modification${un > 1 ? "s" : ""} non exportée${un > 1 ? "s" : ""}</button>` : (mod ? `<span class="eb-pill">${mod} fiche${mod > 1 ? "s" : ""} modifiée${mod > 1 ? "s" : ""} · exportée${mod > 1 ? "s" : ""}</span>` : "")}
    ${m.baseChangedSinceEdits ? `<span class="eb-pill warn" title="Vos modifications locales restent prioritaires sur les fiches concernées.">La version publiée a changé depuis vos modifications</span>` : ""}
    <div class="eb-actions">
      <button class="eb-btn" data-a="export">${ICON.down}Exporter JSON</button>
      <button class="eb-btn" data-a="import">${ICON.up}Importer</button>
      <button class="eb-btn" data-a="backup">${ICON.disk}Sauvegarde</button>
      <button class="eb-btn pub" data-a="publish">${ICON.pub}Publier</button>
      <button class="eb-btn icon" data-a="quit" aria-label="Quitter le mode édition" title="Quitter le mode édition">${ICON.close}</button>
    </div>`;
}
function onBarClick(e){
  const a = e.target.closest("[data-a]")?.dataset.a;
  if (a === "export") openExport();
  else if (a === "import") openImport();
  else if (a === "backup") openBackup();
  else if (a === "publish") openPublish();
  else if (a === "quit") setEditing(false);
}

/* ---------- Panneau : bouton « Modifier cette fiche » ---------- */
function decoratePanel(b, pb){
  if (!editing) return;
  const actions = pb.querySelector(".p-actions");
  const e = document.createElement("button");
  e.className = "btn edit"; e.id = "pEdit"; e.innerHTML = ICON.pen + "Modifier cette fiche";
  e.onclick = () => openForm(b);
  actions.prepend(e);
  const miss = C().missingFields(C().get(b.id));
  if (miss.length && miss.length < C().FIELDS.length) {
    const p = document.createElement("p"); p.className = "missing";
    p.textContent = "À compléter : " + miss.join(", ").toLowerCase() + ".";
    pb.querySelector(".badges").after(p);
  }
}

/* ---------- Fenêtres ---------- */
let closeGuard = null, lastFocus = null;
function openDialog(html, cls = ""){
  lastFocus = document.activeElement;
  root.innerHTML = `<div class="modal ed-modal" role="dialog" aria-modal="true"><div class="dialog ${cls}">${html}</div></div>`;
  const m = root.firstChild;
  m.addEventListener("click", ev => { if (ev.target === m || ev.target.closest("[data-close]")) tryClose(); });
  setTimeout(() => (m.querySelector("[autofocus]") || m.querySelector("textarea, button"))?.focus({ preventScroll: true }), 30);
  return m.firstChild;
}
function tryClose(){
  if (closeGuard && !closeGuard()) return;
  closeGuard = null; root.innerHTML = ""; lastFocus?.focus?.({ preventScroll: true });
}
function onKey(e){
  if (!root || !root.firstChild) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); tryClose(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { const s = root.querySelector("[data-save]"); if (s) { e.preventDefault(); s.click(); } }
}
const head = (crumb, title) => `<div class="dh"><span class="crumb">${crumb}</span><button class="icon-btn" data-close aria-label="Fermer">${ICON.close}</button></div><h2>${title}</h2>`;

/* ---------- Formulaire d'édition ---------- */
function openForm(b){
  const cur = C().get(b.id), pub = C().published(b.id), F = C().FIELDS;
  const val = (f, e) => f.type === "list" ? (e[f.key] || []).join("\n") : (e[f.key] || "");
  const d = openDialog(`
    ${head(`${esc(b.cat.name)} / ${esc(b.group.short)}`, "Modifier la fiche")}
    <form class="ed-form" novalidate>
      <div class="ed-top">
        <label class="ed-field ro"><span class="ed-label">Nom du biais <em>lecture seule · identifiant ${esc(b.id)}</em></span>
          <input type="text" value="${esc(b.name)}" readonly aria-readonly="true"></label>
        <div class="ed-status" id="edStatus"></div>
      </div>
      ${F.map(f => `<label class="ed-field" data-k="${f.key}">
        <span class="ed-label">${esc(f.label)}<em class="ed-mod" hidden>modifié</em></span>
        ${f.help ? `<span class="ed-help">${esc(f.help)}</span>` : ""}
        <textarea id="ed-${f.key}" name="${f.key}" rows="${f.rows}" spellcheck="true" ${f.key === "def" ? "autofocus" : ""}>${esc(val(f, cur))}</textarea>
      </label>`).join("")}
      <label class="ed-check"><input type="checkbox" id="ed-verified" ${cur.verified ? "checked" : ""}>
        <span><b>Fiche vérifiée</b> : contenu relu et sources contrôlées. Disponible quand tous les champs sont remplis.</span></label>
    </form>
    <div class="ed-foot" id="edFoot">
      <button class="btn ghost" data-reset ${C().isModified(b.id) ? "" : "disabled"} title="Revenir à la version publiée">Réinitialiser</button>
      <span class="ed-spacer"></span>
      <button class="btn ghost" data-cancel>Annuler</button>
      <button class="btn primary" data-save>Enregistrer</button>
    </div>
    <p class="ed-note">Enregistrer conserve la fiche dans ce navigateur. Elle sera publiée quand vous remplacerez biases.json sur GitHub.</p>`, "editor");
  d.style.setProperty("--c", b.cat.color);
  const form = d.querySelector("form"), ver = $("#ed-verified", d);
  const read = () => {
    const o = {};
    F.forEach(f => { const v = form.elements[f.key].value; o[f.key] = f.type === "list" ? v.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : v.trim(); });
    o.verified = ver.checked; return o;
  };
  const initial = JSON.stringify(read());
  const dirty = () => JSON.stringify(read()) !== initial;
  const sync = () => {
    const o = read(), st = C().statusOf(Object.assign({}, o, { verified: false }));
    const complete = st === "done";
    ver.disabled = !complete; if (!complete) ver.checked = false;
    const fin = C().statusOf(o);
    const miss = C().missingFields(o);
    $("#edStatus", d).innerHTML = `<span class="badge st st-${fin}">${C().STATUS[fin].label}</span><span class="ed-miss">${miss.length ? `${F.length - miss.length}/${F.length} champs remplis` : "Tous les champs sont remplis"}</span>`;
    F.forEach(f => {
      const v = f.type === "list" ? o[f.key] : o[f.key];
      d.querySelector(`[data-k="${f.key}"] .ed-mod`).hidden = JSON.stringify(v) === JSON.stringify(f.type === "list" ? (pub[f.key] || []) : (pub[f.key] || ""));
    });
  };
  const grow = t => { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 520) + "px"; };
  form.querySelectorAll("textarea").forEach(t => { grow(t); t.addEventListener("input", () => { grow(t); sync(); }); });
  ver.addEventListener("change", sync);
  sync();

  const foot = $("#edFoot", d);
  const footHTML = foot.innerHTML;
  const confirmRow = (msg, okLabel, onOk) => {
    foot.innerHTML = `<span class="ed-confirm">${msg}</span><span class="ed-spacer"></span><button class="btn ghost" data-back>Retour</button><button class="btn danger" data-ok>${okLabel}</button>`;
    foot.querySelector("[data-back]").onclick = () => { foot.innerHTML = footHTML; bindFoot(); };
    foot.querySelector("[data-ok]").onclick = onOk;
    foot.querySelector("[data-ok]").focus();
  };
  closeGuard = () => {
    if (!dirty()) return true;
    confirmRow("Fermer sans enregistrer ? Les changements saisis seront perdus.", "Abandonner", () => { closeGuard = null; tryClose(); });
    return false;
  };
  function bindFoot(){
    foot.querySelector("[data-cancel]").onclick = () => tryClose();
    foot.querySelector("[data-save]").onclick = () => {
      try { C().save(b.id, read()); } catch (err) { A().toast("Enregistrement impossible : " + err.message); return; }
      closeGuard = null; tryClose();
      A().toast("Fiche enregistrée dans ce navigateur · non publiée");
    };
    const r = foot.querySelector("[data-reset]");
    r.onclick = () => confirmRow("Revenir à la version publiée de cette fiche ? Vos modifications locales seront effacées.", "Réinitialiser", () => {
      C().reset(b.id); closeGuard = null; tryClose(); A().toast("Fiche réinitialisée à la version publiée");
    });
  }
  bindFoot();
}

/* ---------- Téléchargement / copie ---------- */
function download(name, text){
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) { return false; }
}
async function copy(text, area){
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) { if (area) { area.hidden = false; area.value = text; area.focus(); area.select(); } return false; }
}

/* ---------- Export ---------- */
function openExport(){
  const un = C().unexportedIds(), mod = C().modifiedIds(), s = C().stats(), m = C().meta;
  const d = openDialog(`
    ${head("Données", "Exporter les contenus")}
    <p class="ed-p">Le fichier exporté remplace <code>biases.json</code> dans votre dépôt. Il contient les ${s.total} fiches : la version publiée, complétée par vos ${mod.length} fiche${mod.length > 1 ? "s" : ""} modifiée${mod.length > 1 ? "s" : ""} localement.</p>
    <dl class="ed-facts">
      <div><dt>Non exportées</dt><dd>${un.length ? `${un.length} fiche${un.length > 1 ? "s" : ""} : ${un.slice(0, 5).map(id => esc(C().get(id).name)).join(", ")}${un.length > 5 ? "…" : ""}` : "Aucune"}</dd></div>
      <div><dt>Dernier export</dt><dd>${fmtDate(m.exportedAt)}</dd></div>
      <div><dt>Version publiée chargée</dt><dd>${fmtDate(m.updatedAt)}</dd></div>
    </dl>
    <div class="row ed-row">
      <button class="btn primary" data-dl autofocus>${ICON.down}Télécharger biases.json</button>
      <button class="btn ghost" data-cp>${ICON.copy}Copier le JSON</button>
    </div>
    <textarea class="ed-raw" hidden readonly aria-label="Contenu JSON à copier"></textarea>
    <p class="ed-note">Si le téléchargement ne démarre pas (aperçu intégré, navigateur restrictif), utilisez « Copier le JSON » et collez-le dans biases.json.</p>
    <div class="ed-danger"><button class="linkish" data-resetall ${mod.length ? "" : "disabled"}>Effacer toutes les modifications locales…</button></div>`);
  const text = () => JSON.stringify(C().exportDoc(), null, 2) + "\n";
  d.querySelector("[data-dl]").onclick = () => {
    if (download("biases.json", text())) { C().markExported(); A().toast("biases.json téléchargé · à publier sur GitHub"); tryClose(); }
    else A().toast("Téléchargement bloqué : utilisez « Copier le JSON »");
  };
  d.querySelector("[data-cp]").onclick = async () => {
    const ok = await copy(text(), d.querySelector(".ed-raw"));
    C().markExported();
    A().toast(ok ? "JSON copié dans le presse-papiers" : "Sélectionnez le texte affiché puis copiez-le");
  };
  d.querySelector("[data-resetall]").onclick = ev => {
    const box = d.querySelector(".ed-danger");
    box.innerHTML = `<span class="ed-confirm">Effacer les ${mod.length} fiche${mod.length > 1 ? "s" : ""} modifiée${mod.length > 1 ? "s" : ""} dans ce navigateur ? Pensez à télécharger une sauvegarde avant.</span><button class="btn ghost" data-no>Retour</button><button class="btn danger" data-yes>Tout effacer</button>`;
    box.querySelector("[data-no]").onclick = () => { tryClose(); openExport(); };
    box.querySelector("[data-yes]").onclick = () => { C().resetAll(); tryClose(); A().toast("Modifications locales effacées"); };
  };
}

/* ---------- Sauvegarde complète ---------- */
function prefs(){
  const g = k => store.get("atlas:" + k, []);
  return { seen: g("seen"), favs: g("favs"), exps: g("exps") };
}
function openBackup(){
  const d = openDialog(`
    ${head("Données", "Télécharger une sauvegarde complète")}
    <p class="ed-p">La sauvegarde contient tout le contenu actuel, le détail de vos modifications locales (avec leurs dates), vos favoris et votre progression. Elle se réimporte avec « Importer ». Ce n'est pas le fichier à publier : pour le site, utilisez « Exporter JSON ».</p>
    <div class="row ed-row">
      <button class="btn primary" data-dl autofocus>${ICON.disk}Télécharger la sauvegarde</button>
      <button class="btn ghost" data-cp>${ICON.copy}Copier</button>
    </div>
    <textarea class="ed-raw" hidden readonly aria-label="Sauvegarde JSON à copier"></textarea>`);
  const text = () => JSON.stringify(C().backupDoc(prefs()), null, 2) + "\n";
  d.querySelector("[data-dl]").onclick = () => {
    if (download(`cognitive-atlas-sauvegarde-${stamp()}.json`, text())) { A().toast("Sauvegarde téléchargée"); tryClose(); }
    else A().toast("Téléchargement bloqué : utilisez « Copier »");
  };
  d.querySelector("[data-cp]").onclick = async () => { const ok = await copy(text(), d.querySelector(".ed-raw")); A().toast(ok ? "Sauvegarde copiée" : "Sélectionnez le texte affiché puis copiez-le"); };
}

/* ---------- Import ---------- */
function openImport(){
  const d = openDialog(`
    ${head("Données", "Importer un fichier JSON")}
    <p class="ed-p">Accepte un fichier <code>biases.json</code> ou une sauvegarde complète. Le fichier est vérifié avant toute modification. Seuls les champs remplis remplacent le contenu actuel : un champ absent ou vide ne supprime jamais une fiche existante.</p>
    <label class="ed-drop" tabindex="0"><input type="file" id="edFile" accept=".json,application/json" hidden>
      <b>Choisir un fichier</b><span>ou le déposer ici</span></label>
    <details class="ed-paste"><summary>Coller du JSON à la place</summary>
      <textarea id="edPaste" rows="6" placeholder='{ "schema": "cognitive-atlas/biases", "biases": { … } }'></textarea>
      <button class="btn ghost" data-parse>Analyser le texte collé</button></details>
    <div id="edReport" aria-live="polite"></div>`);
  const drop = d.querySelector(".ed-drop"), file = $("#edFile", d);
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  file.onchange = () => file.files[0] && readFile(file.files[0]);
  d.querySelector("[data-parse]").onclick = () => analyse($("#edPaste", d).value, "texte collé");
  function readFile(f){
    if (f.size > 5e6) { report({ ok:false, errors:["Fichier trop volumineux (plus de 5 Mo)."], warnings:[] }, f.name); return; }
    const r = new FileReader();
    r.onload = () => analyse(String(r.result), f.name);
    r.onerror = () => report({ ok:false, errors:["Lecture du fichier impossible."], warnings:[] }, f.name);
    r.readAsText(f);
  }
  function analyse(text, label){
    let doc;
    try { doc = JSON.parse(text); } catch (e) { report({ ok:false, errors:["Ce n'est pas du JSON valide : " + e.message], warnings:[] }, label); return; }
    report(C().validate(doc), label);
  }
  function report(res, label){
    const box = $("#edReport", d);
    const n = Object.keys(res.entries || {}).length;
    const nFields = Object.values(res.entries || {}).reduce((s, e) => s + Object.keys(e).length, 0);
    box.innerHTML = `<div class="ed-rep ${res.ok ? "ok" : "ko"}">
      <b>${esc(label)}</b> · ${res.ok ? `${res.kind === "backup" ? "Sauvegarde complète" : "Fichier biases.json"} valide : ${n} fiche${n > 1 ? "s" : ""}, ${nFields} champ${nFields > 1 ? "s" : ""} renseigné${nFields > 1 ? "s" : ""}.` : "Import refusé."}
      ${res.errors.length ? `<ul>${res.errors.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${res.warnings.length ? `<details><summary>${res.warnings.length} avertissement${res.warnings.length > 1 ? "s" : ""}</summary><ul>${res.warnings.slice(0, 40).map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
    </div>
    ${res.ok ? `<div class="row ed-row">${res.kind === "backup" && res.prefs ? `<label class="ed-check small"><input type="checkbox" id="edPrefs" checked><span>Restaurer aussi favoris et progression</span></label>` : ""}<span class="ed-spacer"></span><button class="btn primary" data-apply>Appliquer l'import</button></div>
      <p class="ed-note">Les fiches importées deviennent des modifications locales. Elles ne seront publiées qu'après export et mise à jour de biases.json sur GitHub.</p>` : ""}`;
    const ap = box.querySelector("[data-apply]");
    if (ap) ap.onclick = () => {
      const changed = C().applyImport(res);
      if (res.prefs && $("#edPrefs", d)?.checked) {
        ["seen", "favs", "exps"].forEach(k => {
          if (Array.isArray(res.prefs[k])) store.set("atlas:" + k, [...new Set([...store.get("atlas:" + k, []), ...res.prefs[k].filter(x => typeof x === "string")])]);
        });
      }
      tryClose();
      A().toast(`${changed} fiche${changed > 1 ? "s" : ""} mise${changed > 1 ? "s" : ""} à jour localement`);
    };
  }
}

/* ---------- Publication ---------- */
function openPublish(){
  const r = repo(), un = C().unexportedIds().length;
  const up = r ? `https://github.com/${r}/upload/${encodeURIComponent(branch())}` : "";
  const actions = r ? `https://github.com/${r}/actions` : "";
  const d = openDialog(`
    ${head("Publication", "Publier sur le site")}
    <div class="ed-two">
      <div><h4>Édition locale</h4><p>Ce que vous enregistrez ici reste dans ce navigateur. Personne d'autre ne le voit, et rien n'est envoyé.</p></div>
      <div><h4>Publication</h4><p>Le site public lit <code>biases.json</code> dans votre dépôt GitHub. Publier, c'est remplacer ce fichier par un commit. Seul un compte autorisé sur le dépôt peut le faire.</p></div>
    </div>
    <ol class="ed-steps">
      <li><b>Exporter</b> le fichier <code>biases.json</code>${un ? ` (${un} modification${un > 1 ? "s" : ""} non exportée${un > 1 ? "s" : ""})` : ""}.</li>
      <li><b>Envoyer</b> le fichier sur GitHub : « Add file › Upload files », déposer <code>biases.json</code>, puis « Commit changes ».</li>
      <li><b>Attendre</b> la fin du déploiement (onglet Actions, 1 à 2 minutes). La validation automatique refuse un fichier mal formé, et le site actuel reste en ligne.</li>
      <li><b>Vérifier</b> le site public. Les nouvelles données sont chargées à chaque déploiement.</li>
    </ol>
    <div class="row ed-row">
      <button class="btn primary" data-exp>${ICON.down}Exporter biases.json</button>
      ${r ? `<a class="btn ghost" href="${up}" target="_blank" rel="noopener">Ouvrir l'envoi sur GitHub</a><a class="btn ghost" href="${actions}" target="_blank" rel="noopener">Suivre le déploiement</a>`
          : `<span class="ed-note" style="margin:0">Pour un lien direct vers votre dépôt, renseignez <code>&lt;meta name="atlas-repo" content="utilisateur/depot"&gt;</code> dans index.html.</span>`}
    </div>
    <p class="ed-note">Aucun jeton ni mot de passe n'est stocké dans le site : la publication passe toujours par votre compte GitHub.</p>`);
  d.querySelector("[data-exp]").onclick = () => { tryClose(); openExport(); };
}

window.AtlasEditor = { init, decoratePanel, get editing(){ return editing; }, openForm };
})();
