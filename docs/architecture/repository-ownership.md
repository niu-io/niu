# Repository ownership

This repository owns Niu's public self-hosted product. It contains the Rust gateway, TypeScript console, public site, API contracts, SDKs, documentation, tests, and community container image.

The public product builds from this checkout. Its application image serves the site, docs, console, and APIs from one listener, with PostgreSQL as an external service. Builds use the checked-in brand assets and theme tokens under `branding/`; they do not depend on another local checkout.
