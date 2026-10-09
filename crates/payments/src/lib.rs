//! Payment protocol verification. This module neither collects nor credits funds.
pub mod stripe;
pub mod stripe_transport;
pub mod zhifux;
pub mod zhifux_transport;

pub mod epay;
