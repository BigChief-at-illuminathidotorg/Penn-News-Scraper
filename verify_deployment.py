"""Verify the canonical site serves this run's app and collection after deployment."""
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def verify(base_url, fetch):
    for path in ("app.js", "data/latest.json"):
        expected = Path("public", path).read_bytes()
        actual = fetch(f"{base_url}/{path}?verify={hashlib.sha256(expected).hexdigest()}")
        if path.endswith(".json"):
            if json.loads(actual) != json.loads(expected):
                raise ValueError("Public collection differs from this run")
        elif actual != expected:
            raise ValueError("Public app differs from this run; check production branch or rollback")


def fetch_url(url):
    with urlopen(Request(url, headers={"Cache-Control": "no-cache"}), timeout=30) as response:
        return response.read()


if __name__ == "__main__":
    base = "https://" + os.environ.get("PAGES_PROJECT", "penn-news-monitor") + ".pages.dev"
    for attempt in range(6):
        try:
            verify(base, fetch_url)
            print("Verified canonical site app and collection:", base)
            break
        except HTTPError as error:
            if error.code not in (401, 403):
                raise
            message = "Deployment uploaded, but public verification was denied (HTTP " + str(error.code) + "). Open the live site to confirm its collection time."
            print("::warning::" + message)
            summary = os.environ.get("GITHUB_STEP_SUMMARY")
            if summary:
                with open(summary, "a") as output:
                    output.write("\n**Public verification incomplete:** " + message + "\n")
            break
        except Exception as error:
            if attempt == 5:
                raise
            print("Waiting for deployment propagation:", error)
            time.sleep(10)
