# Portage VIDAA (Hisense) — onboarding codebase

> Base : `f6fe075` (Nuvio TV Smart v1.3.6). Ce document recense la couche plateforme existante et
> toutes les dépendances Tizen/webOS à traiter pour une cible VIDAA. Les points marqués \*\*[à vérifier
>
> > sur TV]\*\* sont des hypothèses sur le runtime VIDAA à confirmer sur un appareil réel.

## 1. Vue d'ensemble

- App web pure (JS ES modules + CSS), bundlée par **esbuild** en un IIFE `app.bundle.js`
  (`scripts/build.mjs`, cible `chrome56` via `scripts/compatibilityPolicy.mjs`).
- Point d'entrée : `index.html` → `boot-guard.js` → `core-js.bundle.js` → `nuvio.env.js` →
  `app.bundle.js` (source : `js/app.js`).
- Packaging par plateforme : `scripts/package-tizen.mjs` (WGT) et `scripts/package-webos.mjs` (IPK).
  Chacun **injecte `window.__NUVIO_PLATFORM__ = "tizen" | "webos"`** dans le HTML, et élague le CSS
  étranger (`scripts/pruneCssForPlatform.mjs`).
- Services natifs compagnons (Node.js tournant sur la TV) : `services/tizen/*` et `services/webos/*`.
  Ils fournissent P2P/EngineFS, PluginService, proxys de lecture, sous-titres embarqués, transcodage DTS.
- Aucune référence existante à VIDAA/Hisense dans le dépôt.

## 2. La couche plateforme (`js/platform/`, ~4 600 lignes)

| Fichier                         | Rôle                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.js`                      | **Façade `Platform`** : détection (`detectPlatformName`), table `ADAPTERS`, `isTizen/isWebOS/isBrowser`, `getWebOsMajorVersion`, `exitApp`, `normalizeKey`, `isBackEvent`, `getCapabilities`, `prepareVideoElement`.      |
| `environment.js`                | Alias mince de `Platform` (`Environment.isWebOS()` …).                                                                                                                                                                    |
| `adapters/browserAdapter.js`    | Adaptateur par défaut (fallback). **C'est ce qui tournerait aujourd'hui sur VIDAA.**                                                                                                                                      |
| `adapters/tizenAdapter.js`      | Viewport 1920×1080, `tizen.tvinputdevice.registerKey(Batch)`, exit via `tizen.application`, détection AVPlay.                                                                                                             |
| `adapters/webosAdapter.js`      | Exit via `webOSSystem.close()`, `WebOSPlayerExtensions.apply(video)`.                                                                                                                                                     |
| `sharedKeys.js`                 | Normalisation des touches télécommande (codes 461/10009/27/8 pour Back, médias 415/19/413/417/412…). Commun aux 3 adaptateurs.                                                                                            |
| `tvRuntimePerformance.js`       | Profil perf « legacy TV » basé sur l'année Tizen/webOS → classes CSS et budgets.                                                                                                                                          |
| `pluginServiceClient.js`        | Client du PluginService ; route vers `TizenPluginService` / `WebOsPluginService`, **sinon `directBrowserFetch` (fetch direct, soumis au CORS)**.                                                                          |
| `playbackProxyRedirectTrace.js` | Trace des redirections via proxy local `127.0.0.1`.                                                                                                                                                                       |
| `tizen/*`                       | `tizenCapabilities` (version, plugins ≥ 6.0), `tizenEngineFsService` (`:2710`), `tizenPluginService` (`:2711`), `tizenPlaybackProxy`, `tizenRedirectResolver`, `tizenScreenSaver`.                                        |
| `webos/*`                       | `webosLunaService` (bus Luna), `webosCompanionService`, `webosPluginService`, `webosPlaybackProxy`, `webosSupabaseProxy`, `webosAudioCapabilities`, `webosDtsAudioTranscoder`, `webosExactSeek`, `webosPlayerExtensions`. |

**Conclusion** : l'abstraction existe (pattern adaptateur) mais elle est **partielle** — l'adaptateur
ne couvre que touches/exit/label/capacités. Tout le reste est piloté par des `if (Platform.isTizen())`
/ `if (Platform.isWebOS())` disséminés.

## 3. Fuites plateforme hors de `js/platform/`

### 3.1 Branchements `isTizen()/isWebOS()/getWebOsMajorVersion()`

**94 fichiers** hors `js/platform`. Les plus denses :

- Player (cœur du sujet) : `js/core/player/playerControllerMethods-18-play.js` (12),
  `-15-set-playback-rate.js`, `-02-is-likely-direct-file-url.js`, `-16-set-web-os-embedded-subtitle-track.js`,
  `-14-get-selected-dash-audio-track-index.js`, `-08-set-av-play-display-rect.js`,
  `-12-get-playback-engine-candidates.js` (échelle de moteurs hls.js / AVPlay / natif / dash.js).
- Écran player : ~46 fichiers `js/ui/screens/player/playerScreenMethods-*` (pistes audio, sous-titres
  embarqués, stall guards, EngineFS, surface post-play…).
- Shell : `js/app.js` (10), `js/ui/navigation/focusEngine.js`, `js/ui/navigation/routerMethods-02-*`,
  `js/ui/ambient/ambientMode.js`, `js/ui/screens/home/homeScreenMethods-03-*`.
- Médias : `js/core/media/imageProxy.js`, `js/core/media/addonLogoCache.js`.
- P2P : `js/core/p2p/tizenStreamingServerResolver*`, `webosEngineFsResolver*`.
- Plugins : `js/data/local/pluginStore.js`, `js/core/profile/pluginSyncService.js`,
  `js/ui/screens/plugin/pluginsScreenMethods-01-mount.js`, `settingsScreenHelpers-04-row-icons.js`.

69 fichiers hors `js/platform` importent directement un service natif (`WebOsLunaService`,
`TizenCapabilities`, `TizenEngineFsService`, proxys…).

### 3.2 Globals natifs utilisés en direct (à encapsuler)

| Global                                   | Fichiers hors `js/platform`                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webapis.*` (dont `productinfo`, AVPlay) | `js/core/player/engines/platformAvplayEngine.js`, `js/core/auth/deviceSessionRegistration.js`, `js/ui/screens/settings/customPosterPhoneConfig.js`                               |
| `tizen.application`                      | `js/core/deeplink/launchDeepLink.js`                                                                                                                                             |
| `PalmSystem` / `webOSSystem` / `webOS.*` | `js/app.js` (callbacks onshow/onhide/relaunch), `js/core/deeplink/launchDeepLink.js`, `js/core/auth/deviceSessionRegistration.js`, `playerScreenMethods-29-*`                    |
| `luna://…`                               | `streamScreenMethods-07-*`, `streamScreenMethods-08-*` (lecteur natif LG), `playerScreenMethods-01-mount.js` (settingsservice), `playerControllerMethods-02-*` (com.webos.media) |
| AVPlay (mention `avplay`)                | 69 fichiers : `js/core/player` (22+2 engines), `js/ui/screens/player` (46), debug, diagnostics, `localMediaTracksRepository`                                                     |

### 3.3 Build / packaging / CSS / assets

- `index.html` : script inline de détection Tizen (viewport forcé).
- `appinfo.json` : manifeste webOS (id `space.nuvio.webos`, ACG Luna).
- `assets/libs/webOSTV.js` : lib LG embarquée.
- CSS : classes `.tizen-tv`, `.legacy-tizen`, `.legacy-webos`, `.legacy-webos38`,
  `.webos-unpromoted-home-tracks` — très concentrées dans `css/components-32/33/45/46/50/55/56/60.css`.
  `pruneCssForPlatform.mjs` lève une erreur pour toute plateforme inconnue → **à étendre**.
- `package.json` : scripts `package:*`, `install:webos`, `sync:*`, nombreux tests `test-tizen-*` / `test-webos-*`.
- CI : `.github/workflows/release-platform-artifacts.yml` (artefacts WGT/IPK uniquement).

## 4. Fonctionnalités dépendant d'un service natif

| Fonctionnalité                                 | Tizen                                         | webOS                                                | VIDAA (hypothèse)                                                                       |
| ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Torrent/P2P (EngineFS local)                   | `services/tizen/enginefs-service.js` (:2710)  | Luna `torrentCreate` …                               | **Indisponible** — pas de service d'arrière-plan sur une app web VIDAA **[à vérifier]** |
| PluginService (fetch hors CORS)                | `services/tizen/plugin-service.js` (:2711)    | `services/webos/plugin`                              | Fallback `directBrowserFetch` existe → **plugins limités par le CORS**                  |
| Proxy de lecture / redirections                | `tizenPlaybackProxy`, `tizenRedirectResolver` | `webosPlaybackProxy`                                 | Aucun ; lecture directe uniquement                                                      |
| Sous-titres embarqués (MKV texte/bitmap, tx3g) | `services/tizen/runtime/*`                    | Luna `bitmapSubtitle*`, `embeddedSubtitleTextWindow` | Dépendra des `textTracks` natifs ; sinon externes seulement                             |
| Transcodage audio DTS                          | —                                             | `webosDtsAudioTranscoder`                            | Aucun                                                                                   |
| Proxy Supabase / images (imgur)                | —                                             | `webosSupabaseProxy`, `imageProxy`                   | Fetch direct (CORS)                                                                     |
| Lecteur natif (AVPlay / app LG)                | AVPlay                                        | `luna://com.webos.applicationManager`                | `<video>` HTML5 + hls.js / dash.js (MSE/EME) **[à vérifier]**                           |

## 5. Ce qui fonctionne déjà « gratuitement » via `browserAdapter`

- Détection : sans globals Tizen/webOS, `detectPlatformName()` renvoie `"browser"`.
- Touches : Back accepté sur 461/10009/27/**8** (Backspace — code Back courant sur VIDAA **[à vérifier]**).
- Lecture : hls.js / dash.js / `<video>` natif (branche `!isTizenRuntime` de l'échelle de moteurs).
- Plugins : `directBrowserFetch` (CORS).
- Inconvénients : `isBrowser()` active aussi des comportements « desktop » (embed YouTube
  `metaDetailsScreenHelpers-05/06`, `homeScreenMethods-03`, `searchScreenMethods-01`,
  `localMediaTracksRepository`) et désactive les optimisations « TV legacy »
  (`tvRuntimePerformance.js`), et `exitApp()` → `window.close()`.

## 6. Plan de portage recommandé

1. **Ajouter un adaptateur `vidaa`** (`js/platform/adapters/vidaaAdapter.js`) et l'enregistrer dans
   `ADAPTERS` ; détection par `__NUVIO_PLATFORM__ = "vidaa"` puis UA (`VIDAA`/`Hisense`) **[chaîne UA
   à relever sur TV]**. Ajouter `Platform.isVidaa()`.
2. **Introduire des capacités plutôt que des noms de plateforme** : enrichir `getCapabilities()`
   (`p2p`, `pluginService`, `playbackProxy`, `embeddedSubtitles`, `legacyRuntime`, `nativeAvplay`…) et
   remplacer progressivement les `isTizen()/isWebOS()` par ces drapeaux — en commençant par
   `pluginServiceClient.js`, `pluginStore.js`, `pluginSyncService.js`, `routerMethods-02`, l'échelle
   `playerControllerMethods-12`, puis le player. Ne pas faire passer VIDAA pour `browser`.
3. **Touches** : mapping VIDAA (Back, médias, éventuellement touches couleur) dans `sharedKeys.js` /
   l'adaptateur ; `exitApp` via `window.close()` **[comportement à vérifier]**.
4. **Cycle de vie & deeplink** : encapsuler les callbacks `webOSSystem/PalmSystem` de `js/app.js` et
   `launchDeepLink.js` derrière l'adaptateur ; VIDAA → `visibilitychange` standard.
5. **Identité appareil** : `deviceSessionRegistration.js` → méthode adaptateur `getDeviceInfo()`.
6. **Désactiver proprement** P2P, sous-titres embarqués via service, DTS, proxys locaux sur VIDAA
   (masquer les écrans/réglages correspondants comme c'est déjà fait pour Tizen < 6).
7. **CORS** : prévoir un proxy distant optionnel ou accepter la perte de certaines sources/plugins.
8. **Build** : `scripts/package-vidaa.mjs` (injection `__NUVIO_PLATFORM__="vidaa"`, pas d'`appinfo.json`
   ni de `webOSTV.js`), étendre `pruneCssForPlatform.mjs` (élaguer tizen + webos), cible Chromium
   selon la plus ancienne version VIDAA visée **[à définir]**. VIDAA distribue généralement des apps
   hébergées (URL) via le portail partenaires Hisense **[à confirmer]** → prévoir un déploiement statique.
9. **Tests** : dupliquer le pattern `scripts/test-tizen-*` pour `vidaa` (détection, touches, échelle de
   moteurs) et ajouter une étape CI.

## 7. Référence : comment fait Stremio

Les apps TV Stremio (Tizen, webOS, Titan/NetTV, VIDAA) sont fermées, mais leur couche vidéo est publique :
[`Stremio/stremio-video`](https://github.com/Stremio/stremio-video) (lu au commit `7a7462b`, v0.0.105,
2026-10-28). Ce qu'on y voit :

- **Plateforme passée explicitement, pas détectée.** Le shell TV transmet `platform: 'Vidaa'` dans la
  commande `load` (`src/StremioVideo/StremioVideo.js` → `src/platform.js`). Même principe que notre
  `__NUVIO_PLATFORM__` injecté au packaging.
- **Une implémentation vidéo par plateforme**, choisie dans `src/StremioVideo/selectVideoImplementation.js`
  et composée avec des décorateurs communs (`withStreamingServer`, `withHTMLSubtitles`, `withVideoParams`).
- **`src/VidaaVideo/VidaaVideo.js` (558 lignes) est un simple `<video>` HTML5** : `video.src = stream.url`,
  sans MSE/hls.js, sans API native. Pistes audio via `videoElement.audioTracks`, sous-titres embarqués
  via `videoElement.textTracks` (avec un contournement : activer puis désactiver la première piste au
  démarrage pour que la TV publie la liste), cues repositionnés (`line = 100`). Seules les commandes
  `load` / `unload` / `destroy` sont gérées. `canPlayStream` renvoie toujours `true`.
- **Sous-titres ASS rendus sur canvas** sur toutes les TV, VIDAA comprise
  (`src/withHTMLSubtitles/usesCanvasASS.js`).
- **Torrent/P2P via un serveur de streaming distant** : quand `streamingServerURL` est fourni (Stremio
  Service sur un PC/NAS du réseau local, port 11470 par défaut), `withStreamingServer` crée le torrent
  avec `POST /{infoHash}/create`, sonde le flux (`/hlsv2/probe`) et, si la TV ne sait pas le lire,
  bascule sur le **transcodage HLS du serveur** (`/hlsv2/{id}/master.m3u8`). VIDAA est absente de la
  liste qui désactive le transcodage (`src/supportsTranscoding.js` : Tizen, webOS, Titan, NetTV) : sur
  VIDAA, Stremio compte donc sur ce transcodage pour les codecs ou conteneurs non supportés.

**Ce que ça change pour Nuvio :**

1. **Le P2P reste possible sur VIDAA** grâce à un serveur de streaming distant configurable. Nos
   résolveurs parlent déjà la même API EngineFS (`js/core/p2p/tizenStreamingServerResolver.js` fait
   `POST ${baseUrl}/${infoHash}/create`), mais `normalizeBaseUrl()` n'accepte que
   `127.0.0.1`/`localhost`. Il suffirait d'un résolveur générique acceptant une URL réseau saisie par
   l'utilisateur (avec les risques CORS et HTTP mixte à vérifier).
2. **Le moteur de lecture VIDAA peut être minimal** : `<video>` natif en premier, avec `audioTracks` et
   `textTracks`. hls.js et dash.js restent à valider sur TV (Stremio ne les utilise pas sur VIDAA).
3. **Le transcodage côté serveur compense** l'absence de DTS, MKV, etc., quand un serveur de streaming
   est configuré.
4. Ce qui manque sur la TV est déplacé ailleurs, sans service local :
   - **Debrid (TorBox, Real-Debrid…)** : le torrent est résolu chez le fournisseur et la TV ne lit qu'une
     URL HTTPS. Aucun moteur torrent sur la TV. Notre `js/core/debrid/` ne dépend d'aucune plateforme.
   - **Langues audio et sous-titres embarqués** : via `audioTracks` et `textTracks` du `<video>` natif.
   - **Sous-titres externes (addons)** : téléchargés et affichés en HTML (`withHTMLSubtitles`). Avec un
     serveur de streaming, l'ASS passe par `/subtitles.vtt` et les pistes ASS embarquées sont extraites
     par le serveur (`/hlsv2/{id}/source/subtitle/…`).
   - **Torrents purs** : `withStreamingServer` a besoin d'un `streamingServerURL` (par défaut
     `http://127.0.0.1:11470/` dans `stremio-web`). Sur VIDAA, on ne voit pas dans le code public d'où il
     vient (serveur sur le réseau local, serveur hébergé, ou résolution via debrid). **[à vérifier]**

## 8. Questions ouvertes à trancher

- Version(s) VIDAA / Chromium minimales visées ?
- Distribution : app hébergée (store Hisense) ou sideload/dev mode ?
- Support MSE/EME (hls.js, dash.js, DRM) et codecs (HEVC, AC3/EAC3, DTS) sur les modèles cibles ?
- Plugins hors CORS : acceptable de les perdre sur VIDAA ?
- P2P : ajouter un réglage « serveur de streaming distant » (modèle Stremio) ?
