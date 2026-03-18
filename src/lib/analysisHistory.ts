import type { Edge, Node } from '@xyflow/react';

export interface TreeNodeSnapshot {
  name: string;
  path: string;
  type: 'tree' | 'blob';
  children?: TreeNodeSnapshot[];
}

export interface AIAnalysisResultSnapshot {
  languages: string[];
  techStack: string[];
  entryPoints: string[];
  summary: string;
  verifiedEntryPoint?: string;
  entryPointReason?: string;
}

export interface LogEntrySnapshot {
  id: string;
  time: string;
  title: string;
  message: string;
  data?: any;
  inputData?: any;
}

export interface AnalysisHistoryRecord {
  id: string;
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  fileList: string[];
  tree: TreeNodeSnapshot[];
  aiResult: AIAnalysisResultSnapshot | null;
  logs: LogEntrySnapshot[];
  nodes: Node[];
  edges: Edge[];
  markdownFileName: string;
  markdownContent: string;
}

const STORAGE_KEY = 'analysis_history_records_v1';
const MAX_RECORDS = 20;

const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const flattenTree = (nodes: TreeNodeSnapshot[]): string[] => {
  const files: string[] = [];
  const walk = (node: TreeNodeSnapshot) => {
    if (node.type === 'blob') {
      files.push(node.path);
    }
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return files.sort((a, b) => a.localeCompare(b));
};

const buildCallChains = (nodes: Node[], edges: Edge[]) => {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string[]>();

  edges.forEach(edge => {
    const current = outgoing.get(edge.source) || [];
    current.push(edge.target);
    outgoing.set(edge.source, current);
  });

  const formatNode = (id: string) => {
    const node = nodeMap.get(id);
    const data = (node?.data || {}) as { name?: string; possibleFile?: string };
    const name = data.name || id;
    return data.possibleFile ? `${name} (${data.possibleFile})` : name;
  };

  const lines: string[] = [];
  const walk = (id: string, path: string[]) => {
    const nextPath = [...path, formatNode(id)];
    const children = outgoing.get(id) || [];
    if (children.length === 0) {
      lines.push(nextPath.join(' -> '));
      return;
    }
    children.forEach(childId => walk(childId, nextPath));
  };

  if (nodeMap.has('root')) {
    walk('root', []);
  } else {
    nodes.forEach(node => lines.push(formatNode(node.id)));
  }

  return lines;
};

const toMarkdownSection = (title: string, content: string) => `## ${title}\n\n${content}\n`;

export const buildAnalysisMarkdown = (record: Omit<AnalysisHistoryRecord, 'markdownContent' | 'markdownFileName'>) => {
  const languages = record.aiResult?.languages?.length ? record.aiResult.languages.join('、') : '无';
  const techStack = record.aiResult?.techStack?.length ? record.aiResult.techStack.join('、') : '无';
  const entryPoints = record.aiResult?.entryPoints?.length ? record.aiResult.entryPoints.map(item => `- ${item}`).join('\n') : '- 无';
  const verifiedEntryPoint = record.aiResult?.verifiedEntryPoint || '未确认';
  const callChains = buildCallChains(record.nodes, record.edges);
  const callChainMarkdown = callChains.length ? callChains.map(line => `- ${line}`).join('\n') : '- 无';
  const logsMarkdown = record.logs.length
    ? record.logs
        .slice()
        .reverse()
        .map(log => {
          const parts = [
            `### ${log.time} ${log.title}`,
            '',
            log.message || '无消息',
          ];
          if (log.inputData !== undefined) {
            parts.push('', '输入：', '```json', JSON.stringify(log.inputData, null, 2), '```');
          }
          if (log.data !== undefined) {
            parts.push('', '输出：', '```json', JSON.stringify(log.data, null, 2), '```');
          }
          return parts.join('\n');
        })
        .join('\n\n')
    : '无日志';
  const fileListMarkdown = record.fileList.length ? record.fileList.map(file => `- ${file}`).join('\n') : '- 无';

  const sections = [
    `# 项目分析工程文件\n\n- 项目：${record.owner}/${record.repo}\n- 地址：${record.repoUrl}\n- 分支：${record.branch}\n- 创建时间：${record.createdAt}\n- 更新时间：${record.updatedAt}\n- 文件总数：${record.fileCount}\n`,
    toMarkdownSection('项目摘要', record.aiResult?.summary || '暂无'),
    toMarkdownSection('编程语言', languages),
    toMarkdownSection('技术栈', techStack),
    toMarkdownSection('候选入口文件', entryPoints),
    toMarkdownSection('确认入口文件', verifiedEntryPoint + (record.aiResult?.entryPointReason ? `\n\n原因：${record.aiResult.entryPointReason}` : '')),
    toMarkdownSection('文件列表', fileListMarkdown),
    toMarkdownSection('完整调用链', callChainMarkdown),
    toMarkdownSection('Agent 工作日志', logsMarkdown),
  ];

  return sections.join('\n');
};

export const getHistoryRecords = () => {
  return safeJsonParse<AnalysisHistoryRecord[]>(localStorage.getItem(STORAGE_KEY), []);
};

export const getHistoryRecord = (owner: string, repo: string) => {
  const key = `${owner}/${repo}`.toLowerCase();
  return getHistoryRecords().find(record => `${record.owner}/${record.repo}`.toLowerCase() === key) || null;
};

export const saveHistoryRecord = (record: Omit<AnalysisHistoryRecord, 'markdownContent' | 'markdownFileName'>) => {
  const markdownFileName = `${record.owner}-${record.repo}-analysis.md`;
  const markdownContent = buildAnalysisMarkdown(record);
  const nextRecord: AnalysisHistoryRecord = {
    ...record,
    markdownFileName,
    markdownContent,
  };

  const existing = getHistoryRecords().filter(item => item.id !== record.id);
  const merged = [nextRecord, ...existing].slice(0, MAX_RECORDS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return nextRecord;
};

export const removeHistoryRecord = (id: string) => {
  const filtered = getHistoryRecords().filter(record => record.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const buildHistoryId = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase();

export const extractFileList = flattenTree;
