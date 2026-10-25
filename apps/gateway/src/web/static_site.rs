use std::env;

use axum::{
    Router, middleware,
    response::{IntoResponse, Redirect, Response},
    routing::get,
};
use tower::ServiceExt;
use tower_http::{
    compression::{CompressionLayer, predicate::NotForContentType},
    services::{ServeDir, ServeFile},
};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    let site_dir = env::var("NIU_SITE_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let catalog_dir =
        env::var("NIU_CATALOG_DIR").unwrap_or_else(|_| "apps/catalog/dist".to_owned());
    let docs_dir = env::var("NIU_DOCS_DIR").unwrap_or_else(|_| "apps/docs/dist".to_owned());
    let dashboard_dir =
        env::var("NIU_DASHBOARD_DIR").unwrap_or_else(|_| "apps/dashboard/dist".to_owned());
    from_directories(site_dir.as_deref(), &catalog_dir, &docs_dir, &dashboard_dir)
}

// Canonicalize public directory entries without losing filters or login return context.
async fn canonical_public_root(uri: axum::http::Uri) -> Redirect {
    let mut destination = format!("{}/", uri.path());
    if let Some(query) = uri.query() {
        destination.push('?');
        destination.push_str(query);
    }
    Redirect::permanent(&destination)
}

fn from_directories<S: Clone + Send + Sync + 'static>(
    site_dir: Option<&str>,
    catalog_dir: &str,
    docs_dir: &str,
    dashboard_dir: &str,
) -> Router<S> {
    let dashboard_index = format!("{dashboard_dir}/index.html");

    let docs = Router::new().fallback_service(
        ServeDir::new(docs_dir).not_found_service(ServeFile::new(format!("{docs_dir}/404.html"))),
    );
    let models = Router::new().fallback_service(ServeDir::new(format!("{catalog_dir}/models")));
    let workspaces = Router::new().fallback_service(
        ServeDir::new(dashboard_dir).fallback(ServeFile::new(dashboard_index.clone())),
    );

    let mut app = Router::new()
        // Directory entries must survive a browser reload just like scoped workspace pages.
        .route_service("/workspaces", ServeFile::new(dashboard_index.clone()))
        .route_service("/workspaces/", ServeFile::new(dashboard_index.clone()))
        .route("/help", get(|| async { Redirect::temporary("/help/") }))
        .route_service(
            "/help/",
            ServeFile::new(format!("{dashboard_dir}/index.html")),
        );
    for path in [
        "/login",
        "/installation",
        "/admin",
        "/admin/customers",
        "/admin/settings",
        "/admin/reports",
        "/admin/balances",
        "/admin/pools",
        "/admin/audit",
        "/admin/model-pools",
        "/admin/financial-reports",
        "/admin/account-balances",
        "/admin/payment-gateways",
        // Historical page URLs still load the dashboard for client redirects.
        "/admin/route-pools",
        "/admin/commercial",
        "/admin/customer-accounts",
        "/admin/pricing",
        "/admin/audit-logs",
        "/admin/branding",
        "/admin/payments",
        "/generations",
        "/chat",
    ] {
        let slash_path = format!("{path}/");
        app = app
            .route_service(path, ServeFile::new(dashboard_index.clone()))
            .route_service(&slash_path, ServeFile::new(dashboard_index.clone()));
    }
    for prefix in [
        "/admin/providers",
        "/admin/suppliers",
        "/settings",
        "/providers",
        "/suppliers",
        "/activity",
    ] {
        let slash_prefix = format!("{prefix}/");
        app = app
            .route_service(&slash_prefix, ServeFile::new(dashboard_index.clone()))
            .nest(
                prefix,
                Router::new().fallback_service(ServeFile::new(dashboard_index.clone())),
            );
    }
    let app = app
        .route_service("/docs/", ServeFile::new(format!("{docs_dir}/index.html")))
        .route_service(
            "/models/",
            ServeFile::new(format!("{catalog_dir}/models/index.html")),
        )
        .nest_service(
            "/_catalog",
            ServeDir::new(format!("{catalog_dir}/_catalog")),
        )
        .nest_service(
            "/catalog-assets",
            ServeDir::new(format!("{catalog_dir}/catalog-assets")),
        )
        .nest_service("/assets", ServeDir::new(format!("{dashboard_dir}/assets")))
        .nest(
            "/help",
            Router::new().fallback_service(ServeFile::new(format!("{dashboard_dir}/index.html"))),
        )
        .nest("/docs", docs)
        .nest("/models", models)
        .nest("/workspaces", workspaces);

    // Public catalog remains public; explicit workspace context enters the
    // authenticated dashboard. All data access still uses the normal API guards.
    let model_dashboard = ServeFile::new(dashboard_index.clone());
    let app = app.layer(middleware::from_fn(
        move |request: axum::extract::Request, next: axum::middleware::Next| {
            let entry = model_dashboard.clone();
            async move {
                let path = request.uri().path();
                let scoped_models = (path == "/models" || path.starts_with("/models/"))
                    && request.uri().query().is_some_and(|query| {
                        url::form_urlencoded::parse(query.as_bytes())
                            .any(|(key, value)| key == "workspace" && !value.is_empty())
                    });
                if scoped_models {
                    match entry.oneshot(request).await {
                        Ok(response) => response.into_response(),
                        Err(never) => match never {},
                    }
                } else if path == "/models" {
                    canonical_public_root(request.uri().clone())
                        .await
                        .into_response()
                } else {
                    next.run(request).await
                }
            }
        },
    ));

    // Marketing is a separately built artifact. Never use it as a catch-all:
    // it must not capture product routes, API failures, or workspace deep links.
    let app = match site_dir {
        Some(directory) => app
            .route("/blog", get(canonical_public_root))
            .route("/compare", get(canonical_public_root))
            .route(
                "/docs/compare/",
                get(|| async { Redirect::permanent("/compare/") }),
            )
            .route(
                "/docs/compare/new-api/",
                get(|| async { Redirect::permanent("/compare/new-api/") }),
            )
            .route(
                "/docs/compare/openrouter/",
                get(|| async { Redirect::permanent("/compare/openrouter/") }),
            )
            .route_service(
                "/compare/",
                ServeFile::new(format!("{directory}/compare/index.html")),
            )
            .nest(
                "/compare",
                Router::new().fallback_service(ServeDir::new(format!("{directory}/compare"))),
            )
            .route_service(
                "/blog/",
                ServeFile::new(format!("{directory}/blog/index.html")),
            )
            .nest(
                "/blog",
                Router::new().fallback_service(ServeDir::new(format!("{directory}/blog"))),
            )
            .route_service("/", ServeFile::new(format!("{directory}/index.html")))
            .route_service(
                "/favicon.ico",
                ServeFile::new(format!("{directory}/favicon.ico")),
            )
            .route_service(
                "/robots.txt",
                ServeFile::new(format!("{directory}/robots.txt")),
            )
            .route_service(
                "/sitemap.xml",
                ServeFile::new(format!("{directory}/sitemap.xml")),
            )
            .nest_service("/_astro", ServeDir::new(format!("{directory}/_astro")))
            .nest_service(
                "/site-assets",
                ServeDir::new(format!("{directory}/site-assets")),
            ),
        None => app
            .route(
                "/compare",
                get(|| async { Redirect::temporary("/docs/compare/") }),
            )
            .route(
                "/compare/",
                get(|| async { Redirect::temporary("/docs/compare/") }),
            )
            .route(
                "/compare/new-api/",
                get(|| async { Redirect::temporary("/docs/compare/new-api/") }),
            )
            .route(
                "/compare/openrouter/",
                get(|| async { Redirect::temporary("/docs/compare/openrouter/") }),
            )
            .route("/", get(default_workspace))
            .route_service(
                "/favicon.ico",
                ServeFile::new(format!("{catalog_dir}/favicon.ico")),
            ),
    };
    app.layer(middleware::from_fn(static_cache_headers)).layer(
        CompressionLayer::new().compress_when(NotForContentType::const_new("text/event-stream")),
    )
}

fn is_known_workspace_subpath(path: &str) -> bool {
    let Some(rest) = path.strip_prefix("/workspaces/") else {
        return true;
    };
    let trimmed = rest.trim_matches('/');
    if trimmed.is_empty() {
        return true;
    }
    let mut segments = trimmed.split('/');
    let _workspace = segments.next();
    let Some(section) = segments.next() else {
        return true;
    };
    matches!(
        section,
        "models"
            | "providers-admin"
            | "vendors"
            | "provider-capabilities"
            | "video"
            | "keys"
            | "organization"
            | "settings"
            | "users"
            | "operators"
            | "guardrails"
            | "billing"
            | "usage"
            | "activity"
            | "library"
            | "executions"
            | "costs"
            | "playground"
            | "subscriptions"
    )
}

const DASHBOARD_CSP_REPORT_ONLY: &str = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

async fn static_cache_headers(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let path = request.uri().path().to_owned();
    // Help embeds our documentation, never authenticated management pages.
    let same_origin_help = path == "/docs" || path.starts_with("/docs/");
    let is_immutable_asset = path.starts_with("/_astro/")
        || path.starts_with("/assets/")
        || path.starts_with("/_catalog/");
    let is_static_asset = is_immutable_asset
        || path.starts_with("/catalog-assets/")
        || path.starts_with("/site-assets/");
    let unknown_workspace_route = !is_known_workspace_subpath(&path);
    let mut response = next.run(request).await;
    if unknown_workspace_route && response.status() == axum::http::StatusCode::OK {
        *response.status_mut() = axum::http::StatusCode::NOT_FOUND;
    }
    if response
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/html"))
    {
        // Entry documents reference versioned assets; always revalidate after a release.
        let headers = response.headers_mut();
        headers.insert(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache"),
        );
        headers.insert(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            axum::http::HeaderValue::from_static("nosniff"),
        );
        headers.insert(
            axum::http::header::X_FRAME_OPTIONS,
            axum::http::HeaderValue::from_static(if same_origin_help {
                "SAMEORIGIN"
            } else {
                "DENY"
            }),
        );
        headers.insert(
            axum::http::header::CONTENT_SECURITY_POLICY,
            axum::http::HeaderValue::from_static(if same_origin_help {
                "frame-ancestors 'self'"
            } else {
                "frame-ancestors 'none'"
            }),
        );
        headers.insert(
            axum::http::header::REFERRER_POLICY,
            axum::http::HeaderValue::from_static("strict-origin-when-cross-origin"),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static("permissions-policy"),
            axum::http::HeaderValue::from_static(
                "camera=(), microphone=(), geolocation=(), payment=()",
            ),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static("content-security-policy-report-only"),
            if same_origin_help {
                axum::http::HeaderValue::from_str(
                    &DASHBOARD_CSP_REPORT_ONLY.replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
                ).expect("static documentation policy is a valid header")
            } else {
                axum::http::HeaderValue::from_static(DASHBOARD_CSP_REPORT_ONLY)
            },
        );
    } else if is_immutable_asset && response.status().is_success() {
        response
            .headers_mut()
            .entry(axum::http::header::CACHE_CONTROL)
            .or_insert(axum::http::HeaderValue::from_static(
                "public, max-age=31536000, immutable",
            ));
    } else if is_static_asset && response.status().is_success() {
        response
            .headers_mut()
            .entry(axum::http::header::CACHE_CONTROL)
            .or_insert(axum::http::HeaderValue::from_static("public, max-age=3600"));
    }
    response
}

#[cfg(test)]
mod tests;

async fn default_workspace() -> Redirect {
    Redirect::temporary("/workspaces/default/")
}
