"""Make a new team passcode for the monitor's editor and Check for updates.

Prints the passcode once and saves only a scrambled copy of it (a salted SHA-256)
in lib/passcode.mjs. That copy is safe to publish because the passcode is long and
random (about 99 bits). Commit lib/passcode.mjs afterwards; the next deployment uses
it. A MONITOR_PASSCODE secret, if one is set, takes priority over this file."""
import hashlib
import secrets
from pathlib import Path

ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"   # no 0/o, 1/l/i to misread


def make():
    code = "-".join("".join(secrets.choice(ALPHABET) for _ in range(5)) for _ in range(4))
    salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{code}".encode()).hexdigest()
    Path(__file__).with_name("lib").joinpath("passcode.mjs").write_text(
        "// Made by set_passcode.py: a salted SHA-256 of the team passcode, never the passcode\n"
        "// itself. A MONITOR_PASSCODE secret on the site, if set, takes priority.\n"
        f"export const PASSCODE_HASH = {{ salt: '{salt}', sha256: '{digest}' }};\n")
    return code


if __name__ == "__main__":
    print(make())
