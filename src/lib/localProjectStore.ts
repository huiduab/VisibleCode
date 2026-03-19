import type { TreeNodeSnapshot } from './analysisHistory';

export interface LocalProjectSnapshot {
  id: string;
  name: string;
  tree: TreeNodeSnapshot[];
  files: Record<string, string>;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'local_project_snapshots_v1';
const MAX_SNAPSHOTS = 5;

const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const getSnapshots = () => safeJsonParse<LocalProjectSnapshot[]>(localStorage.getItem(STORAGE_KEY), []);

const saveSnapshots = (snapshots: LocalProjectSnapshot[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
};

const buildTree = (paths: string[]): TreeNodeSnapshot[] => {
  const root: TreeNodeSnapshot[] = [];
  const map = new Map<string, TreeNodeSnapshot>();

  paths.sort((a, b) => a.localeCompare(b)).forEach(path => {
    const parts = path.split('/');
    for (let index = 0; index < parts.length; index += 1) {
      const currentPath = parts.slice(0, index + 1).join('/');
      if (map.has(currentPath)) continue;

      const isFile = index === parts.length - 1;
      const node: TreeNodeSnapshot = {
        name: parts[index],
        path: currentPath,
        type: isFile ? 'blob' : 'tree',
        children: isFile ? undefined : [],
      };
      map.set(currentPath, node);

      if (index === 0) {
        root.push(node);
      } else {
        const parent = map.get(parts.slice(0, index).join('/'));
        parent?.children?.push(node);
      }
    }
  });

  const sortTree = (nodes: TreeNodeSnapshot[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'tree' ? -1 : 1;
    });
    nodes.forEach(node => {
      if (node.children) sortTree(node.children);
    });
  };

  sortTree(root);
  return root;
};

export const saveLocalProjectSnapshot = async (fileList: FileList | File[]) => {
  const files = Array.from(fileList);
  if (files.length === 0) {
    throw new Error('未选择本地项目文件夹。');
  }

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const rootName = firstPath.split('/')[0] || 'local-project';
  const contentMap: Record<string, string> = {};
  const relativePaths: string[] = [];

  for (const file of files) {
    const rawPath = file.webkitRelativePath || file.name;
    const relativePath = rawPath.split('/').slice(1).join('/') || file.name;
    relativePaths.push(relativePath);

    try {
      contentMap[relativePath] = await file.text();
    } catch {
      contentMap[relativePath] = '// 无法读取该文件内容，可能是二进制文件。';
    }
  }

  const now = new Date().toISOString();
  const snapshot: LocalProjectSnapshot = {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: rootName,
    tree: buildTree(relativePaths),
    files: contentMap,
    fileCount: relativePaths.length,
    createdAt: now,
    updatedAt: now,
  };

  const existing = getSnapshots().filter(item => item.name !== snapshot.name);
  saveSnapshots([snapshot, ...existing]);
  return snapshot;
};

export const getLocalProjectSnapshot = (projectId: string) => {
  return getSnapshots().find(snapshot => snapshot.id === projectId) || null;
};
