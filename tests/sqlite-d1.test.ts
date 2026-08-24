import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import app from "../worker/index.ts";
import { SqliteD1Database } from "../server/sqlite-d1.ts";

describe("domestic SQLite adapter", () => {
  it("runs the same admin and public API paths as D1", async () => {
    const database = new SqliteD1Database(":memory:");
    database.exec(await readFile("migrations/0001_initial.sql", "utf8"));

    const adminBindings = {
      DB: database,
      DEPLOYMENT_ROLE: "admin",
      ADMIN_AUTH_MODE: "token",
      ADMIN_API_TOKEN: "admin-token",
    };
    const unauthorized = await app.fetch(
      new Request("http://grayfinch.test/api/admin/summary"),
      adminBindings as never,
    );
    expect(unauthorized.status).toBe(401);

    const created = await app.fetch(
      new Request("http://grayfinch.test/api/admin/apps", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Domestic test app",
          key: "domestic-test",
          description: "",
        }),
      }),
      adminBindings as never,
    );
    expect(created.status).toBe(201);
    const { app: createdApp, clientToken } = (await created.json()) as {
      app: { id: string };
      clientToken: string;
    };

    const version = await app.fetch(
      new Request(
        `http://grayfinch.test/api/admin/apps/${createdApp.id}/versions`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer admin-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            environment: "production",
            label: "Initial release",
            config: { featureEnabled: true },
          }),
        },
      ),
      adminBindings as never,
    );
    expect(version.status).toBe(201);

    const publicResponse = await app.fetch(
      new Request(
        "http://grayfinch.test/api/v1/config/domestic-test?client_id=device-1",
        { headers: { Authorization: `Bearer ${clientToken}` } },
      ),
      { DB: database, DEPLOYMENT_ROLE: "public" } as never,
    );
    expect(publicResponse.status).toBe(200);
    await expect(publicResponse.json()).resolves.toMatchObject({
      variant: "stable",
      config: { featureEnabled: true },
    });
    database.close();
  });
});
