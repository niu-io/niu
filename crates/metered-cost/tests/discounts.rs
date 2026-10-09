use niu_metered_cost::*;

fn dims() -> Dimensions {
    Dimensions {
        model: "fixture-video-v1".into(),
        channel: "fixture-channel".into(),
        resolution: "720p".into(),
        reference_video: false,
    }
}
fn card() -> Tariff {
    Tariff {
        revision: "customer-v1".into(),
        dimensions: dims(),
        meter: "seconds".into(),
        currency: "CNY".into(),
        decimal_places: 6,
        amount_units: 100,
        per_quantity: Quantity::integer(1),
        minimum_quantity: Quantity::integer(0),
        rounding: Rounding::HalfEven,
        effective_from: 10,
        effective_until: Some(100),
    }
}
fn rule(
    revision: &str,
    priority: i32,
    stacking: Stacking,
    numerator: u128,
    denominator: u128,
) -> Discount {
    Discount {
        revision: revision.into(),
        dimensions: Some(dims()),
        offer: Some("fixture-offer".into()),
        customer: Some("fixture-customer".into()),
        effective_from: 20,
        effective_until: Some(90),
        priority,
        stacking,
        multiplier: Quantity::new(numerator, denominator).unwrap(),
    }
}
fn context(at: i64) -> PricingContext<'static> {
    static DIMENSIONS: std::sync::LazyLock<Dimensions> = std::sync::LazyLock::new(dims);
    PricingContext {
        dimensions: &DIMENSIONS,
        offer: "fixture-offer",
        customer: "fixture-customer",
        at,
    }
}
fn usage() -> Usage {
    Usage::Known {
        meter: "seconds".into(),
        quantity: Quantity::integer(1),
        provenance: Provenance::Reported,
    }
}

#[test]
fn priority_and_stacking_are_explicit_and_independent_of_input_order() {
    let a = rule("low", 1, Stacking::Multiply, 1, 2);
    let b = rule("high", 5, Stacking::Multiply, 4, 5);
    let cards = [card()];
    let first = pin_pricing(&cards, &[a.clone(), b.clone()], &context(30)).unwrap();
    let second = pin_pricing(&cards, &[b.clone(), a.clone()], &context(30)).unwrap();
    assert_eq!(first, second);
    let receipt = first.calculate(&usage()).unwrap();
    assert_eq!(receipt.amount_units, 40);
    assert_eq!(receipt.discount_revisions, ["high", "low"]);
    let exclusive = rule("exclusive", 9, Stacking::Exclusive, 7, 10);
    let pinned = pin_pricing(&cards, &[a, b, exclusive], &context(30)).unwrap();
    assert_eq!(pinned.calculate(&usage()).unwrap().amount_units, 70);
    assert_eq!(pinned.discounts().len(), 1);
}

#[test]
fn lower_exclusive_rule_is_not_silently_stacked() {
    let rules = [
        rule("top", 9, Stacking::Multiply, 4, 5),
        rule("exclusive", 5, Stacking::Exclusive, 1, 2),
        rule("bottom", 1, Stacking::Multiply, 1, 2),
    ];
    let receipt = pin_pricing(&[card()], &rules, &context(30))
        .unwrap()
        .calculate(&usage())
        .unwrap();
    assert_eq!(receipt.amount_units, 40);
    assert_eq!(receipt.discount_revisions, ["top", "bottom"]);
}

#[test]
fn dimensions_offer_customer_and_effective_intervals_must_all_match() {
    let rules = [rule("discount", 1, Stacking::Multiply, 1, 2)];
    for (at, expected) in [(19, 100), (20, 50), (89, 50), (90, 100)] {
        assert_eq!(
            pin_pricing(&[card()], &rules, &context(at))
                .unwrap()
                .calculate(&usage())
                .unwrap()
                .amount_units,
            expected
        );
    }
    for field in 0..6 {
        let mut dimensions = dims();
        let mut c = context(30);
        match field {
            0 => dimensions.model.push('x'),
            1 => dimensions.channel.push('x'),
            2 => dimensions.resolution = "1080p".into(),
            3 => dimensions.reference_video = true,
            4 => c.offer = "other-offer",
            _ => c.customer = "other-customer",
        }
        c.dimensions = &dimensions;
        let mut tariff = card();
        tariff.dimensions = dimensions.clone();
        let receipt = pin_pricing(&[tariff], &rules, &c)
            .unwrap()
            .calculate(&usage())
            .unwrap();
        assert_eq!(receipt.amount_units, 100);
        assert!(receipt.discount_revisions.is_empty());
    }
    let mut all = rules[0].clone();
    all.dimensions = None;
    all.offer = None;
    all.customer = None;
    let mut c = context(30);
    c.offer = "other-offer";
    c.customer = "other-customer";
    assert_eq!(
        pin_pricing(&[card()], &[all], &c)
            .unwrap()
            .calculate(&usage())
            .unwrap()
            .amount_units,
        50
    );
}

#[test]
fn discounts_apply_before_final_rounding_without_currency_conversion() {
    let mut tariff = card();
    tariff.amount_units = 1;
    let rules = [
        rule("half", 2, Stacking::Multiply, 1, 2),
        rule("two-thirds", 1, Stacking::Multiply, 2, 3),
    ];
    let measured = Usage::Known {
        meter: "seconds".into(),
        quantity: Quantity::integer(3),
        provenance: Provenance::Reported,
    };
    let receipt = pin_pricing(&[tariff], &rules, &context(30))
        .unwrap()
        .calculate(&measured)
        .unwrap();
    assert_eq!(receipt.amount_units, 1);
    assert_eq!(receipt.currency, "CNY");
    assert_eq!(receipt.decimal_places, 6);
    assert_eq!(receipt.measured_quantity, Quantity::integer(3));
}

#[test]
fn snapshot_keeps_old_cards_and_rules_after_active_configuration_changes() {
    let mut cards = [card()];
    let mut rules = [rule("old-discount", 1, Stacking::Multiply, 1, 2)];
    let pinned = pin_pricing(&cards, &rules, &context(30)).unwrap();
    let original = pinned.calculate(&usage()).unwrap();
    cards[0].amount_units = 200;
    cards[0].revision = "customer-v2".into();
    rules[0].multiplier = Quantity::integer(1);
    rules[0].revision = "new-discount".into();
    assert_eq!(
        pin_pricing(&cards, &rules, &context(30))
            .unwrap()
            .calculate(&usage())
            .unwrap()
            .amount_units,
        200
    );
    assert_eq!(pinned.calculate(&usage()).unwrap(), original);
    assert_eq!(pinned.tariff().revision, "customer-v1");
    assert_eq!(pinned.discounts()[0].revision, "old-discount");
    assert_eq!(pinned.selected_at(), 30);
}

#[test]
fn invalid_and_ambiguous_rules_fail_even_if_some_are_ineligible() {
    let one = rule("one", 1, Stacking::Multiply, 1, 2);
    let two = rule("two", 1, Stacking::Exclusive, 3, 4);
    assert_eq!(
        pin_pricing(&[card()], &[one.clone(), two], &context(30)),
        Err(MeterError::AmbiguousDiscount)
    );
    assert_eq!(
        pin_pricing(&[card()], &[one.clone(), one.clone()], &context(30)),
        Err(MeterError::InvalidDiscount)
    );
    for field in 0..7 {
        let mut invalid = one.clone();
        match field {
            0 => invalid.revision.clear(),
            1 => invalid.offer = Some(" ".into()),
            2 => invalid.customer = Some("bad\nname".into()),
            3 => invalid.effective_until = Some(20),
            4 => invalid.multiplier = Quantity::new(3, 2).unwrap(),
            5 => invalid.dimensions.as_mut().unwrap().model.clear(),
            _ => invalid.revision = "x".repeat(257),
        }
        assert_eq!(
            pin_pricing(&[card()], &[invalid], &context(95)),
            Err(MeterError::InvalidDiscount)
        );
    }
    assert_eq!(
        pin_pricing(&[card()], &vec![one; 65], &context(30)),
        Err(MeterError::TooManyDiscounts)
    );
    assert_eq!(
        pin_pricing(&[], &[], &context(30)),
        Err(MeterError::NoMatchingTariff)
    );
}

#[test]
fn explicit_free_discount_does_not_turn_unknown_usage_into_zero() {
    let snapshot = pin_pricing(
        &[card()],
        &[rule("free", 1, Stacking::Exclusive, 0, 1)],
        &context(30),
    )
    .unwrap();
    assert_eq!(snapshot.calculate(&usage()).unwrap().amount_units, 0);
    assert_eq!(
        snapshot.calculate(&Usage::Unresolved),
        Err(MeterError::UnresolvedUsage)
    );
    let wrong_meter = Usage::Known {
        meter: "video_tokens".into(),
        quantity: Quantity::integer(1),
        provenance: Provenance::Reported,
    };
    assert_eq!(
        snapshot.calculate(&wrong_meter),
        Err(MeterError::MeterMismatch)
    );
}
