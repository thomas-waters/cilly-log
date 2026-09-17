"""Repair double-encoded (mojibake) characters in the project's text files.

Text written as UTF-8 and re-read as Windows-1252 shows up as sequences like
"Â·" or "â€”". A file can hold a mix of broken and correct characters, so this
repairs each suspect sequence on its own: a sequence is replaced only when it
round-trips back to valid UTF-8.

Usage:  python tools/fix_encoding.py [--check]
Exits non-zero in --check mode when any file still needs fixing.
"""
import pathlib
import re
import sys

TARGETS = [
    "index.html", "css/app.css", "js/app.js", "js/store.js", "js/config.js",
    "sw.js", "manifest.webmanifest", "README.md", "CLAUDE.md", "supabase/schema.sql",
]

# Windows leaves these byte values undefined in cp1252, but .NET decodes them to
# the matching control characters, so mojibake produced on Windows can contain them.
CP1252_UNDEFINED = {"": 0x81, "": 0x8D, "": 0x8F, "": 0x90, "": 0x9D}

# A mojibake sequence starts with a UTF-8 lead byte seen as a Latin-1 letter and
# continues with characters cp1252 uses for continuation bytes.
LEAD = "Â-ßà-ïð-ô"
CONT = ("-ÿŒœŠšŸŽžƒˆ˜"
        "–—‘’‚“”„†‡•…"
        "‰‹›€™")
SUSPECT = re.compile(f"[{LEAD}][{CONT}]+")


def to_cp1252_bytes(text):
    out = bytearray()
    for ch in text:
        if ch in CP1252_UNDEFINED:
            out.append(CP1252_UNDEFINED[ch])
        else:
            out.extend(ch.encode("cp1252"))
    return bytes(out)


def repair(text):
    def replace(match):
        chunk = match.group(0)
        try:
            decoded = to_cp1252_bytes(chunk).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return chunk
        # Only accept a decode that produces ordinary text, never control codes.
        if any(ord(c) < 32 and c not in "\t\n\r" for c in decoded):
            return chunk
        return decoded

    return SUSPECT.sub(replace, text)


def main():
    check_only = "--check" in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    needs_fix = []

    for name in TARGETS:
        path = root / name
        if not path.exists():
            continue
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError as exc:
            print(f"{name}: not valid UTF-8 ({exc})")
            needs_fix.append(name)
            continue
        fixed = repair(text)
        if fixed == text:
            continue
        needs_fix.append(name)
        if check_only:
            print(f"{name}: double-encoded characters found")
        else:
            path.write_bytes(fixed.encode("utf-8"))
            print(f"{name}: fixed")

    if not needs_fix:
        print("all files clean")
    return 1 if (check_only and needs_fix) else 0


if __name__ == "__main__":
    sys.exit(main())
