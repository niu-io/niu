//! Contrast validation against the same defaults shipped to the dashboard.
use std::collections::BTreeMap;

const TOKENS: &str = include_str!("../../../branding/tokens.css");
const PAIRS: [(&str, &str); 4] = [
    ("background", "foreground"),
    ("primary", "primary-foreground"),
    ("sidebar", "sidebar-foreground"),
    ("accent", "accent-foreground"),
];

pub(super) fn readable(palette: &BTreeMap<String, String>, dark: bool) -> bool {
    PAIRS.iter().all(|(background, foreground)| {
        let values = [*background, *foreground].map(|token| {
            palette
                .get(token)
                .and_then(|color| hex_luminance(color))
                .or_else(|| {
                    if palette.contains_key(token) {
                        None
                    } else {
                        default_luminance(token, dark)
                    }
                })
        });
        match values {
            [Some(a), Some(b)] => (a.max(b) + 0.05) / (a.min(b) + 0.05) >= 4.5,
            _ => false,
        }
    })
}

fn hex_luminance(color: &str) -> Option<f64> {
    if color.len() != 7
        || !color.starts_with('#')
        || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    {
        return None;
    }
    let mut rgb = [0.0; 3];
    for (index, value) in rgb.iter_mut().enumerate() {
        let channel =
            f64::from(u8::from_str_radix(&color[1 + index * 2..3 + index * 2], 16).ok()?) / 255.0;
        *value = if channel <= 0.04045 {
            channel / 12.92
        } else {
            ((channel + 0.055) / 1.055).powf(2.4)
        };
    }
    Some(luminance(rgb))
}

fn luminance(rgb: [f64; 3]) -> f64 {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

fn default_luminance(token: &str, dark: bool) -> Option<f64> {
    // Read the checked-in opaque OKLCH defaults, rather than copying values
    // that can silently diverge from CSS. Unsupported source syntax fails closed.
    let (light, dark_block) = TOKENS.split_once(".dark,")?;
    let block = if dark { dark_block } else { light };
    let declaration = format!("--{token}:");
    let value = block
        .lines()
        .find_map(|line| line.trim().strip_prefix(&declaration))?
        .trim();
    let components = value
        .strip_prefix("oklch(")?
        .strip_suffix(");")?
        .split_whitespace()
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    let [lightness, chroma, hue] = components.as_slice() else {
        return None;
    };
    if !components.iter().all(|v| v.is_finite()) {
        return None;
    }
    // CSS Color 4 OKLCH -> OKLab -> linear sRGB. Shared defaults must be
    // in gamut; custom values are already six-digit sRGB hex.
    let a = chroma * hue.to_radians().cos();
    let b = chroma * hue.to_radians().sin();
    let l = (lightness + 0.3963377774 * a + 0.2158037573 * b).powi(3);
    let m = (lightness - 0.1055613458 * a - 0.0638541728 * b).powi(3);
    let s = (lightness - 0.0894841775 * a - 1.2914855480 * b).powi(3);
    let rgb = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
    rgb.iter()
        .all(|v| (0.0..=1.0).contains(v))
        .then(|| luminance(rgb))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contrast_matches_known_srgb_thresholds_and_shared_defaults() {
        assert_eq!(hex_luminance("#000000"), Some(0.0));
        assert_eq!(hex_luminance("#ffffff"), Some(1.0));
        assert!((hex_luminance("#ff0000").unwrap() - 0.2126).abs() < 1e-10);
        for dark in [false, true] {
            assert!(readable(&BTreeMap::new(), dark));
        }
        let mut palette = BTreeMap::from([
            ("background".into(), "#ffffff".into()),
            ("foreground".into(), "#767676".into()),
        ]);
        assert!(readable(&palette, false));
        palette.insert("foreground".into(), "#777777".into());
        assert!(!readable(&palette, false));
        for (background, foreground) in PAIRS {
            for dark in [false, true] {
                let palette = BTreeMap::from([
                    (background.into(), "#ffffff".into()),
                    (foreground.into(), "#ffffff".into()),
                ]);
                assert!(!readable(&palette, dark));
            }
        }
        assert!(!readable(
            &BTreeMap::from([("foreground".into(), "#ffffff".into())]),
            false
        ));
        assert!(!readable(
            &BTreeMap::from([("foreground".into(), "#000000".into())]),
            true
        ));
    }
}
