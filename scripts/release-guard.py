#!/usr/bin/env python3
"""Read GitHub provenance and refuse to replace a published release."""

import argparse
import json
import re
import subprocess
import sys


def github(path, missing=False):
    result = subprocess.run(
        ["gh", "api", path], capture_output=True, text=True, check=False
    )
    if result.returncode:
        # Only a confirmed 404 means absence; authentication/network errors fail closed.
        if missing and "(HTTP 404)" in result.stderr:
            return None
        raise RuntimeError("Cannot verify GitHub release provenance")
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repository):
        raise RuntimeError("Invalid repository")
    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?", args.tag):
        raise RuntimeError("Invalid release tag")
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        raise RuntimeError("Expected a complete source commit")
    base = f"repos/{args.repository}"
    target = github(f"{base}/git/ref/tags/{args.tag}")["object"]
    # GitHub accepts both lightweight and nested annotated tags.
    for _ in range(16):
        if target["type"] == "commit":
            break
        if target["type"] != "tag":
            raise RuntimeError("Release tag does not identify a source commit")
        target = github(f"{base}/git/tags/{target['sha']}")["object"]
    if target["type"] != "commit" or target["sha"] != args.commit:
        raise RuntimeError("Release tag differs from the checked-out source; refusing publication")
    if github(f"{base}/releases/tags/{args.tag}", missing=True) is not None:
        raise RuntimeError("Release already exists; publish changed source under a new version")
    print(f"Unpublished tag {args.tag} identifies source commit {args.commit}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError) as error:
        print(f"Release refused: {error}", file=sys.stderr)
        sys.exit(1)
