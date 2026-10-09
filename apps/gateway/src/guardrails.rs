//! Deterministic access-policy composition. Enforcement integration is separate.
pub(crate) mod detector;
pub(crate) mod image;
pub(crate) mod input;
pub(crate) mod output;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    content = "values",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum AccessRule {
    Inherit,
    AllowAll,
    AllowList(BTreeSet<String>),
    DenyAll,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyDraft {
    pub schema_version: u32,
    pub name: String,
    pub models: AccessRule,
    pub providers: AccessRule,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub input_rules: Vec<input::RuleConfig>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub input_detectors: Vec<detector::Binding>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub image_detectors: Vec<image::Binding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<OutputPolicy>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputPolicy {
    pub mode: OutputMode,
    pub rules: Vec<input::RuleConfig>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputMode {
    BufferedFull,
    ObserveOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyValidationError {
    UnsupportedVersion,
    InvalidName,
    TooManyValues,
    InvalidValue,
    InvalidInputRules,
}

impl PolicyDraft {
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        self.validate_shape()?;
        input::CompiledInputPolicy::compile(&self.input_rules)
            .map_err(|_| PolicyValidationError::InvalidInputRules)?;
        if let Some(output) = &self.output {
            input::CompiledInputPolicy::compile(&output.rules)
                .map_err(|_| PolicyValidationError::InvalidInputRules)?;
        }
        Ok(())
    }

    /// Cheap structural validation; regex compilation belongs on bounded workers.
    pub fn validate_shape(&self) -> Result<(), PolicyValidationError> {
        if self.schema_version != 1 {
            return Err(PolicyValidationError::UnsupportedVersion);
        }
        if self.name.trim().is_empty()
            || self.name.len() > 200
            || self.name.chars().any(char::is_control)
        {
            return Err(PolicyValidationError::InvalidName);
        }
        for rule in [&self.models, &self.providers] {
            if let AccessRule::AllowList(values) = rule {
                if values.len() > 1000 {
                    return Err(PolicyValidationError::TooManyValues);
                }
                if values.iter().any(|value| {
                    value.is_empty()
                        || value.len() > 200
                        || value.trim() != value
                        || value.chars().any(char::is_control)
                        || value == "*"
                }) {
                    return Err(PolicyValidationError::InvalidValue);
                }
            }
        }
        if self.input_detectors.len() > 4
            || self.input_detectors.iter().any(|binding| !binding.valid())
        {
            return Err(PolicyValidationError::InvalidInputRules);
        }
        if self.image_detectors.len() > 4
            || self.image_detectors.iter().any(|binding| !binding.valid())
            || self
                .image_detectors
                .iter()
                .map(|binding| &binding.detector)
                .collect::<BTreeSet<_>>()
                .len()
                != self.image_detectors.len()
        {
            return Err(PolicyValidationError::InvalidInputRules);
        }
        if self.input_rules.len() > 32
            || self
                .output
                .as_ref()
                .is_some_and(|output| output.rules.is_empty() || output.rules.len() > 32)
            || self
                .input_rules
                .iter()
                .chain(self.output.iter().flat_map(|output| output.rules.iter()))
                .any(|rule| match (&rule.pattern, rule.preset) {
                    (Some(pattern), None) => pattern.len() > 4096,
                    (None, Some(_)) => false,
                    _ => true,
                })
        {
            return Err(PolicyValidationError::InvalidInputRules);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EffectiveAccess {
    All,
    Only(BTreeSet<String>),
}

impl EffectiveAccess {
    pub fn compose(rules: impl IntoIterator<Item = AccessRule>) -> Self {
        let mut effective = Self::All;
        for rule in rules {
            match rule {
                AccessRule::Inherit | AccessRule::AllowAll => {}
                AccessRule::DenyAll => effective = Self::Only(BTreeSet::new()),
                AccessRule::AllowList(values) => {
                    effective = Self::Only(match effective {
                        Self::All => values,
                        Self::Only(parent) => parent.intersection(&values).cloned().collect(),
                    });
                }
            }
        }
        effective
    }

    pub fn permits(&self, value: &str) -> bool {
        match self {
            Self::All => true,
            Self::Only(values) => values.contains(value),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn list(values: &[&str]) -> AccessRule {
        AccessRule::AllowList(values.iter().map(|v| v.to_string()).collect())
    }

    #[test]
    fn children_cannot_expand_parent_or_empty_intersections() {
        let policy =
            EffectiveAccess::compose([list(&["a", "b"]), list(&["b", "c"]), AccessRule::AllowAll]);
        assert!(policy.permits("b"));
        assert!(!policy.permits("a"));
        assert!(!policy.permits("c"));
        for rules in [
            vec![list(&["a"]), list(&["b"]), AccessRule::AllowAll],
            vec![AccessRule::DenyAll, AccessRule::Inherit, list(&["a"])],
            vec![list(&[]), AccessRule::AllowAll],
        ] {
            assert!(!EffectiveAccess::compose(rules).permits("a"));
        }
    }

    #[test]
    fn output_modes_are_explicit_and_observation_still_validates_rules() {
        for mode in ["buffered_full", "observe_only"] {
            let mut value = serde_json::json!({"schema_version":1,"name":"Mode fixture","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"output":{"mode":mode,"rules":[{"pattern":"synthetic","action":"block"}]}});
            let draft: PolicyDraft = serde_json::from_value(value.clone()).unwrap();
            assert!(draft.validate().is_ok());
            assert_eq!(serde_json::to_value(draft).unwrap(), value);
            value["output"]["rules"][0]["pattern"] = serde_json::json!("[");
            assert_eq!(
                serde_json::from_value::<PolicyDraft>(value)
                    .unwrap()
                    .validate(),
                Err(PolicyValidationError::InvalidInputRules)
            );
        }
        assert!(serde_json::from_value::<OutputMode>(serde_json::json!("windowed")).is_err());
    }

    #[test]
    fn explicit_modes_round_trip_and_unknown_fields_fail() {
        let rule = list(&["a", "b"]);
        assert_eq!(
            serde_json::from_value::<AccessRule>(serde_json::to_value(&rule).unwrap()).unwrap(),
            rule
        );
        assert!(
            serde_json::from_str::<AccessRule>(r#"{"mode":"allow_all","extra":true}"#).is_err()
        );
        assert!(serde_json::from_str::<AccessRule>(r#"{"mode":"allow_list"}"#).is_err());
        assert!(EffectiveAccess::compose([AccessRule::Inherit]).permits("a"));
    }

    #[test]
    fn image_consent_is_separate_bounded_and_duplicate_free() {
        let value = serde_json::json!({"schema_version":1,"name":"Images","models":{"mode":"inherit"},"providers":{"mode":"inherit"},"image_detectors":[{"detector":"image-check","configuration_fingerprint":"a".repeat(64),"consent_to_image_processing":true}]});
        let policy: PolicyDraft = serde_json::from_value(value.clone()).unwrap();
        assert!(policy.validate().is_ok());
        let mut duplicate = policy.clone();
        duplicate
            .image_detectors
            .push(policy.image_detectors[0].clone());
        assert!(duplicate.validate().is_err());
        let mut withdrawn = policy.clone();
        withdrawn.image_detectors[0].consent_to_image_processing = false;
        assert!(withdrawn.validate().is_err());
        let mut text_consent = value;
        text_consent["image_detectors"][0]
            .as_object_mut()
            .unwrap()
            .remove("consent_to_image_processing");
        text_consent["image_detectors"][0]["consent_to_external_processing"] =
            serde_json::json!(true);
        assert!(serde_json::from_value::<PolicyDraft>(text_consent).is_err());
    }

    #[test]
    fn draft_validation_is_bounded_and_does_not_reinterpret_empty_lists() {
        let mut draft = PolicyDraft {
            input_rules: Vec::new(),
            input_detectors: Vec::new(),
            image_detectors: Vec::new(),
            output: None,
            schema_version: 1,
            name: "Restricted models".into(),
            models: list(&[]),
            providers: AccessRule::Inherit,
        };
        assert_eq!(draft.validate(), Ok(()));
        assert!(!EffectiveAccess::compose([draft.models.clone()]).permits("any"));
        draft.schema_version = 2;
        assert_eq!(
            draft.validate(),
            Err(PolicyValidationError::UnsupportedVersion)
        );
        draft.schema_version = 1;
        for name in ["".to_string(), "bad\nname".to_string(), "x".repeat(201)] {
            draft.name = name;
            assert_eq!(draft.validate(), Err(PolicyValidationError::InvalidName));
        }
        draft.name = "Valid".into();
        for value in [
            "*".to_string(),
            " padded".to_string(),
            "".to_string(),
            "x".repeat(201),
            "bad\nvalue".to_string(),
        ] {
            draft.models = AccessRule::AllowList([value].into_iter().collect());
            assert_eq!(draft.validate(), Err(PolicyValidationError::InvalidValue));
        }
        draft.models = AccessRule::AllowList((0..1001).map(|n| format!("model-{n}")).collect());
        assert_eq!(draft.validate(), Err(PolicyValidationError::TooManyValues));
    }
}
