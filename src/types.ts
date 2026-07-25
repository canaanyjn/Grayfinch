export type Environment = "development" | "staging" | "production";

export type Summary = {
  apps: number;
  versions: number;
  releases: number;
  canaries: number;
  userEmail: string;
};

export type AppSummary = {
  id: string;
  app_key: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  version_count: number;
  active_canaries: number;
};

export type ConfigVersion = {
  id: string;
  app_id: string;
  environment: Environment;
  version: number;
  label: string;
  config: Record<string, unknown>;
  created_at: string;
};

export type Release = {
  id: string;
  stable_version_id: string;
  canary_version_id: string | null;
  rollout_percentage: number;
  rollout_salt: string;
  clientAllowlist: string[];
  platforms: string[];
  min_app_version: string | null;
  updated_at: string;
};

export type Audit = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type Workspace = {
  app: AppSummary;
  environment: Environment;
  versions: ConfigVersion[];
  release: Release | null;
  audits: Audit[];
};
