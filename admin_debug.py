#!/usr/bin/env python3
"""
Local admin / debug status page for Seeker.

This starts a small, read-only HTTP server that is bound STRICTLY to the
loopback interface (127.0.0.1). It is meant only for the operator running
Seeker on their own machine to inspect server status and the full log files
(php.log, results.csv, info.txt, result.txt).

Security notes:
  * The listener is bound to 127.0.0.1 only, never 0.0.0.0, so it is not
    reachable from the network the phishing/PHP server is exposed on.
  * A second, explicit loopback check rejects any request whose peer is not a
    loopback address (defense in depth).
  * It is read-only: no endpoint modifies state.
  * It is opt-in via the --admin flag / ADMIN_DEBUG env var.
"""

import hmac
import html
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
from os import path
from urllib.parse import parse_qs, urlparse


def _read_file(fpath):
    try:
        with open(fpath, 'r', errors='replace') as fh:
            return fh.read()
    except FileNotFoundError:
        return '(file not found)'
    except OSError as exc:
        return f'(error reading file: {exc})'


def _build_handler(config, log_files, status_fn, token=None):
    class AdminDebugHandler(BaseHTTPRequestHandler):
        # silence default stderr request logging
        def log_message(self, fmt, *fargs):
            return

        def _is_loopback(self):
            try:
                return ip_address(self.client_address[0]).is_loopback
            except ValueError:
                return False

        def _token_ok(self):
            # No token configured -> auth disabled (loopback guard still applies).
            if not token:
                return True
            provided = self.headers.get('X-Admin-Token', '')
            if not provided:
                qs = parse_qs(urlparse(self.path).query)
                provided = qs.get('token', [''])[0]
            # constant-time compare to avoid leaking the token via timing
            return hmac.compare_digest(str(provided), str(token))

        def _send(self, code, body, content_type='text/html; charset=utf-8'):
            encoded = body.encode('utf-8', errors='replace')
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(encoded)))
            # never let a browser cache captured data
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self):
            if not self._is_loopback():
                self._send(403, 'Forbidden: admin debug page is localhost only.',
                           'text/plain; charset=utf-8')
                return

            if not self._token_ok():
                self._send(401, 'Unauthorized: valid admin token required.',
                           'text/plain; charset=utf-8')
                return

            route = self.path.split('?', 1)[0].rstrip('/')

            if route in ('', '/'):
                self._send(200, self._dashboard())
                return

            if route.startswith('/logs/'):
                key = route[len('/logs/'):]
                if key in log_files:
                    self._send(200, _read_file(log_files[key]),
                               'text/plain; charset=utf-8')
                    return

            self._send(404, 'Not found.', 'text/plain; charset=utf-8')

        def _dashboard(self):
            status = {}
            try:
                status = status_fn() or {}
            except Exception as exc:  # never let the page crash the tool
                status = {'error': str(exc)}

            php_running = status.get('php_running')
            if php_running is True:
                php_state = '<span class="ok">RUNNING</span>'
            elif php_running is False:
                php_state = '<span class="bad">STOPPED</span>'
            else:
                php_state = '<span class="warn">UNKNOWN</span>'

            rows = [
                ('Seeker version', config.get('version', '-')),
                ('PHP server', php_state),
                ('PHP PID', status.get('pid', '-')),
                ('PHP port', config.get('php_port', '-')),
                ('Template', config.get('template', '-')),
            ]
            info_html = '\n'.join(
                f'<tr><th>{html.escape(str(k))}</th>'
                f'<td>{v if k == "PHP server" else html.escape(str(v))}</td></tr>'
                for k, v in rows
            )

            log_sections = []
            for key, fpath in log_files.items():
                content = _read_file(fpath)
                size = 0
                try:
                    if path.isfile(fpath):
                        size = path.getsize(fpath)
                except OSError:
                    pass
                log_sections.append(
                    f'<section><h2>{html.escape(key)} '
                    f'<small>{html.escape(fpath)} &middot; {size} bytes</small></h2>'
                    f'<pre>{html.escape(content) or "(empty)"}</pre></section>'
                )

            return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Seeker &middot; Admin Debug</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background:#0e0e12; color:#d6d6dd; margin:0; padding:24px; }}
  h1 {{ font-size:20px; margin:0 0 4px; }}
  .sub {{ color:#8a8a99; margin:0 0 20px; font-size:12px; }}
  table {{ border-collapse:collapse; margin-bottom:24px; }}
  th, td {{ text-align:left; padding:4px 16px 4px 0; font-size:13px;
            border-bottom:1px solid #23232b; }}
  th {{ color:#8a8a99; font-weight:normal; }}
  .ok {{ color:#4ade80; }} .bad {{ color:#f87171; }} .warn {{ color:#facc15; }}
  section {{ margin-bottom:20px; }}
  h2 {{ font-size:14px; margin:0 0 6px; }}
  h2 small {{ color:#8a8a99; font-weight:normal; font-size:11px; }}
  pre {{ background:#16161c; border:1px solid #23232b; border-radius:6px;
         padding:12px; overflow:auto; max-height:340px; font-size:12px;
         white-space:pre-wrap; word-break:break-word; }}
</style>
</head>
<body>
  <h1>Seeker &middot; Admin Debug</h1>
  <p class="sub">Localhost-only status page &middot; read-only &middot; auto-refresh 5s</p>
  <table>{info_html}</table>
  {''.join(log_sections)}
</body>
</html>"""

    return AdminDebugHandler


def start_admin_server(port, config, log_files, status_fn, host='127.0.0.1',
                       token=None):
    """Start the admin debug server in a daemon thread.

    Bound to `host` (127.0.0.1 by default). If `token` is set, every request
    must present it via the X-Admin-Token header or a ?token= query param.

    Returns the ThreadingHTTPServer instance (call .shutdown() to stop), or
    None if the listener could not be bound.
    """
    handler = _build_handler(config, log_files, status_fn, token=token)
    httpd = ThreadingHTTPServer((host, port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd
