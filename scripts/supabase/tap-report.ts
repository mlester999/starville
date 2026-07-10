export interface TapReport {
  readonly planned: number;
  readonly passed: number;
}

export function extractTapLines(resultSets: unknown): readonly string[] {
  if (!Array.isArray(resultSets)) {
    return [];
  }

  const lines: string[] = [];

  for (const resultSet of resultSets) {
    if (!Array.isArray(resultSet)) {
      continue;
    }

    for (const row of resultSet) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }

      for (const value of Object.values(row)) {
        if (typeof value === 'string') {
          lines.push(value.trim());
        }
      }
    }
  }

  return lines;
}

export function parseTapReport(lines: readonly string[]): TapReport {
  const plans = lines.flatMap((line) => {
    const match = /^1\.\.(\d+)$/u.exec(line);
    return match?.[1] === undefined ? [] : [Number(match[1])];
  });
  const assertions = lines.filter((line) => /^(?:not )?ok\s+\d+\b/u.test(line));
  const failures = assertions.filter((line) => /^not ok\s+/u.test(line));
  const bailedOut = lines.some((line) => /^Bail out!/iu.test(line));

  if (plans.length !== 1 || plans[0] === undefined || !Number.isSafeInteger(plans[0])) {
    throw new Error('Hosted pgTAP output did not contain exactly one valid test plan');
  }

  if (bailedOut) {
    throw new Error('Hosted pgTAP suite bailed out before completion');
  }

  if (failures.length > 0) {
    throw new Error(`Hosted pgTAP failures: ${failures.join(' | ')}`);
  }

  if (assertions.length !== plans[0]) {
    throw new Error(
      `Hosted pgTAP plan mismatch: expected ${plans[0]} assertions but received ${assertions.length}`,
    );
  }

  return { planned: plans[0], passed: assertions.length };
}
