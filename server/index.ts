import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import app from "../worker/index.ts";
import { SqliteD1Database } from "./sqlite-d1.ts";

const port = readPort(process.env.PORT);
const deploymentRole = readRole(process.env.DEPLOYMENT_ROLE);
const databasePath = resolve(process.env.DATABASE_PATH ?? "data/grayfinch.db");
const staticRoot = resolve(process.env.STATIC_ROOT ?? "dist/client");
await mkdir(resolve(databasePath, ".."), { recursive: true });
const database = new SqliteD1Database(databasePath);

if (shouldRunMigrations(process.env.RUN_MIGRATIONS, deploymentRole)) {
  await runMigrations(database);
}

const bindings = {
  DB: database,
  DEPLOYMENT_ROLE: deploymentRole,
  ADMIN_AUTH_MODE: "token" as const,
  ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }
    await handleStatic(pathname, response);
  } catch (error) {
    console.error("Unhandled domestic server error", error);
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "application/json" });
    }
    response.end(JSON.stringify({ error: "服务暂时无法处理这个请求。" }));
  }
});

server.listen(port, () => {
  console.log(`Grayfinch domestic ${bindings.DEPLOYMENT_ROLE} server listening on :${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}

async function handleApi(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  const workerResponse = await app.fetch(
    new Request(requestUrl, { method, headers, body }),
    bindings as never,
  );

  const responseHeaders: Record<string, string> = {};
  workerResponse.headers.forEach((value, name) => {
    responseHeaders[name] = value;
  });
  response.writeHead(workerResponse.status, responseHeaders);
  response.end(Buffer.from(await workerResponse.arrayBuffer()));
}

async function handleStatic(pathname: string, response: ServerResponse) {
  const candidate = resolveStaticPath(pathname);
  const file = candidate ?? resolve(staticRoot, "index.html");
  try {
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentType(file),
      "Cache-Control": file.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    });
    response.end(content);
  } catch {
    if (candidate && !extname(candidate)) {
      const content = await readFile(resolve(staticRoot, "index.html"));
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      response.end(content);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function resolveStaticPath(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded === "/" || decoded.endsWith("/")) return null;
  const target = resolve(staticRoot, `.${decoded}`);
  return target === staticRoot || target.startsWith(`${staticRoot}${sep}`)
    ? target
    : null;
}

function contentType(file: string) {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  };
  return types[extname(file)] ?? "application/octet-stream";
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function runMigrations(target: SqliteD1Database) {
  target.exec(
    `CREATE TABLE IF NOT EXISTS _grayfinch_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  const migrationsRoot = resolve(process.cwd(), "migrations");
  const migrations = (await readdir(migrationsRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const applied = await target
      .prepare("SELECT name FROM _grayfinch_migrations WHERE name = ?")
      .bind(migration)
      .first<{ name: string }>();
    if (applied) continue;
    target.exec(await readFile(resolve(migrationsRoot, migration), "utf8"));
    await target
      .prepare("INSERT INTO _grayfinch_migrations (name) VALUES (?)")
      .bind(migration)
      .all();
  }
}

function readPort(value: string | undefined) {
  const port = Number(value ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT 必须是 1 到 65535 之间的整数。");
  }
  return port;
}

function readRole(value: string | undefined): "admin" | "public" {
  if (value === "admin" || value === "public") return value;
  throw new Error("DEPLOYMENT_ROLE 必须是 admin 或 public。");
}

function shouldRunMigrations(value: string | undefined, role: "admin" | "public") {
  if (value === undefined) return role === "admin";
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("RUN_MIGRATIONS 必须是 true 或 false。");
}
