# Niu public repository

Write product documentation in English. Keep the niu.io brand assets and theme tokens.

Keep marketing source in the separate `niu-io/website` repository. Niu owns the public catalog, console, docs and APIs; the hosted distribution composes their pinned artifacts under the single `niu.io` domain. Do not introduce a separate application subdomain or make community builds depend on website or private source. Follow `docs/architecture/repository-ownership.md` for route and asset ownership.

This repository contains only Niu's public project. Internal research, enterprise source, private issue URLs, local source paths, customer records, and secrets must not enter the public tree. Retain upstream copyright and license attribution for selectively reused code.

The implementation reuses individual source modules, not a complete upstream repository or its history. Keep each imported module small, traceable, independently licensed, and explicit about behavior that remains unimplemented.
