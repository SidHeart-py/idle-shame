# Idle Shame 🕒

A GNOME Shell extension that shows a fullscreen black overlay with a running timer whenever your system has been idle for 90 seconds. As soon as you touch the mouse or keyboard, the overlay disappears instantly.

Built as a pure GNOME Shell extension in GJS (JavaScript) — no Python, no systemd timers, no daemons.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-46%20%E2%80%93%2050-4A86CF?logo=gnome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Language](https://img.shields.io/badge/language-GJS%20%2F%20JavaScript-f7df1e?logo=javascript&logoColor=black)

---

## What it does

- Detects when the system has been idle for **90 seconds**
- Shows a **fullscreen black overlay** on the **primary monitor only**
- Displays a **MM:SS timer** in the center that counts up from `00:00`
- **Disappears instantly** the moment mouse or keyboard activity is detected
- **Respects idle inhibitors** — if YouTube, VLC, Caffine or any other app has told GNOME "I'm active, don't go idle", the overlay will not appear

---

## Screenshots

> _Overlay appears after 90 seconds of inactivity. Timer counts up. Any input dismisses it immediately._

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                                         │
│               04:23                     │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

---

## Requirements

- GNOME Shell 46, 47, 48, 49, or 50
- Ubuntu 24.04+ / Fedora 40+ or any distro running GNOME on Wayland or X11
- No external dependencies — uses only GNOME Shell's built-in GJS APIs

---

## Installation

### Manual (recommended for development)

```bash
# Clone the repository
git clone https://github.com/SidHeart-py/idle-shame.git

# Copy to the GNOME extensions directory
cp -r idle-shame \
  ~/.local/share/gnome-shell/extensions/idle-shame@siddharth

# Enable the extension
gnome-extensions enable idle-shame@siddharth
```

Then **log out and log back in**, or reload GNOME Shell (X11 only: `Alt+F2` → type `r` → Enter).

### Verify it loaded

```bash
gnome-extensions info idle-shame@siddharth
```

You should see `State: ACTIVE`.

---

## File structure

```
idle-shame@siddharth/
├── extension.js     # All extension logic
├── metadata.json    # Extension manifest
├── README.md        # This file
└── LICENSE          # MIT license
```

---

## How it works

### Idle detection

GNOME Shell exposes an idle monitor through `global.backend.get_core_idle_monitor()`. This returns the number of milliseconds since the last input event. The extension polls this every 5 seconds:

```
Every 5 seconds:
  └─ idle time ≥ 90,000 ms?
        ├─ No  → do nothing
        └─ Yes → check inhibitors → show overlay
```

### Activity detection (dismissal)

Rather than continuing to poll after the overlay appears, the extension registers a **one-shot user-active watch** via `IdleMonitor.add_user_active_watch()`. This fires on the GNOME main loop the instant any input event is detected — mouse movement, keypress, touch — and immediately destroys the overlay. No polling delay.

### Idle inhibitor detection

Apps like browsers playing video (YouTube, Netflix) and media players (VLC, mpv) or extention like Caffine register an **idle inhibitor** with GNOME Session Manager when they want to prevent idle behavior. The extension checks for this before showing the overlay:

```
org.gnome.SessionManager.GetInhibitors()
  └─ for each inhibitor:
       └─ GetFlags() & 8 (INHIBIT_IDLE)?
             ├─ Yes → skip, don't show overlay
             └─ No  → continue
```

The inhibitor flags are a bitmask:

| Flag | Value | Meaning |
|------|-------|---------|
| `INHIBIT_LOGOUT` | 1 | Prevent logout |
| `INHIBIT_SWITCH_USER` | 2 | Prevent user switching |
| `INHIBIT_SUSPEND` | 4 | Prevent suspend |
| `INHIBIT_IDLE` | **8** | **Prevent idle** ← what we check |
| `INHIBIT_AUTOMOUNT` | 16 | Prevent automount |

### Primary monitor only

The overlay is sized and positioned using `Main.layoutManager.primaryMonitor` which gives the exact `x`, `y`, `width`, `height` of the primary display. This prevents the overlay from spanning across multiple monitors or splitting across screen boundaries.

---

## Configuration

Currently the idle threshold is set as a constant at the top of `extension.js`:

```javascript
const IDLE_LIMIT = 90 * 1000;  // 90 seconds in milliseconds
```

Change this value and reload the extension to adjust the timeout. A settings UI with `GSettings` is planned for a future release.

---

## Development

### Reload the extension without logging out

```bash
dbus-send --session --type=method_call \
  --dest=org.gnome.Shell /org/gnome/Shell \
  org.gnome.Shell.Eval \
  string:'global.reloadExtension("idle-shame@siddharth")'
```
or

>**Logout and Login** if above one does not work



### Watch live logs

```bash
journalctl /usr/bin/gnome-shell -f | grep -iE "idle|shame|JS ERROR"
```
### Inspect active inhibitors

```bash
# List current inhibitors
gdbus call --session \
  --dest org.gnome.SessionManager \
  --object-path /org/gnome/SessionManager \
  --method org.gnome.SessionManager.GetInhibitors

# Check a specific inhibitor's app, reason, and flags
gdbus call --session \
  --dest org.gnome.SessionManager \
  --object-path /org/gnome/SessionManager/Inhibitor3 \
  --method org.gnome.SessionManager.Inhibitor.GetAppId

gdbus call --session \
  --dest org.gnome.SessionManager \
  --object-path /org/gnome/SessionManager/Inhibitor3 \
  --method org.gnome.SessionManager.Inhibitor.GetFlags

gdbus call --session \
  --dest org.gnome.SessionManager \
  --object-path /org/gnome/SessionManager/Inhibitor3 \
  --method org.gnome.SessionManager.Inhibitor.GetReason
```

---

## Known limitations

- **Idle threshold is hardcoded** — no settings UI yet. Edit `IDLE_LIMIT` in
  `extension.js` directly.
- **Primary monitor only** — by design. The overlay does not appear on
  secondary monitors.
- **5-second polling granularity** — the overlay appears within 5 seconds of
  the idle threshold being crossed, not exactly at 90 seconds. The dismissal
  on activity is instant.
- **Lock screen** — the extension does not show the overlay when the session
  is locked (`Main.sessionMode.isLocked`). The GNOME lock screen handles that
  state.
- **Screen blank and suspend** — GNOME may still blank the screen or suspend
  the system underneath the overlay using its own power settings, which will
  dismiss the overlay prematurely. Until this is handled natively in a future
  version, set the following as a workaround:
  - **Screen blank:** go to Settings → Power → Screen Blank and set it to
    **15 minutes** (or longer than your expected idle session)
  - **Suspend:** go to Settings → Power → Automatic Suspend and set it to
    **25 minutes** (or longer than your expected idle session)

  > We will be tackling screen blank and suspend inhibition natively in a
  > future version so no manual workaround is needed.
---

## Planned features

- [ ] `GSettings` preferences UI for configuring idle timeout
- [ ] Option to show overlay on all monitors
- [ ] Configurable overlay color and font size
- [ ] Wayland idle protocol support via `ext-idle-notify-v1` as a fallback
- [ ] No Blank screen and suspention override.

---

## Why this exists

The GNOME screensaver and power settings blank the screen after inactivity, but give no indication of *how long* you've been idle when you return. This extension makes idle time visible — useful for tracking focus, noticing when you've been distracted, or just as a nudge to get back to work.

---

## License

MIT — see [LICENSE](https://github.com/SidHeart-py/idle-shame?tab=MIT-1-ov-file) for details.
