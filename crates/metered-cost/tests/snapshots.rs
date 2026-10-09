use niu_metered_cost::*;

fn snapshot() -> PricingSnapshot {
    let dimensions = Dimensions {
        model: "fixture-video".into(),
        channel: "fixture".into(),
        resolution: "720p".into(),
        reference_video: false,
    };
    let card = Tariff {
        revision: "customer-v1".into(),
        dimensions: dimensions.clone(),
        meter: "video_tokens".into(),
        currency: "CNY".into(),
        decimal_places: 9,
        amount_units: 1,
        per_quantity: Quantity::integer(u128::MAX),
        minimum_quantity: Quantity::integer(0),
        rounding: Rounding::Up,
        effective_from: 10,
        effective_until: Some(100),
    };
    pin_pricing(
        &[card],
        &[],
        &PricingContext {
            dimensions: &dimensions,
            offer: "fixture-offer",
            customer: "fixture-customer",
            at: 20,
        },
    )
    .unwrap()
}

#[test]
fn versioned_snapshot_preserves_large_exact_quantities_and_recalculates_after_decode() {
    let saved = snapshot();
    let encoded = saved.encode().unwrap();
    assert!(encoded.contains(&format!("\"numerator\":\"{}\"", u128::MAX)));
    let decoded = PricingSnapshot::decode(&encoded).unwrap();
    assert_eq!(decoded, saved);
    let actual = Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(u128::MAX),
        provenance: Provenance::Reported,
    };
    assert_eq!(
        saved.calculate(&actual).unwrap(),
        decoded.calculate(&actual).unwrap()
    );
    assert_eq!(decoded.calculate(&actual).unwrap().amount_units, 1);
}

#[test]
fn persistence_rejects_unknown_fields_versions_and_invalid_exact_quantities() {
    let original: serde_json::Value = serde_json::from_str(&snapshot().encode().unwrap()).unwrap();
    for case in 0..9 {
        let mut changed = original.clone();
        match case {
            0 => changed["version"] = 2.into(),
            1 => changed["multiplier"] = 0.into(),
            2 => changed["tariff"]["supplier_cost"] = 1.into(),
            3 => changed["tariff"]["per_quantity"]["denominator"] = "0".into(),
            4 => changed["tariff"]["per_quantity"]["numerator"] = "01".into(),
            5 => changed["tariff"]["per_quantity"]["numerator"] = 1.into(),
            6 => {
                changed["tariff"]["per_quantity"]["numerator"] =
                    "340282366920938463463374607431768211456".into()
            }
            7 => changed["selected_at"] = 100.into(),
            _ => {
                changed["tariff"]["per_quantity"]["numerator"] = "2".into();
                changed["tariff"]["per_quantity"]["denominator"] = "2".into();
            }
        }
        assert_eq!(
            PricingSnapshot::decode(&changed.to_string()),
            Err(MeterError::InvalidSnapshot)
        );
    }
    assert_eq!(
        PricingSnapshot::decode(&" ".repeat(131073)),
        Err(MeterError::InvalidSnapshot)
    );
}
