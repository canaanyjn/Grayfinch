PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO apps (
  id,
  app_key,
  name,
  description,
  client_token_hash
) VALUES (
  'app_demo_desktop',
  'desktop-suite',
  'Desktop Suite',
  'Demonstrates production targeting by platform, version, and percentage.',
  '022b744317033d1944718ac22383f112eda6da8484949152f6d2bf813bb6cfcf'
);

INSERT OR IGNORE INTO config_versions (
  id,
  app_id,
  environment,
  version,
  label,
  config_json
) VALUES
  (
    'ver_demo_12',
    'app_demo_desktop',
    'production',
    12,
    'Stable release',
    '{"apiEndpoint":"https://api.example.com","featureFlags":{"newSidebar":false,"fastSync":true},"retry":{"maxAttempts":3,"backoffMs":800}}'
  ),
  (
    'ver_demo_13',
    'app_demo_desktop',
    'production',
    13,
    'New sidebar canary',
    '{"apiEndpoint":"https://api.example.com","featureFlags":{"newSidebar":true,"fastSync":true},"retry":{"maxAttempts":4,"backoffMs":650}}'
  );

INSERT OR IGNORE INTO releases (
  id,
  app_id,
  environment,
  stable_version_id,
  canary_version_id,
  rollout_percentage,
  rollout_salt,
  client_allowlist_json,
  platforms_json,
  min_app_version
) VALUES (
  'release_demo_production',
  'app_demo_desktop',
  'production',
  'ver_demo_12',
  'ver_demo_13',
  15,
  'demo-release-13',
  '["design-mac-01","qa-windows-03"]',
  '["macos","windows"]',
  '2.3.0'
);

INSERT OR IGNORE INTO audit_logs (
  id,
  app_id,
  action,
  detail_json
) VALUES (
  'audit_demo_release',
  'app_demo_desktop',
  'release.updated',
  '{"environment":"production","rolloutPercentage":15}'
);
