use std::env;

use axum::{
    Router, middleware,
    response::{IntoResponse, Redirect, Response},
    routing::get,
};
use tower::ServiceExt;
use tower_http::services::{ServeDir, ServeFile};

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

    let app = Router::new()
        // Directory entries must survive a browser reload just like scoped workspace pages.
        .route_service("/workspaces", ServeFile::new(dashboard_index.clone()))
        .route_service("/workspaces/", ServeFile::new(dashboard_index.clone()))
        .route("/help", get(|| async { Redirect::temporary("/help/") }))
        .route_service(
            "/help/",
            ServeFile::new(format!("{dashboard_dir}/index.html")),
        )
        .route_service("/login", ServeFile::new(dashboard_index.clone()))
        .route_service("/installation", ServeFile::new(dashboard_index.clone()))
        .route_service("/admin", ServeFile::new(dashboard_index.clone()))
        .route_service("/admin/commercial", ServeFile::new(dashboard_index.clone()))
        .route_service(
            "/admin/customer-accounts",
            ServeFile::new(dashboard_index.clone()),
        )
        .route_service("/admin/pricing", ServeFile::new(dashboard_index.clone()))
        .route_service("/admin/audit-logs", ServeFile::new(dashboard_index.clone()))
        .route_service("/admin/branding", ServeFile::new(dashboard_index.clone()))
        .route_service("/admin/payments", ServeFile::new(dashboard_index.clone()))
        .nest(
            "/admin/suppliers",
            Router::new().fallback_service(ServeFile::new(dashboard_index.clone())),
        )
        .nest(
            "/settings",
            Router::new().fallback_service(ServeFile::new(dashboard_index.clone())),
        )
        .route_service("/generations", ServeFile::new(dashboard_index.clone()))
        .route_service("/chat", ServeFile::new(dashboard_index.clone()))
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
        .nest(
            "/providers",
            Router::new().fallback_service(ServeFile::new(dashboard_index.clone())),
        )
        .nest(
            "/suppliers",
            Router::new().fallback_service(ServeFile::new(dashboard_index.clone())),
        )
        .nest(
            "/activity",
            Router::new().fallback_service(ServeFile::new(dashboard_index.clone())),
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
    app.layer(middleware::from_fn(static_cache_headers))
}

async fn static_cache_headers(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let path = request.uri().path();
    let is_static_asset = path.starts_with("/_astro/")
        || path.starts_with("/assets/")
        || path.starts_with("/_catalog/")
        || path.starts_with("/catalog-assets/")
        || path.starts_with("/site-assets/");
    let mut response = next.run(request).await;
    if response
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/html"))
    {
        // Entry documents reference versioned assets; always revalidate after a release.
        response.headers_mut().insert(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache"),
        );
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
