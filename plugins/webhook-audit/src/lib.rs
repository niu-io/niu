//! Built-in open-source plugin (`webhook-audit`) implementing `MeteringObserver` and
//! outbox event delivery inspection (`/api/plugins/v1/webhook-audit/deliveries`).

use std::{
    collections::{HashSet, VecDeque},
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
const MAX_SEEN_EVENTS: usize = 4096;

#[derive(Debug, Default)]
struct BoundedSeenEvents {
    set: HashSet<Uuid>,
    order: VecDeque<Uuid>,
}

impl BoundedSeenEvents {
    fn insert(&mut self, id: Uuid) {
        if self.set.insert(id) {
            if self.order.len() >= MAX_SEEN_EVENTS
                && let Some(evicted) = self.order.pop_front()
            {
                self.set.remove(&evicted);
            }
            self.order.push_back(id);
        }
    }
}

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
    seen_events: Arc<Mutex<BoundedSeenEvents>>,
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
            seen_events: Arc::new(Mutex::new(BoundedSeenEvents::default())),
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
            let mut seen = self
                .seen_events
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
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

    #[test]
    fn bounded_seen_events_evicts_oldest_entries() {
        let mut seen = BoundedSeenEvents::default();
        let first = Uuid::new_v4();
        seen.insert(first);
        for _ in 0..MAX_SEEN_EVENTS {
            seen.insert(Uuid::new_v4());
        }
        assert_eq!(seen.set.len(), MAX_SEEN_EVENTS);
        assert_eq!(seen.order.len(), MAX_SEEN_EVENTS);
        assert!(!seen.set.contains(&first));
    }
}
