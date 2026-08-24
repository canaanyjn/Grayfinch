import type {
  AppSummary,
  Environment,
  Summary,
  Workspace,
} from "./types";

export class ApiClient {
  private static readonly adminTokenStorageKey = "grayfinch-admin-token";
  private pendingTokenPrompt: Promise<string | null> | null = null;

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = window.sessionStorage.getItem(ApiClient.adminTokenStorageKey);
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | T
      | null;
    if (!response.ok) {
      if (
        response.status === 401 &&
        response.headers.get("X-Grayfinch-Admin-Auth") === "token"
      ) {
        const nextToken = await this.promptForAdminToken();
        if (nextToken) return this.request<T>(path, init);
      }
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

  hasStoredAdminToken() {
    return Boolean(
      window.sessionStorage.getItem(ApiClient.adminTokenStorageKey),
    );
  }

  clearStoredAdminToken() {
    window.sessionStorage.removeItem(ApiClient.adminTokenStorageKey);
  }

  private promptForAdminToken() {
    if (this.pendingTokenPrompt) return this.pendingTokenPrompt;

    this.pendingTokenPrompt = Promise.resolve(
      window.prompt("请输入 Grayfinch 管理后台令牌"),
    ).then((value) => {
      const token = value?.trim() || null;
      if (token) {
        window.sessionStorage.setItem(ApiClient.adminTokenStorageKey, token);
      }
      return token;
    });
    return this.pendingTokenPrompt.finally(() => {
      this.pendingTokenPrompt = null;
    });
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
