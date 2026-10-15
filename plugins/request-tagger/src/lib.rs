//! Built-in open-source plugin (`request-tagger`) implementing `PolicyHook` and `RouteSelector`
//! alongside a configuration inspection HTTP route (`/api/plugins/v1/request-tagger/rules`).

use axum::{Json, Router, routing::get};
use niu_plugin_api::{
    BoundPolicyDecision, EXTENSION_API_VERSION, ExtensionCapability, ExtensionManifest,
    FailureMode, NiuExtension, PLUGIN_API_VERSION, PluginContext, PluginDescriptor, PluginFacet,
    PluginFuture, PolicyDecision, PolicyHook, PolicyInput, RouteCandidate, RouteSelection,
    RouteSelector,
};
use niu_plugin_sdk::{PluginRuntimeState, PluginServiceBuilder};
use serde_json::json;

pub const PLUGIN_ID: &str = "request-tagger";

pub fn descriptor() -> PluginDescriptor {
    PluginDescriptor {
        plugin_id: PLUGIN_ID.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        api_version: PLUGIN_API_VERSION.into(),
        facets: vec![PluginFacet::Hooks, PluginFacet::Routes],
    }
}

#[derive(Clone, Debug)]
pub struct RequestTaggerPlugin {
    manifest: ExtensionManifest,
    blocked_keyword: String,
    redact_pointer: String,
}

impl Default for RequestTaggerPlugin {
    fn default() -> Self {
        Self::new("[BLOCK_POLICY]", "/secret")
    }
}

impl RequestTaggerPlugin {
    pub fn new(blocked_keyword: impl Into<String>, redact_pointer: impl Into<String>) -> Self {
        Self {
            manifest: ExtensionManifest {
                id: PLUGIN_ID.into(),
                version: env!("CARGO_PKG_VERSION").into(),
                api_version: EXTENSION_API_VERSION.into(),
                capabilities: vec![
                    ExtensionCapability::Policy,
                    ExtensionCapability::RouteSelection,
                ],
                deadline_ms: 1_000,
                failure_mode: FailureMode::FailClosed,
            },
            blocked_keyword: blocked_keyword.into(),
            redact_pointer: redact_pointer.into(),
        }
    }

    pub fn build_service(&self) -> PluginServiceBuilder {
        let blocked = self.blocked_keyword.clone();
        let redact = self.redact_pointer.clone();
        let routes = Router::<PluginRuntimeState>::new().route(
            "/api/plugins/v1/request-tagger/rules",
            get(move || {
                let blocked = blocked.clone();
                let redact = redact.clone();
                async move {
                    Json(json!({
                        "plugin_id": PLUGIN_ID,
                        "blocked_keyword": blocked,
                        "redact_pointer": redact,
                        "route_selection_strategy": "lowest_max_cash_nanos",
                    }))
                }
            }),
        );
        PluginServiceBuilder::new(PLUGIN_ID).merge_routes(routes)
    }
}

impl NiuExtension for RequestTaggerPlugin {
    fn manifest(&self) -> &ExtensionManifest {
        &self.manifest
    }
}

impl PolicyHook for RequestTaggerPlugin {
    fn evaluate<'a>(
        &'a self,
        input: PolicyInput,
        _ctx: &'a PluginContext,
    ) -> PluginFuture<'a, BoundPolicyDecision> {
        Box::pin(async move {
            let serialized = input
                .content
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_default();
            let decision = if serialized.contains(&self.blocked_keyword) {
                PolicyDecision::Deny {
                    reason_code: "blocked_keyword_detected".into(),
                }
            } else if input
                .content
                .as_ref()
                .is_some_and(|v| v.pointer(&self.redact_pointer).is_some())
            {
                PolicyDecision::Redact {
                    reason_code: "redacted_secret_field".into(),
                    json_pointers: vec![self.redact_pointer.clone()],
                }
            } else {
                PolicyDecision::Allow {
                    reason_code: "request_tagger_allow".into(),
                }
            };
            Ok(BoundPolicyDecision {
                binding: input.binding,
                decision,
            })
        })
    }
}

impl RouteSelector for RequestTaggerPlugin {
    fn select<'a>(
        &'a self,
        mut candidates: Vec<RouteCandidate>,
        _ctx: &'a PluginContext,
    ) -> PluginFuture<'a, RouteSelection> {
        Box::pin(async move {
            candidates.sort_by_key(|c| c.max_cash_nanos.parse::<u128>().unwrap_or(u128::MAX));
            Ok(RouteSelection {
                candidate_ids: candidates.into_iter().map(|c| c.id).collect(),
                reason_code: "lowest_max_cash_nanos".into(),
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::Arc,
        time::{Duration, Instant},
    };

    use niu_plugin_api::{
        CancellationSource, PluginHookRegistry, PolicyBinding, PolicyBindingInput, PolicyStage,
        PrincipalContext, Protocol, TenantContext,
    };
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn evaluates_policy_and_reorders_routes_by_lowest_cost() {
        let plugin = Arc::new(RequestTaggerPlugin::default());
        assert!(plugin.manifest().validate().is_ok());

        let mut registry = PluginHookRegistry::new();
        registry.register_policy_hook(plugin.clone());
        registry.register_route_selector(plugin);

        let cancel = CancellationSource::new();
        let ctx = PluginContext::from_core(
            TenantContext::from_core(Uuid::new_v4(), Uuid::new_v4()),
            PrincipalContext::from_core(Uuid::new_v4(), vec!["gpt-5.4-mini".into()]),
            Uuid::new_v4(),
            None,
            Instant::now() + Duration::from_secs(5),
            cancel.token(),
            "req-tagger-test-1".into(),
        )
        .unwrap();

        let content = json!({"prompt": "hello", "secret": "SensitiveToken"});
        let binding = PolicyBinding::for_input(PolicyBindingInput {
            policy_id: "request-tagger.default",
            revision: "v1",
            stage: PolicyStage::Request,
            required: true,
            protocol: Protocol::OpenAiChatV1,
            model_alias: "gpt-5.4-mini",
            content: Some(&content),
            issued_at_unix_ms: 1_000,
            expires_at_unix_ms: 2_000,
        })
        .unwrap();
        let redact_input = PolicyInput {
            protocol: Protocol::OpenAiChatV1,
            model_alias: "gpt-5.4-mini".into(),
            binding,
            content: Some(content),
        };
        let decisions = registry
            .evaluate_policies(&ctx, &redact_input, 1_500)
            .await
            .unwrap();
        assert_eq!(
            decisions[0].decision,
            PolicyDecision::Redact {
                reason_code: "redacted_secret_field".into(),
                json_pointers: vec!["/secret".into()],
            }
        );

        let expensive = Uuid::new_v4();
        let cheap = Uuid::new_v4();
        let ordered = registry
            .select_routes(
                &ctx,
                &[
                    RouteCandidate {
                        id: expensive,
                        model_alias: "gpt-5.4-mini".into(),
                        offer_revision: "rev-1".into(),
                        max_cash_nanos: "500000".into(),
                        required_protocol: Protocol::OpenAiChatV1,
                    },
                    RouteCandidate {
                        id: cheap,
                        model_alias: "gpt-5.4-mini".into(),
                        offer_revision: "rev-2".into(),
                        max_cash_nanos: "150000".into(),
                        required_protocol: Protocol::OpenAiChatV1,
                    },
                ],
            )
            .await
            .unwrap();
        assert_eq!(ordered, vec![cheap, expensive]);
    }
}
