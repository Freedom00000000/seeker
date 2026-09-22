#!/usr/bin/env python3
import requests
import uuid
import sys
import re
import builtins

# Matches ANSI/CSI escape sequences.
_ANSI_RE = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]')
# Matches remaining C0/C1 control characters (keep \t already handled by CSV).
_CONTROL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def sanitize_untrusted(value):
    """Strip terminal control / ANSI escape characters from client-supplied
    text so a crafted device field cannot spoof or corrupt the operator's
    terminal output (ANSI injection)."""
    if not isinstance(value, str):
        return value
    return _CONTROL_RE.sub('', _ANSI_RE.sub('', value))


def csv_safe(value):
    """Neutralise CSV / formula injection: prefix a value that a spreadsheet
    would otherwise treat as a formula so it is stored as literal text.

    A leading '+'/'-' immediately followed by a digit or '.' is left intact so
    legitimate negative coordinates (e.g. '-52.52 deg') are preserved."""
    s = '' if value is None else str(value)
    if not s:
        return s
    first = s[0]
    if first in ('=', '@', '\t', '\r'):
        return "'" + s
    if first in ('+', '-') and not (len(s) > 1 and (s[1].isdigit() or s[1] == '.')):
        return "'" + s
    return s


def downloadImageFromUrl(url, path):
    if not url.startswith('http'):
        return None
    img_data = requests.get(url).content
    fPath = path + '/' + str(uuid.uuid1()) + '.jpg'
    with open(fPath, 'wb') as handler:
        handler.write(img_data)
    return fPath


def print(ftext, **args):
    if sys.stdout.isatty():
        builtins.print(ftext, flush=True, **args)
    else:
        builtins.print(re.sub(r'\33\[\d+m', ' ', ftext), flush=True, **args)
