# Nuvio TV — VIDAA installer

Install Nuvio TV on a **Hisense / VIDAA** TV (Hisense, Toshiba, Sharp and other
VIDAA-OS sets) from a Windows, macOS or Linux computer.

VIDAA has no public sideload tool — the official developer portal is partner-only
(contract + annual fee). The one documented way to add a custom app is the
`vidaahub.com` install hook that the TV's own browser exposes. This installer
uses that hook, exactly like the community Stremio/Jellyfin installers do.

## How it works

1. The installer runs a tiny **DNS server** and **HTTPS server** on your computer.
2. You point the TV's DNS at your computer. The DNS server answers
   `vidaahub.com` with your computer's IP (every other name is forwarded to a
   real resolver, so the rest of the TV keeps working).
3. On the TV you open `https://vidaahub.com/`. Your computer serves a one-button
   page. VIDAA only exposes `Hisense_installApp()` to that origin — that is why
   we impersonate the hostname.
4. Pressing **Install** calls `Hisense_installApp()`, which registers _Nuvio TV_
   in the TV launcher as a web app pointing at the hosted build on
   **GitHub Pages** (`https://theodoreriant.github.io/NuvioVidaa/`).
5. You set the TV's DNS back to automatic. Nuvio TV now launches straight from
   the home screen and loads the latest released web build — your computer does
   **not** need to stay on.

Nothing is installed on your computer and no network setting is changed
permanently. The self-signed certificate is generated fresh each run and never
leaves your machine.

## Requirements

- **Node.js 18+** on the computer.
- The computer and the TV on the **same network**.
- Ability to run the command with administrator / root rights (ports 53, 80 and
  443 are privileged).

## Run it

From the repository root:

```bash
# macOS / Linux
sudo node installer/vidaa/install.mjs

# Windows (run the terminal as Administrator)
node installer/vidaa/install.mjs
```

The installer prints your computer's IP and step-by-step TV instructions. Leave
the window open until the install finishes, then press `Ctrl+C`.

### Options

| Flag                 | Default                        | Purpose                                                   |
| -------------------- | ------------------------------ | --------------------------------------------------------- |
| `--ip <addr>`        | auto-detected                  | Force the LAN IP to advertise.                            |
| `--app-url <url>`    | GitHub Pages URL               | Serve a different hosted build (e.g. a self-hosted copy). |
| `--upstream <dns>`   | `1.1.1.1`                      | Upstream resolver for all other names.                    |
| `--owner` / `--repo` | `TheodoreRiant` / `NuvioVidaa` | Build the default Pages URL.                              |

## On the TV

1. **Settings → Network → (your connection) → IP / DNS settings → Manual**, set
   the **DNS** to the IP the installer printed. Leave the other values as they
   were.
2. Open the TV **Browser** and go to `https://vidaahub.com/`. Accept the
   one-time certificate warning.
3. Press **Install Nuvio TV**. Wait for the success message.
4. Set the TV's DNS back to **Automatic** and restart the TV.
5. Launch **Nuvio TV** from the home screen.

Use the **Uninstall** button on the same page to remove it later.

## Troubleshooting

- **`Hisense_installApp is not defined` / "no TV detected"** — the page was not
  loaded on the TV, DNS is not pointing at your computer yet, or your firmware
  removed the hook. Re-check the DNS step; try `https://vidaahub.com/` again.
- **Permission denied on ports** — run with `sudo` (macOS/Linux) or an
  Administrator terminal (Windows).
- **Port already in use** — another DNS or web server is running (e.g. Pi-hole
  on the same box). Stop it for the duration of the install.
- **App opens but looks zoomed / 720p** — a known VIDAA browser quirk on some
  models; it does not affect the install itself.

## Credits

The `vidaahub.com` install technique was documented by the community
(bananamafia.dev HisenseHax research, and the Stremio and vidaa-edge installers).
This tool is not affiliated with or endorsed by VIDAA or Hisense.
