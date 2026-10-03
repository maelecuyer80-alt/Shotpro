# ShotPro Live 2.0 : mise en ligne et installation

## Ce que contient l'appli

- **Programme ShotPro** (4 semaines) avec suivi des tirs à la caméra : rentré/raté, trajectoire, angle d'entrée, sommet, arrivée court/long, distance, angle de sortie.
- **Machine de renvoi** : séances par angle (0° coin gauche → 90° axe → 180° coin droit), distance, hauteur et cadence de passe, avec 8 programmes prêts et une carte des tirs.
- **Défis pros** : Form shooting 35, 5 positions, Mikan drill, Beat the Pro, Tour du monde, Concours à 3 points, Défi 100 réussis, Lancers francs sous fatigue.
- **Dribble** : 10 exercices animés, 4 routines guidées, rebonds comptés à la caméra frontale (main droite/gauche, cadence), liens vers des tutos vidéo.
- **Ralentis** des derniers tirs, **analyse d'une vidéo** filmée avec l'appareil photo, **tir libre**.
- **24 badges** en bronze, argent et or, **conseils vocaux** après chaque série.


## 1. Mettre l'appli en ligne (GitHub Pages, gratuit, environ 10 min, depuis un ordinateur)

1. Crée un compte sur https://github.com (gratuit).
2. Clique sur **+** en haut à droite, puis **New repository**. Nom : `shotpro`. Coche **Public**. Clique sur **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file**.
4. Décompresse l'archive, puis glisse **tout son contenu** dans la page : `index.html`, `manifest.webmanifest`, `sw.js` et les dossiers `css`, `js`, `icons`. Le dossier `google-sheet` n'est pas nécessaire. Clique sur **Commit changes**.
5. Va dans **Settings**, puis **Pages**. Dans « Branch », choisis `main` et `/ (root)`, puis **Save**.
6. Patiente 1 à 2 minutes. L'adresse s'affiche en haut de la page : `https://TON-PSEUDO.github.io/shotpro/`.

## 2. Installer sur l'iPhone

1. Ouvre cette adresse dans **Safari** (pas Chrome).
2. Touche le bouton Partager, puis **Sur l'écran d'accueil**.
3. Lance ShotPro depuis l'icône. Autorise la caméra quand l'appli la demande.
   Installer l'appli sur l'écran d'accueil empêche Safari d'effacer tes séances.

## 3. Relier ton Google Sheet (facultatif, 5 min, depuis un ordinateur)

1. Ouvre ton Sheet « ShotPro – Programme de tir 4 semaines ».
2. Menu **Extensions**, puis **Apps Script**. Efface le contenu et colle tout le fichier `google-sheet/Code.gs`. Clique sur l'icône Enregistrer.
3. Clique sur **Déployer**, puis **Nouveau déploiement**. À côté de « Sélectionner le type », clique sur la roue dentée et choisis **Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
4. Clique sur **Déployer** et autorise l'accès avec ton compte Google. Google affiche un écran « Google n'a pas validé cette application » : clique sur **Paramètres avancés**, puis **Accéder à … (non sécurisé)**. C'est ton propre script, qui n'écrit que dans ce Sheet.
5. Copie l'**URL de l'application Web** (elle se termine par `/exec`).
6. Dans l'appli, ouvre **Réglages**, puis **Google Sheet** :
   - colle l'adresse ;
   - Clé : `o0iP3CLDfojTHpU2Md1Qdc6f`
   - touche **Tester la connexion**.

Chaque séance enregistrée ajoute ensuite une ligne par exercice dans le journal, ce qui met à jour le suivi de progression du Sheet. Un nouvel onglet « Tirs » reçoit le détail de chaque tir. Si tu n'as pas de réseau au gymnase, l'envoi se fait automatiquement plus tard.

Si tu avais déjà installé le script de la version 1 : remplace son code par le nouveau `Code.gs`, puis Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer. L'adresse reste la même.

## 4. Au gymnase

- Téléphone **à l'horizontale**, posé ou sur un petit trépied, à 1 m – 1,5 m du sol, **de côté** par rapport à la ligne tireur–panier, à 4 – 6 m.
- Dans l'image : le cercle d'un côté, ta zone de tir de l'autre, et **au moins 2 m au-dessus du cercle** pour voir toute la courbe. L'ultra grand-angle (0,5×) aide si tout ne rentre pas.
- Évite le contre-jour et les autres ballons dans l'image.
- Le réglage (4 étapes, 1 minute) n'est à refaire que si le téléphone bouge.
- Pendant la séance, tout est mains libres : l'appli annonce le départ, compte les tirs, enchaîne repos et séries. Si elle se trompe sur un tir, ⇄ inverse le dernier tir et ↺ le supprime.

## Dribble

Pose le téléphone au sol ou sur un banc, **face à toi**, à 2 – 3 m, écran tourné vers toi : la caméra frontale voit le ballon toucher le sol. Fais d'abord le réglage caméra du tir (étape « couleur du ballon ») : la couleur apprise sert aussi au dribble.

## Mettre à jour l'appli

Remplace les fichiers dans GitHub (même méthode qu'à l'étape 1). L'iPhone récupère la nouvelle version au lancement suivant, avec le réseau.
