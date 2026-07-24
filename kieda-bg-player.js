/*!
 * KIEDA BG PLAYER — lecteur vidéo de fond indépendant
 * ------------------------------------------------------
 * Kifeh testa3mlou (usage):
 *
 * 1) Hott hedha el fichier "kieda-bg-player.js" fi nefs el dossier ta3 index.html
 * 2) Zid el ligne hedhi fi <head> ou 9bal </body> ta3 index.html:
 *
 *      <script src="kieda-bg-player.js"
 *              data-src="assets/bg1.mp4,assets/bg2.mp4"
 *              data-opacity="0.35"
 *              data-overlay="rgba(0,0,0,0.4)"
 *              data-fit="cover"
 *              data-random="false"
 *              defer></script>
 *
 * 3) Rani — video(s) yet3awdou fi loop fi background, warra kol content.
 *    Ma tmess hata fichier akhor. Zero backend. Zero dépendance.
 *
 * ------------------------------------------------------
 * ZÉRO CONFIG (recommandé — ton cas: GitHub Pages, karim-sidhom/*) —
 * jette tes vidéos dans un dossier "assets", POINT FINAL. Rien à écrire,
 * rien à renommer, rien à retoucher dans index.html, JAMAIS:
 *
 *      <script src="kieda-bg-player.js" defer></script>
 *
 *   -> C'est tout. Le script devine tout seul ton repo depuis l'URL
 *      de la page (username.github.io/nom-du-repo), et va chercher
 *      en live tout ce qu'il y a dans le dossier "assets" du repo.
 *   Ajoute/supprime des vidéos dans "assets", push, et c'est reflété
 *   automatiquement — aucun fichier à ouvrir, jamais.
 *
 *   Si ton dossier vidéo s'appelle autrement que "assets", ou si t'es
 *   sur un domaine perso (kieda.online) et pas *.github.io, précise:
 *
 *      <script src="kieda-bg-player.js"
 *              data-repo="karim-sidhom/nom-du-repo"
 *              data-path="mon-dossier"
 *              defer></script>
 *
 * ------------------------------------------------------
 * MODE MANUEL (si pas de repo GitHub, ou peu de vidéos fixes):
 *
 *      <script src="kieda-bg-player.js"
 *              data-src="assets/bg1.mp4,assets/bg2.mp4"
 *              defer></script>
 *
 * ------------------------------------------------------
 *
 * Options (kolha optionnelles, data-* fi script tag):
 *   (rien n'est obligatoire — sans aucun attribut, mode zéro-config actif
 *    automatiquement si hébergé sur *.github.io)
 *   data-repo     : "user/repo" — force le repo (sinon deviné depuis l'URL)
 *   data-path     : dossier à surveiller dans le repo (default "assets")
 *   data-exclude  : noms de fichiers à ignorer, séparés par "," — pratique si ton
 *                   dossier "assets" contient aussi des vidéos utilisées ailleurs
 *                   par ton app (splash screen, animations...) que tu ne veux
 *                   PAS dans la boucle de fond.
 *                   Ex: data-exclude="splash.mp4,ghost.mp4,trainTap.mp4"
 *   data-branch   : branche à lire (default "main")
 *   data-src      : chemin/s ta3 el video(s), separés b "," (playlist) — mode manuel
 *   data-pattern  : modèle de nom avec {n} ou {n:3} — mode manuel, utilisé avec data-range
 *   data-range    : ex "1-100" — plage de numéros à générer avec data-pattern
 *   data-opacity  : 0 -> 1 (default 0.4)
 *   data-overlay  : couleur overlay fou9 el video bech el content ye9ra (default rgba(0,0,0,0.35))
 *   data-fit      : "cover" ou "contain" (default cover)
 *   data-random   : "true" bech el playlist tetla3ab random (default false = séquentiel)
 *   data-mute     : "true"/"false" (default true — lezmha true bech autoplay yakhdem)
 *   data-respect-motion : "true" bech tewa9ef el video ki el user 3andou prefers-reduced-motion (default true)
 *   data-z        : z-index (default -1, ye9ra warra kol chay)
 *
 * API publique (JS): window.KiedaBgPlayer
 *   .play() / .pause() / .next() / .setOpacity(n) / .destroy()
 */
(function () {
  "use strict";

  var CUR_SCRIPT =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();

  function attr(name, fallback) {
    var v = CUR_SCRIPT.getAttribute(name);
    return v === null || v === undefined ? fallback : v;
  }
  function boolAttr(name, fallback) {
    var v = CUR_SCRIPT.getAttribute(name);
    if (v === null) return fallback;
    return v.toLowerCase() === "true";
  }

  var config = {
    src: attr("data-src", "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean),
    opacity: parseFloat(attr("data-opacity", "0.4")),
    overlay: attr("data-overlay", "rgba(0,0,0,0.35)"),
    fit: attr("data-fit", "cover"),
    random: boolAttr("data-random", false),
    mute: boolAttr("data-mute", true),
    respectMotion: boolAttr("data-respect-motion", true),
    z: attr("data-z", "-1"),
    pattern: attr("data-pattern", ""),
    range: attr("data-range", ""),
    repo: attr("data-repo", ""),
    path: attr("data-path", "assets"),
    branch: attr("data-branch", "main"),
    exclude: attr("data-exclude", "")
      .split(",")
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean),
  };

  // ---- ZÉRO CONFIG: devine owner/repo depuis l'URL si hébergé sur github.io ----
  // https://username.github.io/nom-du-repo/... -> repo = "username/nom-du-repo"
  // Si data-repo est donné explicitement, il garde toujours la priorité.
  if (!config.repo && /\.github\.io$/i.test(location.hostname)) {
    var owner = location.hostname.replace(/\.github\.io$/i, "");
    var firstSegment = location.pathname.split("/").filter(Boolean)[0];
    if (firstSegment) {
      config.repo = owner + "/" + firstSegment;
    }
    // si pas de firstSegment, c'est un repo "username.github.io" (site utilisateur) —
    // dans ce cas repo = "username/username.github.io", rare, on laisse data-repo au besoin
  }

  var VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
  var CACHE_KEY = "kieda-bg-player-cache:" + config.repo + ":" + config.path;
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — évite de spammer l'API GitHub à chaque page

  // ---- mode automatique: liste le dossier via l'API GitHub ----
  function fetchFromGitHub() {
    try {
      var cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (Date.now() - parsed.t < CACHE_TTL_MS) {
          return Promise.resolve(parsed.list);
        }
      }
    } catch (e) {
      /* sessionStorage indisponible, tant pis, on refait l'appel */
    }

    var url =
      "https://api.github.com/repos/" +
      config.repo +
      "/contents/" +
      config.path +
      "?ref=" +
      config.branch;

    return fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) {
          throw new Error(
            "GitHub API a répondu " +
              res.status +
              " — vérifie data-repo=\"" +
              config.repo +
              "\" et data-path=\"" +
              config.path +
              "\" (repo doit être public)."
          );
        }
        return res.json();
      })
      .then(function (files) {
        var list = files
          .filter(function (f) {
            return (
              f.type === "file" &&
              VIDEO_EXT.test(f.name) &&
              config.exclude.indexOf(f.name.toLowerCase()) === -1
            );
          })
          .map(function (f) {
            return config.path + "/" + f.name;
          });

        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ t: Date.now(), list: list })
          );
        } catch (e) {
          /* pas grave si le cache échoue */
        }

        return list;
      });
  }

  // ---- génération de playlist mode manuel (pattern + range) ----
  if (config.pattern && config.range) {
    var rangeParts = config.range.split("-").map(function (n) {
      return parseInt(n.trim(), 10);
    });
    var start = rangeParts[0];
    var end = rangeParts.length > 1 ? rangeParts[1] : start;
    var padMatch = config.pattern.match(/\{n:(\d+)\}/);
    var pad = padMatch ? parseInt(padMatch[1], 10) : 0;

    for (var i = start; i <= end; i++) {
      var numStr = pad ? String(i).padStart(pad, "0") : String(i);
      var generated = config.pattern
        .replace(/\{n:\d+\}/, numStr)
        .replace(/\{n\}/, numStr);
      config.src.push(generated);
    }
  }

  // ---- résolution de la playlist puis démarrage ----
  if (config.repo) {
    fetchFromGitHub()
      .then(function (list) {
        if (!list.length) {
          console.warn(
            "[KiedaBgPlayer] aucune vidéo trouvée dans " +
              config.repo +
              "/" +
              config.path +
              " — vérifie que le dossier contient bien des .mp4/.webm/.mov."
          );
          return;
        }
        start_player(list);
      })
      .catch(function (err) {
        console.error("[KiedaBgPlayer]", err.message || err);
      });
  } else if (config.src.length) {
    start_player(config.src);
  } else {
    console.warn(
      "[KiedaBgPlayer] configuration manquante — utilise data-repo (mode auto) ou data-src/data-pattern (mode manuel)."
    );
  }

  function start_player(resolvedPlaylist) {
  var reducedMotion =
    config.respectMotion &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- construction DOM ----
  var wrap = document.createElement("div");
  wrap.id = "kieda-bg-player";
  wrap.style.cssText = [
    "position:fixed",
    "inset:0",
    "width:100%",
    "height:100%",
    "overflow:hidden",
    "z-index:" + config.z,
    "pointer-events:none",
  ].join(";");

  var overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:absolute",
    "inset:0",
    "background:" + config.overlay,
  ].join(";");

  var video = document.createElement("video");
  video.muted = config.mute;
  video.defaultMuted = config.mute;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  video.style.cssText = [
    "position:absolute",
    "top:50%",
    "left:50%",
    "min-width:100%",
    "min-height:100%",
    "width:auto",
    "height:auto",
    "transform:translate(-50%,-50%)",
    "object-fit:" + config.fit,
    "opacity:" + config.opacity,
  ].join(";");

  wrap.appendChild(video);
  wrap.appendChild(overlay);

  function mountWhenReady() {
    document.body.appendChild(wrap);
  }
  if (document.body) mountWhenReady();
  else document.addEventListener("DOMContentLoaded", mountWhenReady);

  // ---- playlist logic ----
  var playlist = resolvedPlaylist.slice();
  var order = playlist.map(function (_, i) {
    return i;
  });
  if (config.random) {
    order.sort(function () {
      return Math.random() - 0.5;
    });
  }
  var pos = 0;

  function loadIndex(i) {
    video.src = playlist[order[i % order.length]];
    video.load();
    if (!reducedMotion) {
      video.play().catch(function () {
        /* autoplay bloqué — ye7taj interaction, silence normal */
      });
    }
  }

  function next() {
    pos = (pos + 1) % order.length;
    loadIndex(pos);
  }

  video.addEventListener("ended", function () {
    if (playlist.length > 1) next();
    else {
      video.currentTime = 0;
      video.play().catch(function () {});
    }
  });

  loadIndex(pos);

  if (reducedMotion) {
    video.pause();
  }

  // ---- API publique ----
  window.KiedaBgPlayer = {
    play: function () {
      video.play().catch(function () {});
    },
    pause: function () {
      video.pause();
    },
    next: next,
    setOpacity: function (n) {
      video.style.opacity = n;
    },
    destroy: function () {
      video.pause();
      wrap.remove();
      delete window.KiedaBgPlayer;
    },
  };
  } // fin start_player
})();
