#!/usr/bin/env python3
"""Provide isolated, disposable detector credentials to GitHub Actions commands.

Never load runtime or supplier credentials for fixture execution.
"""
import os
from pathlib import Path
import secrets


def main():
    environment_file = Path(os.environ["GITHUB_ENV"])
    credential = secrets.token_urlsafe(32)
    print(f"::add-mask::{credential}")
    with environment_file.open("a", encoding="utf-8") as output:
        output.write(f"NIU_IMAGE_STORAGE_TEST_KEY={credential}\n")


if __name__ == "__main__":
    main()
