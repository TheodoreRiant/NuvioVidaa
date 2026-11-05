// The HTML served to the TV at https://vidaahub.com/. On VIDAA, Hisense exposes
// Hisense_installApp()/Hisense_uninstallApp() only to that origin; this page
// registers Nuvio TV as a launcher entry pointing at the hosted web build.

export function renderInstallerPage({ appId, appName, appUrl, iconUrl }) {
  // Escape "<" and line separators so the JSON blob cannot break out of the
  // <script> element or trip legacy JS parsers.
  const sep = String.fromCharCode(0x2028, 0x2029);
  const data = JSON.stringify({ appId, appName, appUrl, iconUrl })
    .replace(/</g, "\\u003c")
    .replace(new RegExp("[" + sep + "]", "g"), (char) => "\\u" + char.charCodeAt(0).toString(16));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>${escapeHtml(appName)} Installer</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0e0f12; color: #f5f5f5;
    font-family: "Segoe UI", Roboto, system-ui, sans-serif; }
  .wrap { min-height: 100%; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; padding: 48px; }
  img.logo { width: 220px; height: auto; margin-bottom: 24px; }
  h1 { font-size: 40px; margin: 0 0 8px; font-weight: 600; }
  p.sub { font-size: 22px; color: #a8adb8; margin: 0 0 40px; }
  .row { display: flex; gap: 20px; }
  button { font-size: 26px; font-weight: 600; padding: 18px 44px; border-radius: 12px;
    border: 2px solid transparent; cursor: pointer; background: #2563eb; color: #fff; }
  button.secondary { background: transparent; border-color: #3a3f4b; color: #d6d9e0; }
  button:focus { outline: none; border-color: #fff; transform: scale(1.04); }
  #msg { margin-top: 36px; font-size: 24px; min-height: 30px; }
  #msg.ok { color: #4ade80; }
  #msg.err { color: #f87171; }
  .url { font-size: 16px; color: #6b7280; margin-top: 12px; word-break: break-all; }
</style>
</head>
<body>
<div class="wrap">
  <img class="logo" src="${escapeHtml(iconUrl)}" alt="${escapeHtml(appName)}"
    onerror="this.style.display='none'" />
  <h1>${escapeHtml(appName)}</h1>
  <p class="sub">Install ${escapeHtml(appName)} on this VIDAA TV</p>
  <div class="row">
    <button id="install" autofocus>Install ${escapeHtml(appName)}</button>
    <button id="uninstall" class="secondary">Uninstall</button>
  </div>
  <div id="msg"></div>
  <div class="url">${escapeHtml(appUrl)}</div>
</div>
<script>
(function () {
  var APP = ${data};
  var msg = document.getElementById("msg");
  function say(text, kind) { msg.textContent = text; msg.className = kind || ""; }

  if (typeof Hisense_installApp !== "function" &&
      typeof Hisense_GetCountryCode !== "function") {
    say("Open this page on the VIDAA TV browser - no TV detected here.", "err");
  }

  document.getElementById("install").addEventListener("click", function () {
    say("Installing...");
    try {
      Hisense_installApp(
        APP.appId, APP.appName, APP.iconUrl, APP.iconUrl, APP.iconUrl,
        APP.appUrl, "store",
        function (status) {
          if (status) { say("Install failed (code " + status + ").", "err"); }
          else {
            say(APP.appName + " installed. Find it on your home screen.", "ok");
            try { refreshAppsOnHisenseUI(APP.appId); } catch (e) {}
          }
        }
      );
    } catch (e) {
      say("Install failed: " + (e && e.message ? e.message : e), "err");
    }
  });

  document.getElementById("uninstall").addEventListener("click", function () {
    say("Uninstalling...");
    try {
      Hisense_uninstallApp(APP.appId, function (status) {
        if (!status) { say("Uninstall failed (code " + status + ").", "err"); }
        else {
          say(APP.appName + " uninstalled.", "ok");
          try { refreshAppsOnHisenseUI(); } catch (e) {}
        }
      });
    } catch (e) {
      say("Uninstall failed: " + (e && e.message ? e.message : e), "err");
    }
  });

  // Nudge the launcher to redraw after an install/uninstall.
  function refreshAppsOnHisenseUI(appId) {
    var info = appId ? [{ appId: appId }] : [];
    var platform = window.omi_platform || window.opera_omi;
    if (!platform || typeof platform.sendPlatformMessage !== "function") return;
    platform.sendPlatformMessage(JSON.stringify({
      type: "APPMessage", MsgType: "appControl", action: "updateAppState",
      source: "browser", startAppType: 0x2,
      param: { event: "AllAppsUpdate", SubModuleName: "AllApps", startFrom: "", appInfo: info }
    }));
  }
})();
</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}
