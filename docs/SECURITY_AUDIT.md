# Seeker — Security Audit Notes

A defensive code audit of Seeker's own network-facing handling. The goal is to
find and fix flaws in **the tool itself** — the code that receives client data
and presents it to the operator — not to make the tool more effective at
capturing third-party data.

Severity uses a rough CVSS-style scale (impact on the operator running the
tool, or on the integrity of the captured research data).

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | CSV / formula injection into `db/results.csv` | Medium | **Fixed** |
| 2 | Terminal ANSI/control-char injection via device fields | Medium | **Fixed** |
| 3 | Client-controlled IP via `X-Forwarded-For` / `Client-IP` | Medium | Documented (behaviour change — needs a decision) |
| 4 | Unauthenticated log-write endpoints | Low/Med | Documented |
| 5 | Unescaped input into Telegram MarkdownV2 | Low | Documented |
| 6 | Undefined-index notices in PHP handlers | Low | Documented |

---

## 1. CSV / formula injection — FIXED

`csvout()` appended client-supplied device fields (`os`, `platform`, GPU
`vendor`/`render`, etc.) straight into `db/results.csv`. A visitor who sets one
of those values — e.g. a spoofed `User-Agent` producing an `os` of
`=cmd|'/c calc'!A1` — plants a formula that executes when the researcher opens
the CSV in Excel/LibreOffice.

**Fix:** `utils.csv_safe()` prefixes any cell that a spreadsheet would treat as
a formula (`=`, `@`, tab, CR, or `+`/`-` not followed by a digit/`.`) with a
literal apostrophe. Negative coordinates such as `-52.52 deg` are preserved so
research data stays clean.

## 2. Terminal ANSI / control-char injection — FIXED

Device fields flowed unescaped into `utils.print()` (and to Telegram/Discord).
A crafted field containing ANSI escapes (e.g. `\x1b[2J\x1b[31m…`) could clear
or spoof the operator's terminal, forging fake output.

**Fix:** `utils.sanitize_untrusted()` strips ANSI/CSI escape sequences and C0/C1
control characters from every value in the parsed `info`/`result` JSON before
it is displayed, logged to CSV, or forwarded.

## 3. Client-controlled source IP — DOCUMENTED (needs decision)

`getUserIP()` in `php/info.php` trusts, in order, `HTTP_CF_CONNECTING_IP`,
`HTTP_CLIENT_IP`, and `HTTP_X_FORWARDED_FOR`. `FILTER_VALIDATE_IP` checks the
*format* but the value is fully attacker-supplied: any visitor can send
`X-Forwarded-For: 8.8.8.8` and poison the recorded IP and the downstream
`ipwhois` lookup, corrupting research data and enabling attribution spoofing.

**Recommended fix (behaviour change — left for the maintainer to choose):**
- Default to `REMOTE_ADDR`.
- Only honour forwarding headers when the immediate peer is a trusted proxy
  (e.g. Cloudflare's published ranges when Seeker is fronted by Cloudflare),
  configured explicitly, not inferred.

Not applied automatically because deployments that legitimately sit behind
Cloudflare/ngrok rely on the current behaviour; the safe default depends on the
operator's setup.

## 4. Unauthenticated log-write endpoints — DOCUMENTED

`info_handler.php`, `result_handler.php`, and `error_handler.php` accept
unauthenticated POSTs and overwrite `logs/info.txt` / `logs/result.txt` with
`w+`. Anyone who learns the URL can overwrite the operator's captured data
(integrity/DoS of the capture) or inject arbitrary JSON values into the parsing
pipeline. This is inherent to how the templates work, but worth a per-session
random path or a shared secret if capture integrity matters for a study.

## 5. Unescaped MarkdownV2 to Telegram — DOCUMENTED

`telegram_api.py` interpolates client values into a MarkdownV2 message without
escaping. MarkdownV2 reserves many characters (`_ * [ ] ( ) ~ \` > # + - = | { } . !`);
an unescaped field can break formatting or cause the send to fail with HTTP
400. Escaping per Telegram's MarkdownV2 rules (or using `parse_mode` `HTML`
with `html.escape`) would harden it.

## 6. PHP undefined-index notices — DOCUMENTED

The handlers read `$_POST[...]` without `isset()` guards; a POST missing a field
emits PHP notices into `logs/php.log`. Low impact, but wrapping reads (or
`$_POST['x'] ?? ''`) keeps logs clean.

---

## Verifying the fixes

```
python3 - <<'PY'
import utils
assert utils.csv_safe('=cmd|calc').startswith("'")
assert utils.csv_safe('-52.52 deg') == '-52.52 deg'
assert utils.sanitize_untrusted('X\x1b[2J\x1b[31mFAKE') == 'XFAKE'
print('ok')
PY
```
