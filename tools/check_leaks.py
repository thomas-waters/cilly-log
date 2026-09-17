"""Fail if the repository contains secrets or personal data.

This repository is public, so no real email addresses, keys or log entries
belong in it. Sign-in addresses live in the database (`allowed_users`), and
the only keys in the code are Supabase publishable keys, which are designed
to be shipped in a browser.

Usage:  python tools/check_leaks.py [paths...]
Exits non-zero, listing every problem found, when anything looks wrong.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SKIP_DIRS = {".git", "local", "node_modules", ".claude", "icons"}
TEXT_SUFFIXES = {".html", ".css", ".js", ".mjs", ".json", ".webmanifest", ".md", ".sql", ".py", ".yml", ".yaml", ".txt"}

# Addresses that may legitimately appear as placeholders in examples.
ALLOWED_EMAILS = {"you@example.com", "name@example.com", "someone@example.com"}

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# The patterns are built from pieces so this file does not match itself and
# therefore stays subject to the same scan as every other file.
SECRET_PATTERNS = [
    ("Supabase secret key", re.compile("sb" + r"_secret_[A-Za-z0-9_-]+")),
    ("Supabase service role key", re.compile("service" + "_role")),
    ("JSON web token", re.compile("ey" + r"J[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("GitHub token", re.compile("gh" + r"[pousr]_[A-Za-z0-9]{20,}|github" + r"_pat_[A-Za-z0-9_]{20,}")),
    ("private key", re.compile("-----BEGIN " + r"[A-Z ]*PRIVATE KEY-----")),
    ("AWS access key", re.compile("AK" + r"IA[0-9A-Z]{16}")),
]


def files_to_check(args):
    if args:
        for a in args:
            p = pathlib.Path(a)
            if p.is_file():
                yield p
        return
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.suffix.lower() in TEXT_SUFFIXES:
            yield path


def main():
    problems = []
    for path in files_to_check(sys.argv[1:]):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = path.relative_to(ROOT) if path.is_absolute() else path
        for number, line in enumerate(text.splitlines(), 1):
            for address in EMAIL.findall(line):
                if address.lower() not in ALLOWED_EMAILS:
                    problems.append(f"{rel}:{number}: email address {address}")
            for label, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    problems.append(f"{rel}:{number}: possible {label}")

    if problems:
        print("Found content that must not be in a public repository:\n")
        for problem in problems:
            print("  " + problem)
        print(
            "\nSign-in addresses belong in the database (allowed_users), and secret"
            "\nkeys belong in the hosting provider's settings, never in this repo."
        )
        return 1

    print("no secrets or personal data found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
