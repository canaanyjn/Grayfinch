export type ClientContext = {
  clientId: string;
  platform?: string;
  appVersion?: string;
};

export type RolloutPolicy = {
  appKey: string;
  salt: string;
  percentage: number;
  allowlist: string[];
  platforms: string[];
  minAppVersion?: string | null;
  hasCanary: boolean;
};

export type Evaluation = {
  useCanary: boolean;
  matchedBy: "allowlist" | "percentage" | "stable";
  bucket: number;
};

type ParsedVersion = {
  core: [bigint, bigint, bigint];
  prerelease: string[] | null;
};

const versionPattern =
  /^v?(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(value: string): ParsedVersion | null {
  const match = versionPattern.exec(value.trim());
  if (!match) return null;

  const prerelease = match[4]?.split(".") ?? null;
  if (
    prerelease?.some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith("0"),
    )
  ) {
    return null;
  }

  return {
    core: [
      BigInt(match[1]),
      BigInt(match[2] ?? "0"),
      BigInt(match[3] ?? "0"),
    ],
    prerelease,
  };
}

export function isValidVersion(value: string): boolean {
  return parseVersion(value) !== null;
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    throw new RangeError("Invalid version");
  }

  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) {
      return a.core[index] > b.core[index] ? 1 : -1;
    }
  }

  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = a.prerelease[index];
    const rightIdentifier = b.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftIsNumber = /^\d+$/.test(leftIdentifier);
    const rightIsNumber = /^\d+$/.test(rightIdentifier);
    if (leftIsNumber && rightIsNumber) {
      return BigInt(leftIdentifier) > BigInt(rightIdentifier) ? 1 : -1;
    }
    if (leftIsNumber !== rightIsNumber) {
      return leftIsNumber ? -1 : 1;
    }
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }

  return 0;
}

export async function stableBucket(input: string): Promise<number> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const view = new DataView(digest);
  return view.getUint32(0, false) % 10_000;
}

export async function evaluateRollout(
  policy: RolloutPolicy,
  client: ClientContext,
): Promise<Evaluation> {
  const bucket = await stableBucket(
    `${policy.appKey}:${client.clientId}:${policy.salt}`,
  );

  if (!policy.hasCanary) {
    return { useCanary: false, matchedBy: "stable", bucket };
  }

  if (policy.allowlist.includes(client.clientId)) {
    return { useCanary: true, matchedBy: "allowlist", bucket };
  }

  const platformMatches =
    policy.platforms.length === 0 ||
    (!!client.platform && policy.platforms.includes(client.platform));
  const versionMatches =
    !policy.minAppVersion ||
    (!!client.appVersion &&
      isValidVersion(policy.minAppVersion) &&
      isValidVersion(client.appVersion) &&
      compareVersions(client.appVersion, policy.minAppVersion) >= 0);
  const percentageMatches = bucket < policy.percentage * 100;

  if (platformMatches && versionMatches && percentageMatches) {
    return { useCanary: true, matchedBy: "percentage", bucket };
  }

  return { useCanary: false, matchedBy: "stable", bucket };
}
