use super::{ProviderAdapter, types::*};
use serde_json::Value;
pub struct FastRouter;
pub static ADAPTER: FastRouter = FastRouter;
impl ProviderAdapter for FastRouter {
    fn descriptor(&self) -> Descriptor {
        Descriptor {
            id: "fastrouter",
            name: "FastRouter",
            protocol: "openai",
            api_base: "https://fastrouter.wecitytech.com/v1",
            website: "https://fastrouter-docs.wecitytech.com/en/",
            price_support: PriceSupport::RequiresQualification,
            price_source: "https://fastrouter.wecitytech.com/api/pricing",
        }
    }
    fn pricing(&self, document: &Value) -> Pricing {
        super::babelark::native_ratios(document, self.descriptor().price_source)
    }
}
