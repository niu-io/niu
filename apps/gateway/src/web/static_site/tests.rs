use std::{fs, path::PathBuf};

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use uuid::Uuid;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("niu-domain-{}", Uuid::new_v4()));
        for (file, content) in [
            ("website/index.html", "marketing"),
            ("website/models/index.html", "must not shadow catalog"),
            ("website/docs/index.html", "must not shadow docs"),
            (
                "website/workspaces/default/index.html",
                "must not shadow console",
            ),
            ("website/admin/v1/missing", "must not shadow APIs"),
            ("website/site-assets/brand.png", "marketing image"),
            ("website/_astro/style.css", "marketing CSS"),
            ("website/robots.txt", "marketing robots"),
            ("website/sitemap.xml", "marketing sitemap"),
            ("website/favicon.ico", "marketing favicon"),
            ("catalog/models/index.html", "public catalog"),
            ("catalog/catalog-assets/models.js", "catalog script"),
            ("catalog/_catalog/style.css", "catalog CSS"),
            ("catalog/favicon.ico", "community favicon"),
            ("console/index.html", "workspace shell"),
            ("console/assets/app.js", "workspace script"),
            ("docs/index.html", "public docs"),
            ("docs/404.html", "docs missing"),
        ] {
            let path = root.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        Self(root)
    }

    fn router(&self, marketing: bool) -> Router {
        let website = self.0.join("website");
        super::from_directories(
            marketing.then(|| website.to_str().unwrap()),
            self.0.join("catalog").to_str().unwrap(),
            self.0.join("docs").to_str().unwrap(),
            self.0.join("console").to_str().unwrap(),
        )
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

async fn body(app: &Router, path: &str, status: StatusCode) -> String {
    let response = app
        .clone()
        .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), status, "{path}");
    String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap()
}

#[tokio::test]
async fn separate_artifacts_share_one_origin_without_route_or_asset_collisions() {
    let fixture = Fixture::new();
    let app = fixture.router(true);
    for (path, expected) in [
        ("/", "marketing"),
        ("/models/", "public catalog"),
        ("/docs/", "public docs"),
        ("/workspaces/default/", "workspace shell"),
        ("/workspaces/default/operators", "workspace shell"),
        ("/site-assets/brand.png", "marketing image"),
        ("/_astro/style.css", "marketing CSS"),
        ("/catalog-assets/models.js", "catalog script"),
        ("/_catalog/style.css", "catalog CSS"),
        ("/assets/app.js", "workspace script"),
        ("/robots.txt", "marketing robots"),
        ("/sitemap.xml", "marketing sitemap"),
        ("/favicon.ico", "marketing favicon"),
    ] {
        assert_eq!(body(&app, path, StatusCode::OK).await, expected);
    }
    for path in [
        "/admin/v1/missing",
        "/v1/missing",
        "/enterprise/api/v1/missing",
        "/missing",
        "/models/missing",
        "/site-assets/missing",
    ] {
        body(&app, path, StatusCode::NOT_FOUND).await;
    }
    assert_eq!(
        body(&app, "/docs/missing", StatusCode::NOT_FOUND).await,
        "docs missing"
    );
}

#[tokio::test]
async fn community_build_does_not_require_marketing_artifacts() {
    let fixture = Fixture::new();
    let app = fixture.router(false);
    let response = app
        .clone()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(response.headers()["location"], "/workspaces/default/");
    assert_eq!(
        body(&app, "/models/", StatusCode::OK).await,
        "public catalog"
    );
    assert_eq!(
        body(&app, "/favicon.ico", StatusCode::OK).await,
        "community favicon"
    );
    body(&app, "/site-assets/brand.png", StatusCode::NOT_FOUND).await;
    body(&app, "/_astro/style.css", StatusCode::NOT_FOUND).await;
}
