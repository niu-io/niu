# Repository ownership

This repository owns Niu's public self-hosted product. It contains the Rust gateway, TypeScript console, public site, API contracts, SDKs, documentation, tests, and community container image.

The public product builds from this checkout. Its application image serves the site, docs, console, and APIs from one listener, with PostgreSQL as an external service. Builds use the checked-in brand assets and theme tokens under `branding/`; they do not depend on another local checkout.

The private Enterprise distribution pins a public Niu release and composes independently versioned private services beside it. The public service boundary, same-domain routing, module registration, health checks, and tenant context are specified in [Enterprise composition and service boundaries](enterprise-composition.md). The Gateway supports an optional validated release manifest, startup health-gated Unix-socket routes, and signed operator context; the community runtime starts unchanged when the manifest is unset. This repository does not contain private module implementations, a supervisor, or a runnable Enterprise image.
