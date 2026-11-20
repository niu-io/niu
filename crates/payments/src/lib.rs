#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

//! Payment protocol verification. This module neither collects nor credits funds.
pub mod stripe;
pub mod stripe_transport;
pub mod zhifux;
pub mod zhifux_transport;

pub mod epay;

pub mod mock;
