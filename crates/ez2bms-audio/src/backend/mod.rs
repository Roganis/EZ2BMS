//! Where rendered audio goes.

pub mod null;

#[cfg(feature = "cpal")]
pub mod cpal_backend;
