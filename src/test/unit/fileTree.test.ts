import { describe, expect, it } from "vitest";
import { buildFileTree, TreeFolderNode } from "../../webview/components/FileTree";
import { ChangedFile } from "../../types";

function file(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  return { path, status: "modified", linesAdded: 1, linesRemoved: 0, ...overrides };
}

function names(node: TreeFolderNode): string[] {
  return [...node.children.values()].map((c) => c.name);
}

describe("buildFileTree", () => {
  it("puts files with no directory directly under the root", () => {
    const root = buildFileTree([file("README.md"), file("package.json")]);
    expect(names(root).sort()).toEqual(["README.md", "package.json"]);
    expect([...root.children.values()].every((c) => c.type === "file")).toBe(true);
  });

  it("groups files that share a directory under one folder node", () => {
    const root = buildFileTree([file("src/foo.ts"), file("src/bar.ts")]);
    expect(names(root)).toEqual(["src"]);

    const srcFolder = [...root.children.values()][0] as TreeFolderNode;
    expect(srcFolder.type).toBe("folder");
    expect(names(srcFolder).sort()).toEqual(["bar.ts", "foo.ts"]);
  });

  it("compresses chains of single-child folders into one row", () => {
    const root = buildFileTree([file("src/main/java/com/example/App.java")]);

    // Only one path exists, so every intermediate folder has exactly one child
    // until "App.java" — the whole chain should collapse into a single folder node.
    expect(names(root)).toEqual(["src/main/java/com/example"]);
    const folder = [...root.children.values()][0] as TreeFolderNode;
    expect(names(folder)).toEqual(["App.java"]);
  });

  it("does not compress a folder once it branches into multiple children", () => {
    const root = buildFileTree([file("src/foo.ts"), file("src/nested/bar.ts")]);

    expect(names(root)).toEqual(["src"]);
    const srcFolder = [...root.children.values()][0] as TreeFolderNode;
    // "src" has two children (foo.ts and the "nested" folder) so it must NOT merge with "nested".
    expect(names(srcFolder).sort()).toEqual(["foo.ts", "nested"]);
  });

  it("nests a renamed file under its new path, not its old one", () => {
    const root = buildFileTree([file("src/new-name.ts", { status: "renamed", oldPath: "src/old-name.ts" })]);
    const srcFolder = [...root.children.values()][0] as TreeFolderNode;
    expect(names(srcFolder)).toEqual(["new-name.ts"]);
  });

  it("builds independent subtrees for unrelated top-level directories", () => {
    const root = buildFileTree([file("src/foo.ts"), file("test/foo.test.ts"), file("README.md")]);
    expect(names(root).sort()).toEqual(["README.md", "src", "test"]);
  });
});
