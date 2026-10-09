//! Ordinary Ark asset-group request validation; no dispatch or entitlement.
//! Upstream ProjectName is an API contract, not a Niu workspace identifier.
use serde_json::{Value, json};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetGroupError {
    InvalidName,
    InvalidDescription,
    MissingUpstreamProject,
    InvalidSavedRequest,
}

/// The ordinary creation path cannot create a real-person LivenessFace group.
/// That lifecycle requires a separate consented verification flow.
pub struct OrdinaryAssetGroupCreate {
    name: String,
    description: Option<String>,
}

impl OrdinaryAssetGroupCreate {
    pub fn new(name: String, description: Option<String>) -> Result<Self, AssetGroupError> {
        if name.trim().is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control)
        {
            return Err(AssetGroupError::InvalidName);
        }
        if description.as_ref().is_some_and(|value| {
            value.chars().count() > 300
                || value.chars().any(|character| {
                    character.is_control() && !matches!(character, '\n' | '\t' | '\r')
                })
        }) {
            return Err(AssetGroupError::InvalidDescription);
        }
        Ok(Self { name, description })
    }

    /// Reconstruct only an exact ordinary request bound to its saved project.
    /// Reject unknown fields and alternate group types rather than signing a
    /// changed meaning during a durable dispatch handoff.
    pub fn from_saved_body(body: &Value, upstream_project: &str) -> Result<Self, AssetGroupError> {
        let name = body
            .get("Name")
            .and_then(Value::as_str)
            .ok_or(AssetGroupError::InvalidSavedRequest)?;
        let description = match body.get("Description") {
            None => None,
            Some(Value::String(value)) => Some(value.clone()),
            _ => return Err(AssetGroupError::InvalidSavedRequest),
        };
        let request = Self::new(name.to_owned(), description)?;
        if request.body(upstream_project)? != *body {
            return Err(AssetGroupError::InvalidSavedRequest);
        }
        Ok(request)
    }

    /// Adapter configuration must supply the original account's upstream project.
    /// Never silently fall back to `default` or accept it from workspace routing.
    pub fn body(&self, upstream_project: &str) -> Result<Value, AssetGroupError> {
        if upstream_project.trim().is_empty() || upstream_project.chars().any(char::is_control) {
            return Err(AssetGroupError::MissingUpstreamProject);
        }
        let mut body = json!({
            "Name": self.name,
            "GroupType": "AIGC",
            "ProjectName": upstream_project,
        });
        if let Some(description) = &self.description {
            body["Description"] = Value::String(description.clone());
        }
        Ok(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_character_limits_are_not_utf8_byte_limits() {
        let request =
            OrdinaryAssetGroupCreate::new("牛".repeat(64), Some("元".repeat(300))).unwrap();
        let body = request.body("bound-upstream-project").unwrap();
        assert_eq!(body["GroupType"], "AIGC");
        assert_eq!(body["ProjectName"], "bound-upstream-project");
        assert_eq!(body["Name"].as_str().unwrap().chars().count(), 64);
        assert!(matches!(
            OrdinaryAssetGroupCreate::new("牛".repeat(65), None),
            Err(AssetGroupError::InvalidName)
        ));
        assert!(matches!(
            OrdinaryAssetGroupCreate::new("Name".into(), Some("元".repeat(301))),
            Err(AssetGroupError::InvalidDescription)
        ));
    }

    #[test]
    fn project_binding_is_explicit_and_optional_description_stays_absent() {
        let request = OrdinaryAssetGroupCreate::new("Virtual character".into(), None).unwrap();
        for project in ["", "  ", "project\nother"] {
            assert_eq!(
                request.body(project),
                Err(AssetGroupError::MissingUpstreamProject)
            );
        }
        let body = request.body("default").unwrap();
        assert!(body.get("Description").is_none());
        assert_eq!(body["ProjectName"], "default");
    }

    #[test]
    fn saved_body_reconstruction_preserves_exact_ordinary_project_binding() {
        let request =
            OrdinaryAssetGroupCreate::new("牛元".into(), Some("First\nSecond".into())).unwrap();
        let body = request.body("original-project").unwrap();
        let restored =
            OrdinaryAssetGroupCreate::from_saved_body(&body, "original-project").unwrap();
        assert_eq!(restored.body("original-project").unwrap(), body);
        assert_eq!(
            OrdinaryAssetGroupCreate::from_saved_body(&body, "different-project").err(),
            Some(AssetGroupError::InvalidSavedRequest)
        );
        let without_description = OrdinaryAssetGroupCreate::new("Character".into(), None)
            .unwrap()
            .body("original-project")
            .unwrap();
        assert_eq!(
            OrdinaryAssetGroupCreate::from_saved_body(&without_description, "original-project")
                .unwrap()
                .body("original-project")
                .unwrap(),
            without_description
        );
    }

    #[test]
    fn saved_body_rejects_alternate_group_types_and_unreviewed_fields() {
        let body = OrdinaryAssetGroupCreate::new("Character".into(), None)
            .unwrap()
            .body("original-project")
            .unwrap();
        for (field, value) in [
            ("GroupType", json!("LivenessFace")),
            ("ProjectName", json!("other")),
            ("Name", json!(null)),
            ("Description", json!(null)),
            ("UnreviewedControl", json!(true)),
        ] {
            let mut changed = body.clone();
            changed[field] = value;
            assert!(
                OrdinaryAssetGroupCreate::from_saved_body(&changed, "original-project").is_err()
            );
        }
        assert!(OrdinaryAssetGroupCreate::from_saved_body(&json!([]), "original-project").is_err());
    }

    #[test]
    fn invalid_names_and_control_characters_are_rejected() {
        for name in ["", "  ", "name\0", "name\nother"] {
            assert!(matches!(
                OrdinaryAssetGroupCreate::new(name.into(), None),
                Err(AssetGroupError::InvalidName)
            ));
        }
        assert!(matches!(
            OrdinaryAssetGroupCreate::new("Name".into(), Some("description\0".into())),
            Err(AssetGroupError::InvalidDescription)
        ));
        assert!(
            OrdinaryAssetGroupCreate::new("Name".into(), Some("First line\nSecond line".into()))
                .is_ok()
        );
    }
}
