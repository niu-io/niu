//! Built-in open-source plugin (`webhook-audit`) implementing `MeteringObserver` and
//! outbox event delivery inspection (`/api/plugins/v1/webhook-audit/deliveries`).

use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

use axum::{Json, Router, extract::State, routing::get};
use niu_plugin_api::{
    EXTENSION_API_VERSION, ExtensionCapability, ExtensionManifest, FailureMode, MeteringAck,
    MeteringEvent, MeteringObserver, NiuExtension, PLUGIN_API_VERSION, PluginContext,
    PluginDescriptor, PluginFacet, PluginFuture,
};
use niu_plugin_sdk::{PluginRuntimeState, PluginServiceBuilder};
use serde_json::json;
use uuid::Uuid;

pub const PLUGIN_ID: &str = "webhook-audit";

pub fn descriptor() -> PluginDescriptor {
    PluginDescriptor {
        plugin_id: PLUGIN_ID.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        api_version: PLUGIN_API_VERSION.into(),
        facets: vec![PluginFacet::Observers, PluginFacet::Routes],
    }
}

#[derive(Clone, Debug)]
pub struct WebhookAuditPlugin {
    manifest: ExtensionManifest,
    seen_events: Arc<Mutex<HashSet<Uuid>>>,
}

impl Default for WebhookAuditPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl WebhookAuditPlugin {
    pub fn new() -> Self {
        Self {
            manifest: ExtensionManifest {
                id: PLUGIN_ID.into(),
                version: env!("CARGO_PKG_VERSION").into(),
                api_version: EXTENSION_API_VERSION.into(),
                capabilities: vec![ExtensionCapability::MeteringObserver],
                deadline_ms: 2_000,
                failure_mode: FailureMode::FailClosed,
            },
            seen_events: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn build_service(&self) -> PluginServiceBuilder {
        let routes = Router::<PluginRuntimeState>::new().route(
            "/api/plugins/v1/webhook-audit/deliveries",
            get(|State(state): State<PluginRuntimeState>| async move {
                let events = state.recorded_events();
                Json(json!({
                    "plugin_id": PLUGIN_ID,
                    "count": events.len(),
                    "events": events,
                }))
            }),
        );
        PluginServiceBuilder::new(PLUGIN_ID).merge_routes(routes)
    }
}

impl NiuExtension for WebhookAuditPlugin {
    fn manifest(&self) -> &ExtensionManifest {
        &self.manifest
    }
}

impl MeteringObserver for WebhookAuditPlugin {
    fn consume<'a>(
        &'a self,
        event: &'a MeteringEvent,
        _ctx: &'a PluginContext,
    ) -> PluginFuture<'a, MeteringAck> {
        Box::pin(async move {
            let mut seen = self.seen_events.lock().unwrap();
            seen.insert(event.event_id);
            Ok(MeteringAck {
                event_id: event.event_id,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_webhook_audit_manifest() {
        let plugin = WebhookAuditPlugin::new();
        assert!(plugin.manifest().validate().is_ok());
        assert!(descriptor().validate().is_ok());
    }
}
