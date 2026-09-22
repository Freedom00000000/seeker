# Geolocation Phishing — Defensive Research Notes

These notes document *how* browser-based geolocation phishing (the class of
attack Seeker demonstrates) works, how defenders can **detect** it, and how
users, browsers and platforms can **mitigate** it. The goal is education and
defense: understanding the mechanism well enough to spot it, teach against it,
and build detections — not to make the attack more effective or more
convincing.

> Seeker is intended for authorized security testing and awareness training,
> against people who have consented (e.g. your own devices, lab targets, or a
> scoped engagement). Using it to track people without their knowledge or
> consent is illegal in most jurisdictions and is out of scope for this
> project.

---

## 1. Mechanism

The attack does not exploit a software vulnerability. It abuses two
legitimate, permission-gated browser APIs by wrapping them in a socially
convincing page:

| API | What it exposes | Gate |
| --- | --- | --- |
| `navigator.geolocation.getCurrentPosition()` | GPS-grade latitude/longitude, accuracy, altitude, heading, speed | An explicit user permission prompt |
| `navigator.*` device fields (`platform`, `hardwareConcurrency`, `deviceMemory`, `userAgent`), WebGL `RENDERER`/`VENDOR`, screen size | OS, CPU/RAM class, GPU, resolution, browser | No prompt (fingerprinting surface) |

The flow is:

1. The victim is lured to a page hosted by the attacker (link sent over chat,
   email, SMS, a shortened URL, etc.).
2. The page presents a pretext that makes a location request look normal — a
   "nearby" feature, a video call, a shared file, a delivery tracker.
3. JavaScript calls `getCurrentPosition()`. The browser shows its **native
   permission prompt**.
4. If the victim taps *Allow*, the coordinates are POSTed back to the
   attacker's server, which also records the requesting IP (and reverse-geo /
   ISP lookups on it).

The two decisive facts for defenders:

- **The browser prompt is the only real gate.** No page styling changes what
  the prompt says; the OS/browser controls that text and the permission model.
- **HTTPS is required.** Modern browsers only expose `getGeolocation` in a
  *secure context*. This is itself a useful constraint (see mitigations).

---

## 2. Detection (blue-team indicators)

### Network / server-side indicators
- Outbound `POST` requests carrying JSON with `lat`/`lon`/`acc`/`alt`/`spd`
  fields to a domain unrelated to the page the user thought they were on.
- Pages that request geolocation immediately on load, before any user action.
- Newly registered or look-alike domains fronting a "nearby / live / meeting"
  pretext, often behind a tunneling service (ngrok, Cloudflare Tunnel,
  localtunnel) — check for tunneling-provider hostnames and rotating subdomains.
- Certificate transparency logs: short-lived certs on look-alike domains.

### Host / browser indicators
- A site holding a **granted geolocation permission** that the user does not
  recognize. Auditable at:
  - Chrome: `chrome://settings/content/location`
  - Firefox: `about:preferences#privacy` → Permissions → Location
  - Safari/iOS & Android: per-site settings in the browser, plus OS-level
    location access per app.
- Browser telemetry / EDR: a browser process making geolocation platform
  calls shortly after navigating to an untrusted domain.

### Content indicators (for URL/HTML scanners)
- Presence of `navigator.geolocation.getCurrentPosition` combined with a
  `fetch`/`XMLHttpRequest` POST of the resulting coordinates to a
  different-origin endpoint.
- WebGL renderer/vendor probing (`getExtension('WEBGL_debug_renderer_info')`)
  bundled with a location request — a common fingerprint-plus-locate pattern.

---

## 3. Mitigations

### For users / awareness training
- Treat an unexpected **location prompt** exactly like a password prompt:
  ask *why does this page need it, and did I initiate an action that
  justifies it?* Deny by default.
- A legitimate "find nearby" feature still works if you deny and type your
  city; a tracker does not.
- Periodically review and revoke site location permissions (paths above).
- Prefer **"Allow once"** over "Allow while using" for anything you are not
  sure about.

### For browsers / platforms
- Keep geolocation behind an explicit, per-request prompt in a secure context
  (already standard) and prefer *ephemeral* grants.
- Coarse-location modes (approximate location) reduce the value of a
  successful capture.
- Warn on look-alike / punycode domains and on permission requests from
  freshly-visited origins.

### For defenders operating a network
- Block or alert on known tunneling-provider hostnames in outbound proxy logs
  where policy allows.
- Feed the content indicators above into URL sandboxes / phishing scanners.
- Include location-prompt social engineering in phishing simulations and
  security-awareness curricula.

---

## 4. Using Seeker responsibly in research

- Run it only against devices/accounts you own or are explicitly authorized to
  test, within a written scope.
- Keep captured data local. This repo's admin/debug page is deliberately
  bound to `127.0.0.1` and can require a token (`--admin-token`); if you need
  to view it from another machine, use an SSH tunnel rather than exposing it:

  ```
  ssh -L 8081:127.0.0.1:8081 user@your-server
  # then open http://127.0.0.1:8081/ locally
  ```

- Delete captured logs (`logs/`, `db/results.csv`) when the engagement ends.
- Document consent and scope; never point the tool at non-consenting people.
