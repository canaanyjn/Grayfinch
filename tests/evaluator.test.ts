import { describe, expect, it } from "vitest";
import {
  compareVersions,
  evaluateRollout,
  isValidVersion,
  stableBucket,
} from "../worker/evaluator";

describe("rollout evaluator", () => {
  it("keeps the same client in the same bucket", async () => {
    const first = await stableBucket("app:client-1:release-13");
    const second = await stableBucket("app:client-1:release-13");
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(10_000);
  });

  it("always includes allowlisted clients", async () => {
    const result = await evaluateRollout(
      {
        appKey: "desktop-suite",
        salt: "release-13",
        percentage: 0,
        allowlist: ["qa-device"],
        platforms: ["windows"],
        minAppVersion: "9.0.0",
        hasCanary: true,
      },
      {
        clientId: "qa-device",
        platform: "linux",
        appVersion: "1.0.0",
      },
    );

    expect(result.useCanary).toBe(true);
    expect(result.matchedBy).toBe("allowlist");
  });

  it("respects platform and minimum version gates", async () => {
    const result = await evaluateRollout(
      {
        appKey: "desktop-suite",
        salt: "release-13",
        percentage: 100,
        allowlist: [],
        platforms: ["macos"],
        minAppVersion: "2.3.0",
        hasCanary: true,
      },
      {
        clientId: "linux-client",
        platform: "linux",
        appVersion: "2.3.1",
      },
    );

    expect(result.useCanary).toBe(false);
    expect(result.matchedBy).toBe("stable");
  });

  it("fails closed when a client or stored minimum version is invalid", async () => {
    const policy = {
      appKey: "desktop-suite",
      salt: "release-13",
      percentage: 100,
      allowlist: [],
      platforms: [],
      minAppVersion: "2.3.0",
      hasCanary: true,
    };

    const invalidClient = await evaluateRollout(policy, {
      clientId: "invalid-client",
      appVersion: "not-a-version",
    });
    const invalidMinimum = await evaluateRollout(
      { ...policy, minAppVersion: "beta" },
      { clientId: "valid-client", appVersion: "9.0.0" },
    );

    expect(invalidClient.useCanary).toBe(false);
    expect(invalidMinimum.useCanary).toBe(false);
  });
});

describe("version comparison", () => {
  it("compares common dotted versions", () => {
    expect(compareVersions("2.3.1", "2.3.0")).toBe(1);
    expect(compareVersions("2.3", "2.3.0")).toBe(0);
    expect(compareVersions("2.2.9", "2.3.0")).toBe(-1);
  });

  it("handles prefixes, prereleases, and build metadata", () => {
    expect(compareVersions("v2.3.0", "2.3.0")).toBe(0);
    expect(compareVersions("2.3.0-beta.1", "2.3.0")).toBe(-1);
    expect(compareVersions("2.3.0-beta.2", "2.3.0-beta.10")).toBe(-1);
    expect(compareVersions("2.3.0+build.7", "2.3.0+build.8")).toBe(0);
  });

  it("rejects malformed versions", () => {
    expect(isValidVersion("2..3")).toBe(false);
    expect(isValidVersion("2.3.0-beta.01")).toBe(false);
    expect(isValidVersion("beta")).toBe(false);
    expect(() => compareVersions("beta", "2.3.0")).toThrow(RangeError);
  });
});
