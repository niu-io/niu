use std::env;

use axum::{Router, response::Redirect, routing::get};
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    let site_dir = env::var("NIU_SITE_DIR").unwrap_or_else(|_| "apps/site/dist".to_owned());
    let docs_dir = env::var("NIU_DOCS_DIR").unwrap_or_else(|_| "apps/docs/dist".to_owned());
    let console_dir =
        env::var("NIU_CONSOLE_DIR").unwrap_or_else(|_| "apps/console/dist".to_owned());
    let console_index = format!("{console_dir}/index.html");

    let docs = Router::new().fallback_service(
        ServeDir::new(docs_dir.clone())
            .not_found_service(ServeFile::new(format!("{docs_dir}/404.html"))),
    );
    let models = Router::new().fallback_service(ServeDir::new(format!("{site_dir}/models")));
    let workspaces = Router::new()
        .route("/", get(default_workspace))
        .fallback_service(
            ServeDir::new(console_dir.clone()).fallback(ServeFile::new(console_index)),
        );

    Router::new()
        .route_service("/", ServeFile::new(format!("{site_dir}/index.html")))
        .route_service(
            "/favicon.ico",
            ServeFile::new(format!("{site_dir}/favicon.ico")),
        )
        .route_service(
            "/robots.txt",
            ServeFile::new(format!("{site_dir}/robots.txt")),
        )
        .route_service(
            "/sitemap.xml",
            ServeFile::new(format!("{site_dir}/sitemap.xml")),
        )
        .route_service("/docs/", ServeFile::new(format!("{docs_dir}/index.html")))
        .route_service(
            "/models/",
            ServeFile::new(format!("{site_dir}/models/index.html")),
        )
        .nest_service("/_astro", ServeDir::new(format!("{site_dir}/_astro")))
        .nest_service(
            "/site-assets",
            ServeDir::new(format!("{site_dir}/site-assets")),
        )
        .nest_service("/assets", ServeDir::new(format!("{console_dir}/assets")))
        .nest("/docs", docs)
        .nest("/models", models)
        .nest("/workspaces", workspaces)
}

async fn default_workspace() -> Redirect {
    Redirect::temporary("/workspaces/default/")
}
