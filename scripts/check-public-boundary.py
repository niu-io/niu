#!/usr/bin/env python3
"""Check public source or built assets for common private-data leaks."""

from __future__ import annotations

import argparse
from pathlib import Path

from public_boundary import build_input_errors, explicit_path_files, scan_files, tracked_tree_files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--tracked-tree",
        action="store_true",
        help="scan Git-tracked and non-ignored working-tree files",
    )
    parser.add_argument(
        "--check-build-inputs",
        action="store_true",
        help="verify required Docker exclusions and explicit COPY sources",
    )
    parser.add_argument("paths", nargs="*", type=Path, help="additional files or directories to scan")
    args = parser.parse_args()

    root = args.root.resolve()
    files: list[Path] = []
    if args.tracked_tree:
        files.extend(tracked_tree_files(root))
    explicit_paths = [path if path.is_absolute() else root / path for path in args.paths]
    if explicit_paths:
        try:
            files.extend(explicit_path_files(explicit_paths))
        except ValueError as error:
            parser.error(str(error))

    if not files:
        parser.error("No files selected. Use --tracked-tree or provide a nonempty source/artifact path.")

    errors: list[str] = []
    if args.check_build_inputs:
        errors.extend(build_input_errors(root))
    findings = scan_files(files, root=root)
    for error in errors:
        print(f"Build input check failed: {error}")
    for label, path in findings:
        try:
            display_path = path.relative_to(root)
        except ValueError:
            display_path = path
        print(f"Potential {label} detected in {display_path}")

    if errors or findings:
        return 1
    print(f"Public boundary checks passed ({len(files)} files scanned).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
