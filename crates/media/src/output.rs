//! Configured effective output dimensions and explicitly estimated media usage.
//! These mappings do not establish entitlement, reported usage or liability.
use crate::{Control, ValidationError, VideoSchema, valid_name};
use niu_metered_cost::{Quantity, Usage};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputSpecification {
    pub resolution: String,
    pub ratio: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum OutputEstimator {
    SeedancePixelsV1,
    OutputSecondsV1,
}
impl OutputEstimator {
    pub fn meter(self) -> &'static str {
        match self {
            Self::SeedancePixelsV1 => "video_tokens",
            Self::OutputSecondsV1 => "seconds",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputSchema {
    pub specifications: Vec<OutputSpecification>,
    pub estimator: OutputEstimator,
    pub estimator_revision: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EffectiveVideoOutput {
    pub specification: OutputSpecification,
    pub duration_seconds: u64,
    pub frames_per_second: u32,
    pub schema_revision: String,
    pub estimator: OutputEstimator,
    pub estimator_revision: String,
}
impl OutputSchema {
    pub(crate) fn validate(&self, schema: &VideoSchema) -> Result<(), ValidationError> {
        if !valid_name(&self.estimator_revision)
            || self.specifications.is_empty()
            || self.specifications.len() > 256
        {
            return Err(ValidationError::InvalidSchema);
        }
        for name in ["resolution", "ratio", "duration", "frames_per_second"] {
            let control = schema
                .controls
                .get(name)
                .ok_or(ValidationError::InvalidSchema)?;
            if control.default_value().is_none()
                && !schema.required_controls.iter().any(|v| v == name)
            {
                return Err(ValidationError::InvalidSchema);
            }
        }
        for name in ["duration", "frames_per_second"] {
            let Some(Control::Integer {
                minimum, maximum, ..
            }) = schema.controls.get(name)
            else {
                return Err(ValidationError::InvalidSchema);
            };
            if *minimum <= 0 || (name == "frames_per_second" && *maximum > i64::from(u32::MAX)) {
                return Err(ValidationError::InvalidSchema);
            }
        }
        if let (Some(Value::String(resolution)), Some(Value::String(ratio))) = (
            schema
                .controls
                .get("resolution")
                .and_then(Control::default_value),
            schema
                .controls
                .get("ratio")
                .and_then(Control::default_value),
        ) && !self
            .specifications
            .iter()
            .any(|v| v.resolution == resolution && v.ratio == ratio)
        {
            return Err(ValidationError::InvalidSchema);
        }
        for (index, spec) in self.specifications.iter().enumerate() {
            if spec.width == 0
                || spec.height == 0
                || !schema
                    .controls
                    .get("resolution")
                    .is_some_and(|v| v.accepts(&Value::String(spec.resolution.clone())))
                || !schema
                    .controls
                    .get("ratio")
                    .is_some_and(|v| v.accepts(&Value::String(spec.ratio.clone())))
                || self.specifications[..index]
                    .iter()
                    .any(|v| v.resolution == spec.resolution && v.ratio == spec.ratio)
            {
                return Err(ValidationError::InvalidSchema);
            }
        }
        Ok(())
    }

    pub(crate) fn resolve(
        &self,
        controls: &Map<String, Value>,
        revision: &str,
    ) -> Result<EffectiveVideoOutput, ValidationError> {
        let resolution = controls
            .get("resolution")
            .and_then(Value::as_str)
            .ok_or(ValidationError::InvalidControl)?;
        let ratio = controls
            .get("ratio")
            .and_then(Value::as_str)
            .ok_or(ValidationError::InvalidControl)?;
        let specification = self
            .specifications
            .iter()
            .find(|v| v.resolution == resolution && v.ratio == ratio)
            .ok_or(ValidationError::InvalidControl)?
            .clone();
        let duration_seconds = controls
            .get("duration")
            .and_then(Value::as_u64)
            .filter(|v| *v > 0)
            .ok_or(ValidationError::InvalidControl)?;
        let frames_per_second = controls
            .get("frames_per_second")
            .and_then(Value::as_u64)
            .and_then(|v| u32::try_from(v).ok())
            .filter(|v| *v > 0)
            .ok_or(ValidationError::InvalidControl)?;
        Ok(EffectiveVideoOutput {
            specification,
            duration_seconds,
            frames_per_second,
            schema_revision: revision.into(),
            estimator: self.estimator,
            estimator_revision: self.estimator_revision.clone(),
        })
    }
}

impl EffectiveVideoOutput {
    /// An estimate only. Neither estimator establishes a contractual maximum.
    pub fn estimate(
        &self,
        reference_video_seconds: Quantity,
    ) -> Result<Usage, niu_metered_cost::MeterError> {
        if self.duration_seconds == 0
            || self.frames_per_second == 0
            || self.specification.width == 0
            || self.specification.height == 0
            || !valid_name(&self.schema_revision)
            || !valid_name(&self.estimator_revision)
            || !valid_name(&self.specification.resolution)
            || !valid_name(&self.specification.ratio)
        {
            return Err(niu_metered_cost::MeterError::InvalidSpecification);
        }
        match self.estimator {
            OutputEstimator::SeedancePixelsV1 => niu_metered_cost::seedance_estimate(
                Quantity::integer(u128::from(self.duration_seconds)),
                reference_video_seconds,
                self.specification.width,
                self.specification.height,
                Quantity::integer(u128::from(self.frames_per_second)),
            ),
            OutputEstimator::OutputSecondsV1 if reference_video_seconds.numerator() == 0 => {
                Ok(Usage::Known {
                    meter: "seconds".into(),
                    quantity: Quantity::integer(u128::from(self.duration_seconds)),
                    provenance: niu_metered_cost::Provenance::Estimate,
                })
            }
            OutputEstimator::OutputSecondsV1 => {
                Err(niu_metered_cost::MeterError::InvalidSpecification)
            }
        }
    }
}
