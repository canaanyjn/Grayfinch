import type {
  AppSummary,
  Environment,
  Summary,
  Workspace,
} from "./types";

export class ApiClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | T
      | null;
    if (!response.ok) {
      throw new Error(
        body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
          ? body.error
          : `请求失败（${response.status}）`,
      );
    }

    return body as T;
  }

  summary() {
    return this.request<Summary>("/api/admin/summary");
  }

  apps() {
    return this.request<{ apps: AppSummary[] }>("/api/admin/apps");
  }

  workspace(appId: string, environment: Environment) {
    return this.request<Workspace>(
      `/api/admin/apps/${appId}/workspace?environment=${environment}`,
    );
  }

  createApp(input: { name: string; key: string; description: string }) {
    return this.request<{ app: AppSummary; clientToken: string }>(
      "/api/admin/apps",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  createVersion(
    appId: string,
    input: {
      environment: Environment;
      label: string;
      config: Record<string, unknown>;
    },
  ) {
    return this.request<{ id: string; version: number }>(
      `/api/admin/apps/${appId}/versions`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  updateRelease(
    appId: string,
    environment: Environment,
    input: {
      stableVersionId: string;
      canaryVersionId: string | null;
      rolloutPercentage: number;
      clientAllowlist: string[];
      platforms: string[];
      minAppVersion: string | null;
    },
  ) {
    return this.request<{ ok: boolean }>(
      `/api/admin/apps/${appId}/releases/${environment}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
  }

  rotateToken(appId: string) {
    return this.request<{ clientToken: string }>(
      `/api/admin/apps/${appId}/rotate-token`,
      { method: "POST" },
    );
  }
}
