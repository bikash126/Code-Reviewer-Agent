import { describe, expect, it } from "vitest";
import { CHANGELOG } from "../../changelog";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe("CHANGELOG data", () => {
  it("has at least one release entry", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("every release has a non-empty version and at least one section with items", () => {
    for (const release of CHANGELOG) {
      expect(release.version.length).toBeGreaterThan(0);
      expect(release.sections.length).toBeGreaterThan(0);
      for (const section of release.sections) {
        expect(section.items.length).toBeGreaterThan(0);
        for (const item of section.items) {
          expect(item.title.trim().length).toBeGreaterThan(0);
          expect(item.description.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only the first entry is 'Unreleased', and it has no date", () => {
    const unreleasedIndexes = CHANGELOG.map((r, i) => (r.version === "Unreleased" ? i : -1)).filter((i) => i >= 0);
    expect(unreleasedIndexes).toEqual([0]);
    expect(CHANGELOG[0].date).toBeUndefined();
  });

  it("every non-Unreleased release has a valid semver version and ISO date", () => {
    for (const release of CHANGELOG.slice(1)) {
      expect(release.version).toMatch(SEMVER_RE);
      expect(release.date).toMatch(DATE_RE);
    }
  });

  it("versions are listed newest-first with no duplicates", () => {
    const versions = CHANGELOG.filter((r) => r.version !== "Unreleased").map((r) => r.version);
    const sorted = [...versions].sort((a, b) => compareSemver(b, a));
    expect(versions).toEqual(sorted);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

function compareSemver(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) {
      return partsA[i] - partsB[i];
    }
  }
  return 0;
}
