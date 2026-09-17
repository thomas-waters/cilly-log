"""Stamp a new build id on the app's assets.

Browsers and the service worker cache CSS and JS. Without a version on those
URLs a deploy can leave a browser running new HTML with an old script, which
breaks the page. This rewrites the `?v=` on every asset link in index.html and
the service worker's cache name, so each release fetches its own files.

Run before committing a release:  python tools/release.py
"""
import datetime
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    build = datetime.datetime.now().strftime("%Y%m%d-%H%M")

    index = ROOT / "index.html"
    html = index.read_text(encoding="utf-8")
    # css/app.css, js/config.js, js/store.js, js/app.js -> add or replace ?v=
    html, n_assets = re.subn(
        r'((?:href|src)=")((?:css|js)/[A-Za-z0-9_.-]+)(?:\?v=[^"]*)?(")',
        lambda m: f"{m.group(1)}{m.group(2)}?v={build}{m.group(3)}",
        html,
    )
    index.write_text(html, encoding="utf-8")

    sw = ROOT / "sw.js"
    js = sw.read_text(encoding="utf-8")
    js, n_version = re.subn(
        r"var VERSION = '[^']*';",
        f"var VERSION = 'cilly-log-{build}';",
        js,
    )
    sw.write_text(js, encoding="utf-8")

    print(f"build {build}: stamped {n_assets} asset links, {n_version} cache name")
    if n_assets == 0 or n_version == 0:
        print("nothing was stamped - check the patterns in this script")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
