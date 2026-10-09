use niu_metered_cost::*;

fn dimensions() -> Dimensions {
    Dimensions {
        model: "fixture-video-version".into(),
        channel: "fixture-channel".into(),
        resolution: "720p".into(),
        reference_video: false,
    }
}

fn tariff() -> Tariff {
    Tariff {
        revision: "fixture-v1".into(),
        dimensions: dimensions(),
        meter: "video_tokens".into(),
        currency: "CNY".into(),
        decimal_places: 6,
        amount_units: 1_000_000,
        per_quantity: Quantity::integer(1_000_000),
        minimum_quantity: Quantity::integer(0),
        rounding: Rounding::HalfEven,
        effective_from: 100,
        effective_until: Some(200),
    }
}

fn reported(meter: &str, quantity: Quantity) -> Usage {
    Usage::Known {
        meter: meter.into(),
        quantity,
        provenance: Provenance::Reported,
    }
}

#[test]
fn seedance_fixture_remains_an_estimate_until_reported_usage_arrives() {
    let estimate = seedance_estimate(
        Quantity::integer(5),
        Quantity::integer(0),
        1280,
        720,
        Quantity::integer(24),
    )
    .unwrap();
    let receipt = calculate(&tariff(), &estimate).unwrap();
    assert_eq!(receipt.measured_quantity, Quantity::integer(108000));
    assert_eq!(receipt.amount_units, 108000);
    assert_eq!(receipt.provenance, Provenance::Estimate);
    let actual = calculate(
        &tariff(),
        &reported("video_tokens", Quantity::integer(109123)),
    )
    .unwrap();
    assert_eq!(actual.amount_units, 109123);
    assert_eq!(actual.provenance, Provenance::Reported);
}

#[test]
fn reference_video_is_included_once_and_fractional_estimates_are_exact() {
    let usage = seedance_estimate(
        Quantity::integer(5),
        Quantity::integer(2),
        1280,
        720,
        Quantity::integer(24),
    )
    .unwrap();
    assert_eq!(
        calculate(&tariff(), &usage).unwrap().measured_quantity,
        Quantity::integer(151200)
    );
    let usage = seedance_estimate(
        Quantity::new(1, 3).unwrap(),
        Quantity::integer(0),
        1,
        1,
        Quantity::integer(1),
    )
    .unwrap();
    assert_eq!(
        calculate(&tariff(), &usage).unwrap().measured_quantity,
        Quantity::new(1, 3072).unwrap()
    );
    for (width, height, duration, fps) in [(0, 1, 1, 1), (1, 0, 1, 1), (1, 1, 0, 1), (1, 1, 1, 0)] {
        assert_eq!(
            seedance_estimate(
                Quantity::integer(duration),
                Quantity::integer(0),
                width,
                height,
                Quantity::integer(fps)
            ),
            Err(MeterError::InvalidSpecification)
        );
    }
}

#[test]
fn no_unit_conversion_or_unknown_to_zero_fallback() {
    assert_eq!(
        calculate(&tariff(), &Usage::Unresolved),
        Err(MeterError::UnresolvedUsage)
    );
    assert_eq!(
        calculate(&tariff(), &reported("seconds", Quantity::integer(5))),
        Err(MeterError::MeterMismatch)
    );
    let mut seconds = tariff();
    seconds.meter = "seconds".into();
    seconds.per_quantity = Quantity::integer(1);
    seconds.amount_units = 250_000;
    assert_eq!(
        calculate(&seconds, &reported("seconds", Quantity::new(3, 2).unwrap()))
            .unwrap()
            .amount_units,
        375_000
    );
    assert_eq!(
        calculate(&seconds, &reported("seconds", Quantity::integer(0)))
            .unwrap()
            .amount_units,
        0
    );
}

#[test]
fn minimum_is_a_floor_and_already_metered_minimum_is_not_added_again() {
    let mut card = tariff();
    card.minimum_quantity = Quantity::integer(100);
    for (quantity, expected) in [(99, 100), (100, 100), (101, 101)] {
        let receipt = calculate(
            &card,
            &reported("video_tokens", Quantity::integer(quantity)),
        )
        .unwrap();
        assert_eq!(receipt.amount_units, expected);
        assert_eq!(receipt.measured_quantity, Quantity::integer(quantity));
        assert_eq!(
            receipt.billable_quantity,
            Quantity::integer(u128::from(expected))
        );
    }
    card.minimum_quantity = Quantity::integer(0);
    assert_eq!(
        calculate(&card, &reported("video_tokens", Quantity::integer(100)))
            .unwrap()
            .amount_units,
        100
    );
}

#[test]
fn rounding_is_only_at_final_currency_units_and_ties_are_even() {
    let mut card = tariff();
    card.amount_units = 1;
    card.per_quantity = Quantity::integer(1);
    for (n, down, up, even) in [
        (1, 0, 1, 0),
        (3, 1, 2, 2),
        (5, 2, 3, 2),
        (7, 3, 4, 4),
        (8, 4, 4, 4),
    ] {
        for (rounding, expected) in [
            (Rounding::Down, down),
            (Rounding::Up, up),
            (Rounding::HalfEven, even),
        ] {
            card.rounding = rounding;
            assert_eq!(
                calculate(
                    &card,
                    &reported("video_tokens", Quantity::new(n, 2).unwrap())
                )
                .unwrap()
                .amount_units,
                expected
            );
        }
    }
    card.per_quantity = Quantity::new(3, 2).unwrap();
    card.rounding = Rounding::Up;
    assert_eq!(
        calculate(&card, &reported("video_tokens", Quantity::integer(1)))
            .unwrap()
            .amount_units,
        1
    );
}

#[test]
fn exact_dimensions_and_half_open_intervals_reject_ambiguity() {
    let original = tariff();
    let mut next = original.clone();
    next.revision = "fixture-v2".into();
    next.effective_from = 200;
    next.effective_until = None;
    next.amount_units *= 2;
    let cards = [original.clone(), next];
    assert_eq!(
        select_tariff(&cards, &dimensions(), 99),
        Err(MeterError::NoMatchingTariff)
    );
    assert_eq!(
        select_tariff(&cards, &dimensions(), 100).unwrap().revision,
        "fixture-v1"
    );
    assert_eq!(
        select_tariff(&cards, &dimensions(), 199).unwrap().revision,
        "fixture-v1"
    );
    assert_eq!(
        select_tariff(&cards, &dimensions(), 200).unwrap().revision,
        "fixture-v2"
    );
    let overlapping = [original.clone(), original];
    assert_eq!(
        select_tariff(&overlapping, &dimensions(), 150),
        Err(MeterError::AmbiguousTariff)
    );
    for field in 0..4 {
        let mut other = dimensions();
        match field {
            0 => other.model.push('x'),
            1 => other.channel.push('x'),
            2 => other.resolution = "1080p".into(),
            _ => other.reference_video = true,
        }
        assert_eq!(
            select_tariff(&cards, &other, 150),
            Err(MeterError::NoMatchingTariff)
        );
    }
}

#[test]
fn pinned_card_reproduces_history_without_repricing() {
    let saved = tariff();
    let usage = reported("video_tokens", Quantity::integer(108000));
    let old = calculate(&saved, &usage).unwrap();
    let mut changed = saved.clone();
    changed.revision = "fixture-v2".into();
    changed.amount_units *= 3;
    assert_ne!(
        calculate(&changed, &usage).unwrap().amount_units,
        old.amount_units
    );
    assert_eq!(calculate(&saved, &usage).unwrap(), old);
}

#[test]
fn overflow_fails_without_wrapping_and_factors_cancel_before_multiplication() {
    assert_eq!(Quantity::new(1, 0), Err(MeterError::InvalidQuantity));
    let mut card = tariff();
    card.amount_units = u64::MAX;
    card.per_quantity = Quantity::integer(u128::MAX);
    assert_eq!(
        calculate(
            &card,
            &reported("video_tokens", Quantity::integer(u128::MAX))
        )
        .unwrap()
        .amount_units,
        u64::MAX
    );
    card.per_quantity = Quantity::integer(1);
    assert_eq!(
        calculate(
            &card,
            &reported("video_tokens", Quantity::integer(u128::MAX))
        ),
        Err(MeterError::Overflow)
    );
    card.amount_units = 1;
    assert_eq!(
        calculate(
            &card,
            &reported("video_tokens", Quantity::integer(u128::from(u64::MAX) + 1))
        ),
        Err(MeterError::Overflow)
    );
}

#[test]
fn invalid_configuration_cannot_be_selected_or_priced() {
    for field in 0..7 {
        let mut card = tariff();
        match field {
            0 => card.revision.clear(),
            1 => card.meter = " seconds".into(),
            2 => card.currency = "cny".into(),
            3 => card.decimal_places = 19,
            4 => card.per_quantity = Quantity::integer(0),
            5 => card.effective_until = Some(100),
            _ => card.dimensions.model = "bad\nmodel".into(),
        }
        assert_eq!(card.validate(), Err(MeterError::InvalidTariff));
        assert_eq!(
            calculate(&card, &reported("video_tokens", Quantity::integer(1))),
            Err(MeterError::InvalidTariff)
        );
        assert_eq!(
            select_tariff(&[card], &dimensions(), 150),
            Err(MeterError::InvalidTariff)
        );
    }
}
