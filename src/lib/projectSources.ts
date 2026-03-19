import type { TreeNodeSnapshot } from './analysisHistory';
import { getLocalProjectSnapshot } from './localProjectStore';

export type ProjectSourceType = 'github' | 'local';

export interface ProjectTreeNode {
  name: string;
  path: string;
  type: 'tree' | 'blob';
  children?: ProjectTreeNode[];
}

export interface LoadedProjectSource {
  sourceType: ProjectSourceType;
  sourceId: string;
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  tree: ProjectTreeNode[];
  fetchFileContent: (filePath: string) => Promise<string>;
}

export interface LoadProjectSourceOptions {
  sourceType: ProjectSourceType;
  owner?: string | null;
  repo?: string | null;
  projectId?: string | null;
  token?: string;
}

const cloneTree = (tree: TreeNodeSnapshot[]): ProjectTreeNode[] =>
  tree.map(node => ({
    name: node.name,
    path: node.path,
    type: node.type,
    children: node.children ? cloneTree(node.children) : undefined,
  }));

const buildGitHubSource = async ({ owner, repo, token }: LoadProjectSourceOptions): Promise<LoadedProjectSource> => {
  if (!owner || !repo) {
    throw new Error('缺少 GitHub 仓库信息。');
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    if (repoRes.status === 403) throw new Error('GitHub API 速率受限，请稍后重试或配置 Token。');
    if (repoRes.status === 404) throw new Error('未找到仓库，请检查 URL。');
    throw new Error('获取仓库信息失败。');
  }

  const repoData = await repoRes.json();
  const branch = repoData.default_branch as string;
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
  if (!treeRes.ok) throw new Error('获取文件树失败。');
  const treeData = await treeRes.json();

  const root: ProjectTreeNode[] = [];
  const map = new Map<string, ProjectTreeNode>();

  treeData.tree.forEach((item: any) => {
    const parts = item.path.split('/');
    const name = parts[parts.length - 1];
    const node: ProjectTreeNode = {
      name,
      path: item.path,
      type: item.type,
      children: item.type === 'tree' ? [] : undefined,
    };
    map.set(item.path, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parent = map.get(parts.slice(0, -1).join('/'));
      parent?.children?.push(node);
    }
  });

  const sortTree = (nodes: ProjectTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'tree' ? -1 : 1;
    });
    nodes.forEach(node => {
      if (node.children) sortTree(node.children);
    });
  };
  sortTree(root);

  return {
    sourceType: 'github',
    sourceId: `github:${owner}/${repo}`.toLowerCase(),
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}`,
    branch,
    tree: root,
    fetchFileContent: async (filePath: string) => {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      try {
        const rawHeaders: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' };
        if (token) rawHeaders.Authorization = `Bearer ${token}`;
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`, { headers: rawHeaders });
        if (!res.ok) throw new Error(`API Error ${res.status}`);
        return await res.text();
      } catch {
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`);
        if (!rawRes.ok) throw new Error(`Raw Error ${rawRes.status}`);
        return await rawRes.text();
      }
    },
  };
};

const buildLocalSource = async ({ projectId }: LoadProjectSourceOptions): Promise<LoadedProjectSource> => {
  if (!projectId) {
    throw new Error('缺少本地项目标识。');
  }

  const snapshot = getLocalProjectSnapshot(projectId);
  if (!snapshot) {
    throw new Error('本地项目快照不存在，请回到主页重新选择文件夹。');
  }

  return {
    sourceType: 'local',
    sourceId: `local:${snapshot.id}`,
    owner: 'local',
    repo: snapshot.name,
    repoUrl: `local://${snapshot.name}`,
    branch: 'local',
    tree: cloneTree(snapshot.tree),
    fetchFileContent: async (filePath: string) => snapshot.files[filePath] || '// 未找到文件内容',
  };
};

export const loadProjectSource = async (options: LoadProjectSourceOptions): Promise<LoadedProjectSource> => {
  if (options.sourceType === 'local') {
    return buildLocalSource(options);
  }
  return buildGitHubSource(options);
};
