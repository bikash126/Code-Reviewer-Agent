import React, { useMemo } from "react";
import { ChangedFile, FileDiffOpenStatus } from "../../types";

export interface TreeFolderNode {
  type: "folder";
  name: string;
  path: string;
  children: Map<string, TreeNode>;
}
export interface TreeFileNode {
  type: "file";
  name: string;
  file: ChangedFile;
}
export type TreeNode = TreeFolderNode | TreeFileNode;

export function buildFileTree(files: ChangedFile[]): TreeFolderNode {
  const root: TreeFolderNode = { type: "folder", name: "", path: "", children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      const existing = current.children.get(segment);
      if (existing && existing.type === "folder") {
        current = existing;
        continue;
      }
      const folder: TreeFolderNode = {
        type: "folder",
        name: segment,
        path: current.path ? `${current.path}/${segment}` : segment,
        children: new Map(),
      };
      current.children.set(segment, folder);
      current = folder;
    }
    const fileName = parts[parts.length - 1] ?? file.path;
    current.children.set(`\0file:${fileName}`, { type: "file", name: fileName, file });
  }

  compressChains(root);
  return root;
}

/** Collapses folder chains with only a single subfolder into one row, e.g. "src/main/java". */
function compressChains(folder: TreeFolderNode): void {
  for (const child of folder.children.values()) {
    if (child.type !== "folder") {
      continue;
    }
    compressChains(child);
    while (child.children.size === 1) {
      const [onlyChild] = child.children.values();
      if (onlyChild.type !== "folder") {
        break;
      }
      child.name = `${child.name}/${onlyChild.name}`;
      child.path = onlyChild.path;
      child.children = onlyChild.children;
    }
  }
}

function sortedEntries(node: TreeFolderNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

interface CommonProps {
  fileDiffStatusByPath: Record<string, FileDiffOpenStatus>;
  fileDiffErrorByPath: Record<string, string>;
  onOpenFileDiff: (path: string) => void;
}

interface Props extends CommonProps {
  files: ChangedFile[];
}

/** Renders a PR's changed files grouped into a folder tree instead of a flat list. */
export function FileTree({ files, fileDiffStatusByPath, fileDiffErrorByPath, onOpenFileDiff }: Props): React.JSX.Element {
  const root = useMemo(() => buildFileTree(files), [files]);
  return (
    <ul className="file-tree">
      <FileTreeChildren
        node={root}
        fileDiffStatusByPath={fileDiffStatusByPath}
        fileDiffErrorByPath={fileDiffErrorByPath}
        onOpenFileDiff={onOpenFileDiff}
      />
    </ul>
  );
}

function FileTreeChildren({ node, ...rest }: { node: TreeFolderNode } & CommonProps): React.JSX.Element {
  return (
    <>
      {sortedEntries(node).map((child) =>
        child.type === "folder" ? (
          <li key={child.path} className="file-tree-folder">
            <details open>
              <summary className="file-tree-folder-label">{child.name}</summary>
              <ul className="file-tree-children">
                <FileTreeChildren node={child} {...rest} />
              </ul>
            </details>
          </li>
        ) : (
          <FileTreeLeaf key={child.file.path} file={child.file} name={child.name} {...rest} />
        ),
      )}
    </>
  );
}

function FileTreeLeaf({
  file,
  name,
  fileDiffStatusByPath,
  fileDiffErrorByPath,
  onOpenFileDiff,
}: { file: ChangedFile; name: string } & CommonProps): React.JSX.Element {
  const status = fileDiffStatusByPath[file.path];
  const error = fileDiffErrorByPath[file.path];
  const title = file.oldPath && file.oldPath !== file.path ? `${file.oldPath} -> ${file.path}` : file.path;

  return (
    <li className="pr-changed-file">
      <div
        className="pr-changed-file-row"
        onClick={() => onOpenFileDiff(file.path)}
        role="button"
        tabIndex={0}
        title={title}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onOpenFileDiff(file.path);
          }
        }}
      >
        <span className={`file-status file-status-${file.status}`}>{file.status[0].toUpperCase()}</span>
        <span className="file-path">{name}</span>
        {status === "loading" && <span className="file-diff-spinner">Opening...</span>}
        <span className="file-stats">
          +{file.linesAdded}/-{file.linesRemoved}
        </span>
      </div>
      {status === "error" && (
        <div className="error-banner file-diff-error">{error ?? `Failed to open diff for ${file.path}.`}</div>
      )}
    </li>
  );
}
