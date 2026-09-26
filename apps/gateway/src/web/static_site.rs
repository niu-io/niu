use std::env;

use axum::{Router, response::Redirect, routing::get};
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    let site_dir = env::var("NIU_SITE_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let catalog_dir =
        env::var("NIU_CATALOG_DIR").unwrap_or_else(|_| "apps/catalog/dist".to_owned());
    let docs_dir = env::var("NIU_DOCS_DIR").unwrap_or_else(|_| "apps/docs/dist".to_owned());
    let console_dir =
        env::var("NIU_CONSOLE_DIR").unwrap_or_else(|_| "apps/console/dist".to_owned());
    from_directories(site_dir.as_deref(), &catalog_dir, &docs_dir, &console_dir)
}

fn from_directories<S: Clone + Send + Sync + 'static>(
    site_dir: Option<&str>,
    catalog_dir: &str,
    docs_dir: &str,
    console_dir: &str,
) -> Router<S> {
    let console_index = format!("{console_dir}/index.html");

    let docs = Router::new().fallback_service(
        ServeDir::new(docs_dir).not_found_service(ServeFile::new(format!("{docs_dir}/404.html"))),
    );
    let models = Router::new().fallback_service(ServeDir::new(format!("{catalog_dir}/models")));
    let workspaces = Router::new()
        .route("/", get(default_workspace))
        .fallback_service(ServeDir::new(console_dir).fallback(ServeFile::new(console_index)));

    let app = Router::new()
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
        .nest_service("/assets", ServeDir::new(format!("{console_dir}/assets")))
        .nest("/docs", docs)
        .nest("/models", models)
        .nest("/workspaces", workspaces);

    // Marketing is a separately built artifact. Never use it as a catch-all:
    // it must not capture product routes, API failures, or workspace deep links.
    match site_dir {
        Some(directory) => app
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
        None => app.route("/", get(default_workspace)).route_service(
            "/favicon.ico",
            ServeFile::new(format!("{catalog_dir}/favicon.ico")),
        ),
    }
}

#[cfg(test)]
mod tests;

async fn default_workspace() -> Redirect {
    Redirect::temporary("/workspaces/default/")
}
