use std::sync::OnceLock;

use specter::fingerprint::profiles::FingerprintProfile;
use specter::Client;

use crate::rules::TlsPreset;

fn chrome_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .fingerprint(FingerprintProfile::Chrome148)
            .build()
            .expect("specter chrome client")
    })
}

fn firefox_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .fingerprint(FingerprintProfile::Firefox151)
            .build()
            .expect("specter firefox client")
    })
}

pub fn specter_client(preset: &TlsPreset) -> &'static Client {
    match preset {
        TlsPreset::Chrome => chrome_client(),
        TlsPreset::Firefox => firefox_client(),
    }
}

pub fn preset_name(preset: &TlsPreset) -> &'static str {
    match preset {
        TlsPreset::Chrome => "chrome",
        TlsPreset::Firefox => "firefox",
    }
}
