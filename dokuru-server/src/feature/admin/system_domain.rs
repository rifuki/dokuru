pub struct ConfigFieldSpec {
    pub key: &'static str,
    pub path: &'static [&'static str],
    pub env_keys: &'static [&'static str],
}

pub const CONFIG_FIELD_SPECS: &[ConfigFieldSpec] = &[
    ConfigFieldSpec {
        key: "bootstrap.enabled",
        path: &["bootstrap", "enabled"],
        env_keys: &["DOKURU__BOOTSTRAP__ENABLED"],
    },
    ConfigFieldSpec {
        key: "bootstrap.admin_email",
        path: &["bootstrap", "admin_email"],
        env_keys: &["DOKURU__BOOTSTRAP__ADMIN_EMAIL"],
    },
    ConfigFieldSpec {
        key: "bootstrap.admin_username",
        path: &["bootstrap", "admin_username"],
        env_keys: &["DOKURU__BOOTSTRAP__ADMIN_USERNAME"],
    },
    ConfigFieldSpec {
        key: "bootstrap.admin_name",
        path: &["bootstrap", "admin_name"],
        env_keys: &["DOKURU__BOOTSTRAP__ADMIN_NAME"],
    },
    ConfigFieldSpec {
        key: "server.port",
        path: &["server", "port"],
        env_keys: &["PORT", "DOKURU__SERVER__PORT"],
    },
    ConfigFieldSpec {
        key: "server.cors_allowed_origins",
        path: &["server", "cors_allowed_origins"],
        env_keys: &["DOKURU__SERVER__CORS_ALLOWED_ORIGINS"],
    },
    ConfigFieldSpec {
        key: "app.rust_log",
        path: &["app", "rust_log"],
        env_keys: &["DOKURU__APP__RUST_LOG"],
    },
    ConfigFieldSpec {
        key: "cookie.same_site",
        path: &["cookie", "same_site"],
        env_keys: &["DOKURU__COOKIE__SAME_SITE"],
    },
    ConfigFieldSpec {
        key: "cookie.secure",
        path: &["cookie", "secure"],
        env_keys: &["DOKURU__COOKIE__SECURE"],
    },
    ConfigFieldSpec {
        key: "cookie.http_only",
        path: &["cookie", "http_only"],
        env_keys: &["DOKURU__COOKIE__HTTP_ONLY"],
    },
    ConfigFieldSpec {
        key: "upload.dir",
        path: &["upload", "dir"],
        env_keys: &["DOKURU__UPLOAD__DIR"],
    },
    ConfigFieldSpec {
        key: "upload.base_url",
        path: &["upload", "base_url"],
        env_keys: &["DOKURU__UPLOAD__BASE_URL"],
    },
    ConfigFieldSpec {
        key: "email.from_email",
        path: &["email", "from_email"],
        env_keys: &["DOKURU__EMAIL__FROM_EMAIL"],
    },
    ConfigFieldSpec {
        key: "email.resend_api_key",
        path: &["email", "resend_api_key"],
        env_keys: &["DOKURU__EMAIL__RESEND_API_KEY"],
    },
    ConfigFieldSpec {
        key: "database.url",
        path: &["database", "url"],
        env_keys: &["DOKURU__DATABASE__URL"],
    },
    ConfigFieldSpec {
        key: "database.max_connections",
        path: &["database", "max_connections"],
        env_keys: &["DOKURU__DATABASE__MAX_CONNECTIONS"],
    },
    ConfigFieldSpec {
        key: "database.min_connections",
        path: &["database", "min_connections"],
        env_keys: &["DOKURU__DATABASE__MIN_CONNECTIONS"],
    },
    ConfigFieldSpec {
        key: "redis.url",
        path: &["redis", "url"],
        env_keys: &["DOKURU__REDIS__URL"],
    },
    ConfigFieldSpec {
        key: "auth.access_secret",
        path: &["auth", "access_secret"],
        env_keys: &["DOKURU__AUTH__ACCESS_SECRET"],
    },
    ConfigFieldSpec {
        key: "auth.refresh_secret",
        path: &["auth", "refresh_secret"],
        env_keys: &["DOKURU__AUTH__REFRESH_SECRET"],
    },
    ConfigFieldSpec {
        key: "auth.access_expiry_secs",
        path: &["auth", "access_expiry_secs"],
        env_keys: &["DOKURU__AUTH__ACCESS_EXPIRY_SECS"],
    },
    ConfigFieldSpec {
        key: "auth.refresh_expiry_secs",
        path: &["auth", "refresh_expiry_secs"],
        env_keys: &["DOKURU__AUTH__REFRESH_EXPIRY_SECS"],
    },
];

pub fn toml_value_to_string(item: &toml_edit::Item) -> String {
    item.as_str()
        .map(str::to_string)
        .or_else(|| item.as_bool().map(|value| value.to_string()))
        .or_else(|| item.as_integer().map(|value| value.to_string()))
        .or_else(|| item.as_float().map(|value| value.to_string()))
        .unwrap_or_else(|| item.to_string().trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_field_specs_cover_expected_public_keys() {
        let keys: Vec<&str> = CONFIG_FIELD_SPECS.iter().map(|spec| spec.key).collect();

        assert!(keys.contains(&"server.port"));
        assert!(keys.contains(&"database.url"));
        assert!(keys.contains(&"auth.refresh_expiry_secs"));
        assert_eq!(CONFIG_FIELD_SPECS.len(), 22);
    }

    #[test]
    fn config_field_specs_include_env_overrides() {
        let database_url = CONFIG_FIELD_SPECS
            .iter()
            .find(|spec| spec.key == "database.url")
            .expect("database.url spec exists");

        assert_eq!(database_url.path, &["database", "url"]);
        assert_eq!(database_url.env_keys, &["DOKURU__DATABASE__URL"]);
    }

    #[test]
    fn formats_scalar_toml_values_for_source_display() {
        let document = "string = 'value'\nbool = true\ninteger = 42\nfloat = 1.5\n"
            .parse::<toml_edit::DocumentMut>()
            .expect("valid toml document");

        assert_eq!(toml_value_to_string(&document["string"]), "value");
        assert_eq!(toml_value_to_string(&document["bool"]), "true");
        assert_eq!(toml_value_to_string(&document["integer"]), "42");
        assert_eq!(toml_value_to_string(&document["float"]), "1.5");
    }
}
