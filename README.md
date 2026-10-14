# Cognitive Atlas

Cartographie interactive et pédagogique des biais cognitifs, d'après le *Codex des biais cognitifs* (2016, concept Buster Benson, mise en page JM3 · John Manoogian III).

Site statique : HTML, CSS et JavaScript sans framework ni étape de compilation. Compatible GitHub Pages.

## Fichiers

| Fichier | Contenu | Qui le modifie |
|---|---|---|
| `biases.json` | **Contenu pédagogique** des 190 fiches : définitions, explications, exemples, sources, statut vérifié. | Vous, via le mode édition puis l'export |
| `data.js` | **Structure** : familles, mécanismes, noms des biais (`CATS`), expériences (`EXP_META`). `FICHES` est rempli automatiquement à partir de `biases.json`. | Rarement |
| `content.js` | Chargement de `biases.json`, modifications locales, statuts, validation, import/export. | Code |
| `app.js` | Cartographie, interactions, fiches, modes Explorer / Comprendre / Expérimenter. | Code |
| `editor.js` | Mode édition local : formulaire, barre d'outils, progression, aide à la publication. | Code |
| `index.html` | Page et styles. | Code |
| `cognitive-atlas.html` | Version autonome (un seul fichier, données intégrées). Générée par `tools/build-standalone.mjs`. | Généré |
| `tools/validate-biases.mjs` | Vérifie `biases.json` (structure, identifiants, types). | Code |
| `.github/workflows/deploy.yml` | Valide puis publie le site sur GitHub Pages à chaque envoi sur `main`. | Code |

## Édition locale et publication

Ce sont deux étapes distinctes.

- **Édition locale** : le mode édition enregistre vos changements dans le navigateur (localStorage). Rien n'est envoyé sur Internet. Effacer les données du navigateur efface ces changements : téléchargez régulièrement une sauvegarde.
- **Publication** : le site public lit `biases.json` dans le dépôt. Publier, c'est remplacer ce fichier par un commit. Seul un compte ayant un accès en écriture au dépôt peut le faire.

Le mode édition n'est **pas** un espace protégé. N'importe quel visiteur peut l'ouvrir, mais il ne modifie que sa propre copie locale et ne peut rien publier. La protection réelle, ce sont les droits d'écriture sur le dépôt GitHub. Le site ne contient aucun jeton ni mot de passe.

## 1. Modifier une fiche

1. Ouvrez le site et cliquez sur le crayon en haut à droite (ou ajoutez `#edition` à l'adresse).
2. Sélectionnez un biais sur la carte, dans la liste ou par la recherche.
3. Cliquez sur **Modifier cette fiche**.
4. Remplissez les champs. Pour les conséquences et les sources : une ligne par élément. Les liens `https://…` deviennent cliquables.
5. Cochez **Fiche vérifiée** quand tous les champs sont remplis et les sources contrôlées.

Statuts calculés automatiquement :

- **À compléter** : seule la définition courte existe.
- **En cours** : certains champs sont remplis.
- **Complète** : les 9 champs sont remplis.
- **Vérifiée** : complète, et cochée comme vérifiée.

## 2. Sauvegarder

- **Enregistrer** (ou Ctrl/Cmd + S) : la fiche est enregistrée dans ce navigateur et s'affiche aussitôt.
- **Annuler** : ferme sans enregistrer (confirmation demandée si vous avez saisi quelque chose).
- **Réinitialiser** : revient à la version publiée de la fiche.
- **Sauvegarde** : télécharge un fichier complet (contenu, modifications locales datées, favoris, progression), à réimporter avec **Importer**.

La barre d'édition indique le nombre de **modifications non exportées**.

## 3. Exporter

**Exporter JSON → Télécharger biases.json.** Le fichier contient les 190 fiches (version publiée + vos modifications). Si le téléchargement est bloqué, utilisez **Copier le JSON**.

**Importer** accepte un `biases.json` ou une sauvegarde. Le fichier est vérifié avant d'être appliqué :

- les identifiants inconnus sont ignorés et signalés ;
- un champ du mauvais type est ignoré et signalé ;
- un champ absent ou vide **ne supprime jamais** le contenu existant ;
- les fiches importées deviennent des modifications locales, à exporter pour les publier.

## 4. Publier sur GitHub Pages

### Mise en place (une seule fois)

1. Créez un dépôt GitHub et envoyez-y tous les fichiers de ce dossier (y compris `.github/` et `tools/`).
2. Dans le dépôt : **Settings › Pages › Build and deployment › Source** : choisissez **GitHub Actions**.
3. Facultatif : dans `index.html`, renseignez `<meta name="atlas-repo" content="utilisateur/depot">` pour obtenir des liens directs dans le panneau **Publier**.

### À chaque mise à jour du contenu

1. Dans le site, **Exporter JSON** → `biases.json`.
2. Sur GitHub : **Add file › Upload files**, déposez `biases.json`, puis **Commit changes** sur `main`.
3. L'onglet **Actions** montre le déploiement (1 à 2 minutes). Si `biases.json` est invalide, la publication est refusée et le site actuel reste en ligne.
4. Rechargez le site public. Chaque déploiement inscrit le numéro du commit dans les adresses des fichiers, ce qui oblige les navigateurs à charger les nouvelles données. Le CDN de GitHub peut garder l'ancienne version jusqu'à 10 minutes au maximum.

Après publication, les fiches modifiées localement restent marquées comme telles dans votre navigateur. Une fois la publication vérifiée, vous pouvez les effacer (**Exporter JSON › Effacer toutes les modifications locales…**) pour repartir de la version publiée.

## Travailler en local

`index.html` doit être servi par un serveur web (le navigateur bloque la lecture de `biases.json` en `file://`) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Vérifier les données et régénérer la version autonome (Node 18 ou plus, aucune dépendance) :

```bash
node tools/validate-biases.mjs
node tools/build-standalone.mjs
```

## Format de `biases.json`

```json
{
  "schema": "cognitive-atlas/biases",
  "schemaVersion": 1,
  "updatedAt": "2026-10-14T00:00:00Z",
  "biases": {
    "ancrage": {
      "name": "Ancrage",
      "def": "…",
      "explanation": "…",
      "mechanism": "…",
      "daily": "…",
      "professional": "…",
      "consequences": ["…", "…"],
      "mitigation": "…",
      "question": "…",
      "sources": ["Auteur (année). Titre. Revue."],
      "related": ["effet-de-cadrage", "conservatisme"],
      "verified": false
    }
  }
}
```

Les clés (`ancrage`…) sont calculées à partir des noms dans `data.js`. Pour renommer un biais, modifiez son nom dans `data.js` **et** sa clé dans `biases.json`, puis lancez `node tools/validate-biases.mjs`.
