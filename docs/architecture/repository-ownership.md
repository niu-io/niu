# Repository ownership

The Niu project uses four repositories so community code, enterprise implementation, marketing, and organization information have clear owners.

| Repository | Responsibility |
| --- | --- |
| `niu-io/.github` | Public organization introduction, community defaults, and project links |
| `niu-io/niu` | Complete open-source gateway, console, contracts, documentation, tests, and community release |
| `niu-io/enterprise` | Enterprise implementation, release center, and hosted `app.niu.io` code |
| `niu-io/website` | Landing pages for `niu.io` and public product information |

The public project is a full self-hosted product. It does not require a private package, private API, hosted account, or hosted database. Enterprise uses a pinned public release and versioned public contracts.

The default community deployment uses one application image and public port with external PostgreSQL. Repository boundaries do not require extra runtime containers. Enterprise deployment and hosted UI composition are maintained in the private repository.

Reuse the niu.io brand assets and theme tokens under `branding/`. Each repository packages its required brand assets with its own release; builds do not reference another local checkout.
