import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { evaluateRollout, isValidVersion } from "./evaluator";

type Bindings = {
  DB: D1Database;
  DEPLOYMENT_ROLE?: "admin" | "public";
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  LOCAL_DEV_AUTH_BYPASS?: string;
};

type Variables = {
  requestId: string;
  userEmail: string;
};

type AppRow = {
  id: string;
  app_key: string;
  name: string;
  description: string;
  client_token_hash: string;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  app_id: string;
  environment: string;
  version: number;
  label: string;
  config_json: string;
  created_at: string;
};

type ReleaseWorkspaceRow = {
  id: string;
  stable_version_id: string;
  canary_version_id: string | null;
  rollout_percentage: number;
  rollout_salt: string;
  client_allowlist_json: string;
  platforms_json: string;
  min_app_version: string | null;
  updated_at: string;
};

type ClientReleaseRow = ReleaseWorkspaceRow & {
  stable_version: number;
  stable_label: string;
  stable_config_json: string;
  canary_version: number | null;
  canary_label: string | null;
  canary_config_json: string | null;
};

const createAppSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(240).default(""),
});

const createVersionSchema = z.object({
  environment: z.enum(["development", "staging", "production"]),
  label: z.string().trim().min(1).max(100),
  config: z.record(z.string(), z.unknown()),
});

const updateReleaseSchema = z.object({
  stableVersionId: z.string().min(1),
  canaryVersionId: z.string().nullable(),
  rolloutPercentage: z.number().int().min(0).max(100),
  clientAllowlist: z.array(z.string().trim().min(1)).max(500),
  platforms: z.array(z.enum(["macos", "windows", "linux", "ios", "android"])),
  minAppVersion: z
    .string()
    .trim()
    .max(40)
    .refine(isValidVersion)
    .nullable(),
});

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const jwksByTeam = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

app.use("*", async (context, next) => {
  context.set("requestId", crypto.randomUUID());
  await next();
  context.header("X-Request-ID", context.get("requestId"));
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "no-referrer");
});

app.get("/api/health", (context) =>
  context.json({ ok: true, service: "grayfinch" }),
);

app.use("/api/admin/*", async (context, next) => {
  if (context.env.DEPLOYMENT_ROLE === "public") {
    return context.json({ error: "接口不存在。" }, 404);
  }

  if (context.env.LOCAL_DEV_AUTH_BYPASS === "true") {
    context.set("userEmail", "local-developer");
    await next();
    return;
  }

  const teamDomain = normalizeTeamDomain(context.env.ACCESS_TEAM_DOMAIN);
  const audience = context.env.ACCESS_AUD?.trim();
  if (
    !teamDomain ||
    !audience ||
    teamDomain.includes("REPLACE_WITH") ||
    audience.includes("REPLACE_WITH")
  ) {
    return context.json(
      {
        error:
          "管理后台尚未接入 Cloudflare Access。请配置 Team Domain 和 Audience。",
      },
      503,
    );
  }

  const assertion = context.req.header("Cf-Access-Jwt-Assertion");
  if (!assertion) {
    return context.json({ error: "请先通过 Cloudflare Access 登录。" }, 401);
  }

  try {
    const jwks =
      jwksByTeam.get(teamDomain) ??
      createRemoteJWKSet(
        new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
      );
    jwksByTeam.set(teamDomain, jwks);

    const { payload } = await jwtVerify(assertion, jwks, {
      issuer: `https://${teamDomain}`,
      audience,
    });
    if (typeof payload.email !== "string" || !payload.email) {
      return context.json({ error: "Access 身份中缺少邮箱信息。" }, 403);
    }

    context.set("userEmail", payload.email);
    await next();
  } catch (error) {
    console.warn({
      requestId: context.get("requestId"),
      message: "Cloudflare Access JWT validation failed",
      cause: error instanceof Error ? error.message : String(error),
    });
    return context.json({ error: "Cloudflare Access 登录已失效。" }, 401);
  }
});

app.get("/api/admin/summary", async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM apps) AS apps,
      (SELECT COUNT(*) FROM config_versions) AS versions,
      (SELECT COUNT(*) FROM releases) AS releases,
      (SELECT COUNT(*) FROM releases
        WHERE canary_version_id IS NOT NULL AND rollout_percentage > 0) AS canaries`,
  ).first<Record<string, number>>();

  return context.json({
    apps: result?.apps ?? 0,
    versions: result?.versions ?? 0,
    releases: result?.releases ?? 0,
    canaries: result?.canaries ?? 0,
    userEmail: context.get("userEmail"),
  });
});

app.get("/api/admin/apps", async (context) => {
  const rows = await context.env.DB.prepare(
    `SELECT
      a.id,
      a.app_key,
      a.name,
      a.description,
      a.created_at,
      a.updated_at,
      COUNT(DISTINCT cv.id) AS version_count,
      COUNT(DISTINCT CASE
        WHEN r.canary_version_id IS NOT NULL AND r.rollout_percentage > 0
        THEN r.id END) AS active_canaries
    FROM apps a
    LEFT JOIN config_versions cv ON cv.app_id = a.id
    LEFT JOIN releases r ON r.app_id = a.id
    GROUP BY a.id
    ORDER BY a.updated_at DESC`,
  ).all();

  return context.json({ apps: rows.results });
});

app.post("/api/admin/apps", async (context) => {
  const parsed = createAppSchema.safeParse(await context.req.json());
  if (!parsed.success) {
    return context.json(
      { error: "应用信息不完整。标识只能包含小写字母、数字和连字符。" },
      400,
    );
  }

  const exists = await context.env.DB.prepare(
    "SELECT id FROM apps WHERE app_key = ?",
  )
    .bind(parsed.data.key)
    .first();
  if (exists) {
    return context.json({ error: "这个应用标识已经被使用。" }, 409);
  }

  const id = crypto.randomUUID();
  const clientToken = `rc_${randomToken(24)}`;
  const tokenHash = await sha256Hex(clientToken);

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO apps (
        id, app_key, name, description, client_token_hash
      ) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      id,
      parsed.data.key,
      parsed.data.name,
      parsed.data.description,
      tokenHash,
    ),
    auditStatement(context.env.DB, id, "app.created", {
      appKey: parsed.data.key,
    }),
  ]);

  return context.json(
    {
      app: {
        id,
        app_key: parsed.data.key,
        name: parsed.data.name,
        description: parsed.data.description,
      },
      clientToken,
    },
    201,
  );
});

app.get("/api/admin/apps/:id/workspace", async (context) => {
  const environment = readEnvironment(context.req.query("environment"));
  if (!environment) {
    return context.json({ error: "环境参数无效。" }, 400);
  }

  const appRow = await context.env.DB.prepare(
    `SELECT id, app_key, name, description, created_at, updated_at
     FROM apps WHERE id = ?`,
  )
    .bind(context.req.param("id"))
    .first();
  if (!appRow) {
    return context.json({ error: "找不到这个应用。" }, 404);
  }

  const [versions, release, audits] = await Promise.all([
    context.env.DB.prepare(
      `SELECT id, app_id, environment, version, label, config_json, created_at
       FROM config_versions
       WHERE app_id = ? AND environment = ?
       ORDER BY version DESC`,
    )
      .bind(context.req.param("id"), environment)
      .all<VersionRow>(),
    context.env.DB.prepare(
      `SELECT id, stable_version_id, canary_version_id, rollout_percentage,
        rollout_salt, client_allowlist_json, platforms_json, min_app_version,
        updated_at
       FROM releases
       WHERE app_id = ? AND environment = ?`,
    )
      .bind(context.req.param("id"), environment)
      .first<ReleaseWorkspaceRow>(),
    context.env.DB.prepare(
      `SELECT id, action, detail_json, created_at
       FROM audit_logs
       WHERE app_id = ?
       ORDER BY created_at DESC
       LIMIT 8`,
    )
      .bind(context.req.param("id"))
      .all(),
  ]);

  return context.json({
    app: appRow,
    environment,
    versions: versions.results.map((version) => ({
      ...version,
      config: JSON.parse(version.config_json),
      config_json: undefined,
    })),
    release: release
      ? {
          ...release,
          clientAllowlist: safeJsonArray(release.client_allowlist_json),
          platforms: safeJsonArray(release.platforms_json),
          client_allowlist_json: undefined,
          platforms_json: undefined,
        }
      : null,
    audits: audits.results.map((audit) => ({
      ...audit,
      detail: JSON.parse(String(audit.detail_json)),
      detail_json: undefined,
    })),
  });
});

app.post("/api/admin/apps/:id/versions", async (context) => {
  const parsed = createVersionSchema.safeParse(await context.req.json());
  if (!parsed.success) {
    return context.json(
      { error: "版本信息无效。配置必须是一个 JSON 对象。" },
      400,
    );
  }

  const appId = context.req.param("id");
  const appExists = await context.env.DB.prepare(
    "SELECT id FROM apps WHERE id = ?",
  )
    .bind(appId)
    .first();
  if (!appExists) {
    return context.json({ error: "找不到这个应用。" }, 404);
  }

  const versionId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const releaseId = crypto.randomUUID();
  const rolloutSalt = crypto.randomUUID();
  const [insertResult] = await context.env.DB.batch<{ version: number }>([
    context.env.DB.prepare(
      `INSERT INTO config_versions (
        id, app_id, environment, version, label, config_json
      )
      SELECT ?, ?, ?, COALESCE(MAX(version), 0) + 1, ?, ?
      FROM config_versions
      WHERE app_id = ? AND environment = ?
      RETURNING version`,
    ).bind(
      versionId,
      appId,
      parsed.data.environment,
      parsed.data.label,
      JSON.stringify(parsed.data.config),
      appId,
      parsed.data.environment,
    ),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, app_id, action, detail_json)
       SELECT ?, ?, 'version.created', json_object(
         'environment', ?,
         'version', version,
         'label', ?
       )
       FROM config_versions
       WHERE id = ?`,
    ).bind(
      auditId,
      appId,
      parsed.data.environment,
      parsed.data.label,
      versionId,
    ),
    context.env.DB.prepare(
      `INSERT INTO releases (
        id, app_id, environment, stable_version_id, rollout_salt
      )
      SELECT ?, app_id, environment, id, ?
      FROM config_versions
      WHERE id = ? AND version = 1
      ON CONFLICT(app_id, environment) DO NOTHING`,
    ).bind(releaseId, rolloutSalt, versionId),
  ]);
  const versionNumber = insertResult.results.at(0)?.version;
  if (!versionNumber) {
    throw new Error("Version insert did not return a version number");
  }

  return context.json({ id: versionId, version: versionNumber }, 201);
});

app.put("/api/admin/apps/:id/releases/:environment", async (context) => {
  const environment = readEnvironment(context.req.param("environment"));
  if (!environment) {
    return context.json({ error: "环境参数无效。" }, 400);
  }

  const parsed = updateReleaseSchema.safeParse(await context.req.json());
  if (!parsed.success) {
    return context.json({ error: "灰度发布规则无效。" }, 400);
  }

  const appId = context.req.param("id");
  const versionIds = [
    parsed.data.stableVersionId,
    parsed.data.canaryVersionId,
  ].filter(Boolean) as string[];
  const placeholders = versionIds.map(() => "?").join(",");
  const versions = await context.env.DB.prepare(
    `SELECT id FROM config_versions
     WHERE app_id = ? AND environment = ? AND id IN (${placeholders})`,
  )
    .bind(appId, environment, ...versionIds)
    .all<{ id: string }>();
  if (versions.results.length !== versionIds.length) {
    return context.json(
      { error: "稳定版或灰度版不属于当前应用与环境。" },
      400,
    );
  }

  const existing = await context.env.DB.prepare(
    "SELECT id, rollout_salt FROM releases WHERE app_id = ? AND environment = ?",
  )
    .bind(appId, environment)
    .first<{ id: string; rollout_salt: string }>();
  const nextReleaseId = existing?.id ?? crypto.randomUUID();
  const nextRolloutSalt = existing?.rollout_salt ?? crypto.randomUUID();

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO releases (
        id, app_id, environment, stable_version_id, canary_version_id,
        rollout_percentage, rollout_salt, client_allowlist_json,
        platforms_json, min_app_version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(app_id, environment) DO UPDATE SET
        stable_version_id = excluded.stable_version_id,
        canary_version_id = excluded.canary_version_id,
        rollout_percentage = excluded.rollout_percentage,
        client_allowlist_json = excluded.client_allowlist_json,
        platforms_json = excluded.platforms_json,
        min_app_version = excluded.min_app_version,
        updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      nextReleaseId,
      appId,
      environment,
      parsed.data.stableVersionId,
      parsed.data.canaryVersionId,
      parsed.data.canaryVersionId ? parsed.data.rolloutPercentage : 0,
      nextRolloutSalt,
      JSON.stringify(parsed.data.clientAllowlist),
      JSON.stringify(parsed.data.platforms),
      parsed.data.minAppVersion || null,
    ),
    auditStatement(context.env.DB, appId, "release.updated", {
      environment,
      stableVersionId: parsed.data.stableVersionId,
      canaryVersionId: parsed.data.canaryVersionId,
      rolloutPercentage: parsed.data.rolloutPercentage,
    }),
  ]);

  return context.json({ ok: true, releaseId: nextReleaseId });
});

app.post("/api/admin/apps/:id/rotate-token", async (context) => {
  const appId = context.req.param("id");
  const appExists = await context.env.DB.prepare(
    "SELECT id FROM apps WHERE id = ?",
  )
    .bind(appId)
    .first();
  if (!appExists) {
    return context.json({ error: "找不到这个应用。" }, 404);
  }

  const clientToken = `rc_${randomToken(24)}`;
  const tokenHash = await sha256Hex(clientToken);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE apps
       SET client_token_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(tokenHash, appId),
    auditStatement(context.env.DB, appId, "token.rotated", {}),
  ]);
  return context.json({ clientToken });
});

app.use("/api/v1/*", async (context, next) => {
  if (context.env.DEPLOYMENT_ROLE === "admin") {
    return context.json({ error: "接口不存在。" }, 404);
  }
  await next();
});

app.get("/api/v1/config/:appKey", async (context) => {
  const environment = readEnvironment(
    context.req.query("environment") ?? "production",
  );
  if (!environment) {
    return context.json({ error: "环境参数无效。" }, 400);
  }

  const clientId = context.req.query("client_id")?.trim();
  if (!clientId) {
    return context.json({ error: "缺少 client_id。" }, 400);
  }

  const appRow = await context.env.DB.prepare(
    "SELECT * FROM apps WHERE app_key = ?",
  )
    .bind(context.req.param("appKey"))
    .first<AppRow>();
  if (!appRow) {
    return context.json({ error: "找不到配置应用。" }, 404);
  }

  const suppliedToken = readBearer(context.req.header("Authorization"));
  if (!suppliedToken || (await sha256Hex(suppliedToken)) !== appRow.client_token_hash) {
    return context.json({ error: "客户端令牌无效。" }, 401);
  }

  const release = await context.env.DB.prepare(
    `SELECT
      r.id, r.stable_version_id, r.canary_version_id, r.rollout_percentage,
      r.rollout_salt, r.client_allowlist_json, r.platforms_json,
      r.min_app_version, r.updated_at,
      sv.version AS stable_version,
      sv.label AS stable_label,
      sv.config_json AS stable_config_json,
      cv.version AS canary_version,
      cv.label AS canary_label,
      cv.config_json AS canary_config_json
    FROM releases r
    JOIN config_versions sv ON sv.id = r.stable_version_id
    LEFT JOIN config_versions cv ON cv.id = r.canary_version_id
    WHERE r.app_id = ? AND r.environment = ?`,
  )
    .bind(appRow.id, environment)
    .first<ClientReleaseRow>();
  if (!release) {
    return context.json({ error: "这个环境尚未发布配置。" }, 404);
  }

  const evaluation = await evaluateRollout(
    {
      appKey: appRow.app_key,
      salt: release.rollout_salt,
      percentage: release.rollout_percentage,
      allowlist: safeJsonArray(release.client_allowlist_json),
      platforms: safeJsonArray(release.platforms_json),
      minAppVersion: release.min_app_version,
      hasCanary: release.canary_version_id !== null,
    },
    {
      clientId,
      platform: context.req.query("platform")?.trim(),
      appVersion: context.req.query("app_version")?.trim(),
    },
  );

  const useCanary =
    evaluation.useCanary && release.canary_config_json !== null;
  const selectedVersion = useCanary
    ? release.canary_version
    : release.stable_version;
  const selectedLabel = useCanary ? release.canary_label : release.stable_label;
  const selectedConfig = useCanary
    ? release.canary_config_json!
    : release.stable_config_json;
  const etag = `"${appRow.app_key}:${environment}:v${selectedVersion}"`;

  context.header("ETag", etag);
  context.header("Cache-Control", "private, max-age=0, must-revalidate");
  context.header("Vary", "Authorization");
  if (context.req.header("If-None-Match") === etag) {
    return context.body(null, 304);
  }

  return context.json({
    app: appRow.app_key,
    environment,
    version: selectedVersion,
    label: selectedLabel,
    releaseId: release.id,
    variant: useCanary ? "canary" : "stable",
    matchedBy: evaluation.matchedBy,
    config: JSON.parse(selectedConfig),
  });
});

app.notFound((context) => context.json({ error: "接口不存在。" }, 404));

app.onError((error, context) => {
  console.error({
    requestId: context.get("requestId"),
    message: error.message,
    stack: error.stack,
  });
  return context.json(
    {
      error: "服务暂时无法处理这个请求。",
      requestId: context.get("requestId"),
    },
    500,
  );
});

function readEnvironment(value?: string) {
  if (
    value === "development" ||
    value === "staging" ||
    value === "production"
  ) {
    return value;
  }
  return null;
}

function normalizeTeamDomain(value?: string) {
  return value
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function readBearer(value?: string) {
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice(7).trim();
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function randomToken(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function auditStatement(
  database: D1Database,
  appId: string,
  action: string,
  detail: Record<string, unknown>,
) {
  return database
    .prepare(
      `INSERT INTO audit_logs (id, app_id, action, detail_json)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), appId, action, JSON.stringify(detail));
}

export default app;
