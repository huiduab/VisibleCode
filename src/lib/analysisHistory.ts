import type { Edge, Node } from '@xyflow/react';

export type AnalysisSourceType = 'github' | 'local';

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

export interface FunctionCategoryItem {
  name: string;
  summary: string;
  color: string;
  functions: string[];
}

export interface AnalysisHistoryRecord {
  id: string;
  sourceType: AnalysisSourceType;
  sourceId: string;
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
  functionCategories: FunctionCategoryItem[];
  logs: LogEntrySnapshot[];
  nodes: Node[];
  edges: Edge[];
  markdownFileName: string;
  markdownContent: string;
}

const STORAGE_KEY = 'analysis_history_records_v1';
const MAX_RECORDS = 20;

const sanitizeLegacyText = (value: string) => {
  const replacements: Array<[string, string]> = [
    ['寮€濮嬪垎鏋愬嚱鏁?', '开始分析函数'],
    ['寮€濮?AI 鍒嗘瀽椤圭洰缁撴瀯...', '开始 AI 分析项目结构...'],
    ['寮€濮嬪垎鏋?', '开始分析 '],
    ['(娣卞害:', '(深度:'],
    ['鎴愬姛鎻愬彇', '成功提取'],
    ['鐨勫瓙鍑芥暟', '的子函数'],
    ['寮€濮嬬敓鎴愬叏鏅浘...', '开始生成全景图...'],
    ['鍒嗘瀽鍑芥暟', '分析函数'],
    ['澶辫触', '失败'],
    ['姝ｅ湪鑾峰彇鏂囦欢鍐呭', '正在获取文件内容'],
    ['鐮斿垽涓?..', '研判中...'],
    ['椤圭洰鍏ュ彛鏂囦欢', '项目入口文件'],
    ['鏆傛棤鏃ュ織', '暂无日志'],
    ['鏆傛棤 AI 鍒嗘瀽鎽樿', '暂无 AI 分析摘要'],
  ];

  return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), value);
};

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
    if (node.type === 'blob') files.push(node.path);
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

  if (nodeMap.has('root')) walk('root', []);
  else nodes.forEach(node => lines.push(formatNode(node.id)));
  return lines;
};

const toMarkdownSection = (title: string, content: string) => `## ${title}\n\n${content}\n`;

export const buildHistoryId = (sourceType: AnalysisSourceType, primary: string, secondary: string = '') =>
  `${sourceType}:${primary}${secondary ? `/${secondary}` : ''}`.toLowerCase();

export const buildAnalysisMarkdown = (record: Omit<AnalysisHistoryRecord, 'markdownContent' | 'markdownFileName'>) => {
  const languages = record.aiResult?.languages?.length ? record.aiResult.languages.join('、') : '无';
  const techStack = record.aiResult?.techStack?.length ? record.aiResult.techStack.join('、') : '无';
  const entryPoints = record.aiResult?.entryPoints?.length ? record.aiResult.entryPoints.map(item => `- ${item}`).join('\n') : '- 无';
  const verifiedEntryPoint = record.aiResult?.verifiedEntryPoint || '未确认';
  const callChains = buildCallChains(record.nodes, record.edges);
  const callChainMarkdown = callChains.length ? callChains.map(line => `- ${line}`).join('\n') : '- 无';
  const categoryMarkdown = record.functionCategories.length
    ? record.functionCategories.map(category => {
        const functions = category.functions.length ? category.functions.map(item => `  - ${item}`).join('\n') : '  - 无';
        return `- ${category.name}：${category.summary}\n${functions}`;
      }).join('\n')
    : '- 无';
  const logsMarkdown = record.logs.length
    ? record.logs.slice().reverse().map(log => {
        const parts = [`### ${log.time} ${log.title}`, '', log.message || '无消息'];
        if (log.inputData !== undefined) parts.push('', '输入：', '```json', JSON.stringify(log.inputData, null, 2), '```');
        if (log.data !== undefined) parts.push('', '输出：', '```json', JSON.stringify(log.data, null, 2), '```');
        return parts.join('\n');
      }).join('\n\n')
    : '无日志';
  const fileListMarkdown = record.fileList.length ? record.fileList.map(file => `- ${file}`).join('\n') : '- 无';
  const sourceLabel = record.sourceType === 'local' ? '本地项目' : 'GitHub 仓库';

  return [
    `# 项目分析工程文件\n\n- 来源类型：${sourceLabel}\n- 项目：${record.owner}/${record.repo}\n- 地址：${record.repoUrl}\n- 分支：${record.branch}\n- 创建时间：${record.createdAt}\n- 更新时间：${record.updatedAt}\n- 文件总数：${record.fileCount}\n`,
    toMarkdownSection('项目摘要', record.aiResult?.summary || '暂无'),
    toMarkdownSection('编程语言', languages),
    toMarkdownSection('技术栈', techStack),
    toMarkdownSection('候选入口文件', entryPoints),
    toMarkdownSection('确认入口文件', verifiedEntryPoint + (record.aiResult?.entryPointReason ? `\n\n原因：${record.aiResult.entryPointReason}` : '')),
    toMarkdownSection('文件列表', fileListMarkdown),
    toMarkdownSection('功能分类', categoryMarkdown),
    toMarkdownSection('完整调用链', callChainMarkdown),
    toMarkdownSection('Agent 工作日志', logsMarkdown),
  ].join('\n');
};

const sanitizeHistoryRecord = (record: AnalysisHistoryRecord): AnalysisHistoryRecord => ({
  ...record,
  sourceType: record.sourceType || 'github',
  sourceId: record.sourceId || record.id,
  aiResult: record.aiResult
    ? {
        ...record.aiResult,
        summary: sanitizeLegacyText(record.aiResult.summary),
        entryPointReason: record.aiResult.entryPointReason ? sanitizeLegacyText(record.aiResult.entryPointReason) : record.aiResult.entryPointReason,
      }
    : null,
  functionCategories: record.functionCategories.map(category => ({
    ...category,
    name: sanitizeLegacyText(category.name),
    summary: sanitizeLegacyText(category.summary),
    functions: category.functions.map(sanitizeLegacyText),
  })),
  logs: record.logs.map(log => ({
    ...log,
    title: sanitizeLegacyText(log.title),
    message: sanitizeLegacyText(log.message),
  })),
  markdownContent: sanitizeLegacyText(record.markdownContent),
});

export const getHistoryRecords = () => {
  return safeJsonParse<AnalysisHistoryRecord[]>(localStorage.getItem(STORAGE_KEY), []).map(record => {
    const normalized = sanitizeHistoryRecord({
      ...record,
      sourceType: (record as Partial<AnalysisHistoryRecord>).sourceType || 'github',
      sourceId: (record as Partial<AnalysisHistoryRecord>).sourceId || record.id,
    } as AnalysisHistoryRecord);
    return normalized;
  });
};

export const getHistoryRecord = (id: string) => {
  return getHistoryRecords().find(record => record.id === id || record.sourceId === id) || null;
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

export const extractFileList = flattenTree;

