import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Github, Search, ArrowLeft, Loader2, FileCode2, Folder, File, ChevronRight, ChevronDown, Key, Sparkles, X, Terminal, Maximize2, Check, Plus, Code2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ReactFlow, Background, Controls, Node, Edge, Position, Handle, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import dagre from 'dagre';
import { buildHistoryId, extractFileList, getHistoryRecord, saveHistoryRecord, type AnalysisHistoryRecord } from '../lib/analysisHistory';

const FunctionNodeComponent = ({ data }: any) => {
  const fileName = data.possibleFile ? data.possibleFile.split('/').pop() : '未知文件';
  
  let statusTag = null;
  if (data.canDrillDown) {
    statusTag = (
      <button 
        onClick={(e) => {
          e.stopPropagation();
          data.onDrillDown(data);
        }}
        className="text-[10px] px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-800/50 rounded-full hover:bg-blue-800/50 transition-colors"
      >
        继续下钻
      </button>
    );
  } else if (data.drillDownStatus === -1) {
    statusTag = <span className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded-full">无需下钻</span>;
  } else if (data.drillDownStatus === 0) {
    statusTag = <span className="text-[10px] px-2 py-1 bg-yellow-900/30 text-yellow-500 rounded-full">不确定</span>;
  } else if (data.drillDownStatus === 1 && !data.canDrillDown) {
    statusTag = <span className="text-[10px] px-2 py-1 bg-emerald-900/30 text-emerald-500 rounded-full">已展开</span>;
  }

  return (
    <div className="group relative bg-zinc-950 text-zinc-200 rounded-lg border border-zinc-800 shadow-lg min-w-[220px] max-w-[280px] w-max font-sans transition-all hover:border-zinc-600">
      <Handle type="target" position={Position.Left} className="w-0 h-0 border-0 bg-transparent" />
      
      {/* Header: File name */}
      <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50 rounded-t-lg flex items-center text-zinc-400">
        <File className="w-3.5 h-3.5 mr-1.5" />
        <span className="font-mono text-xs truncate">{fileName}</span>
      </div>
      
      {/* Body: Function name and description */}
      <div className="p-3 bg-zinc-950 rounded-b-lg flex flex-col gap-2">
        <div className="flex items-start">
          <Code2 className="w-4 h-4 mr-1.5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="font-bold text-zinc-200 text-sm break-all">{data.name}</div>
        </div>
        <div className="text-zinc-400 text-xs leading-relaxed pl-5">
          {data.usage}
        </div>
        <div className="flex justify-end mt-1">
          {statusTag}
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} className="w-0 h-0 border-0 bg-transparent" />
    </div>
  );
};

const nodeTypes = {
  customFunction: FunctionNodeComponent,
};

interface TreeNode {
  name: string;
  path: string;
  type: 'tree' | 'blob';
  children?: TreeNode[];
}

interface AIAnalysisResult {
  languages: string[];
  techStack: string[];
  entryPoints: string[];
  summary: string;
  verifiedEntryPoint?: string;
  entryPointReason?: string;
}

interface LogEntry {
  id: string;
  time: string;
  title: string;
  message: string;
  data?: any;
  inputData?: any;
}

type JsonSchema = Record<string, any>;

const AI_API_KEY = process.env.AI_API_KEY as string | undefined;
const BASE_URL = (process.env.BASE_URL as string | undefined)?.replace(/\/+$/, '');
const MODEL = process.env.MODEL as string | undefined;

const ensureAiConfig = () => {
  if (!AI_API_KEY || !BASE_URL || !MODEL) {
    throw new Error('AI 配置缺失，请在 .env 中设置 AI_API_KEY、BASE_URL、MODEL。');
  }
};

const extractResponseText = (data: any) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
      .join('');
  }
  return '';
};

const buildJsonPrompt = (prompt: string, schema: JsonSchema) => (
  `${prompt}\n\n请严格返回 JSON，不要使用 Markdown 代码块，也不要输出额外解释。\nJSON Schema:\n${JSON.stringify(schema, null, 2)}`
);

const callAi = async <T,>(prompt: string, schema?: JsonSchema): Promise<T | string> => {
  ensureAiConfig();

  const postChat = async (body: Record<string, any>) => {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API ${response.status}: ${errorText || 'request failed'}`);
    }

    return response.json();
  };

  if (schema) {
    try {
      const structuredData = await postChat({
        model: MODEL,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'analysis_response',
            schema,
          },
        },
      });
      const text = extractResponseText(structuredData);
      if (!text) throw new Error('empty response');
      return JSON.parse(text) as T;
    } catch (error) {
      console.warn('Structured output failed, retrying with prompt-enforced JSON.', error);
      const fallbackData = await postChat({
        model: MODEL,
        temperature: 0.1,
        messages: [{ role: 'user', content: buildJsonPrompt(prompt, schema) }],
      });
      const fallbackText = extractResponseText(fallbackData);
      if (!fallbackText) throw new Error('AI 返回为空');
      return JSON.parse(fallbackText) as T;
    }
  }

  const data = await postChat({
    model: MODEL,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractResponseText(data).trim();
};

const analysisResultSchema = {
  type: 'object',
  properties: {
    languages: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of main programming languages used in the project',
    },
    techStack: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of frameworks, libraries, and tools used',
    },
    entryPoints: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of likely entry point file paths',
    },
    summary: {
      type: 'string',
      description: 'A short 1-2 sentence summary of the project based on its files, written in Chinese',
    },
  },
  required: ['languages', 'techStack', 'entryPoints', 'summary'],
  additionalProperties: false,
} satisfies JsonSchema;

const verifyEntrySchema = {
  type: 'object',
  properties: {
    isEntryPoint: { type: 'boolean', description: '是否是入口文件' },
    reason: { type: 'string', description: '判断原因' },
  },
  required: ['isEntryPoint', 'reason'],
  additionalProperties: false,
} satisfies JsonSchema;

const subFunctionSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      possibleFile: { type: 'string' },
      usage: { type: 'string' },
      drillDownStatus: { type: 'integer' },
    },
    required: ['name', 'possibleFile', 'usage', 'drillDownStatus'],
    additionalProperties: false,
  },
} satisfies JsonSchema;

const codeExts = new Set(['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'json', 'sh', 'md', 'xml', 'yaml', 'yml', 'sql', 'graphql', 'swift', 'kt', 'dart']);
const panoramaCodeExts = new Set(['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'dart']);

const collectCodeFiles = (tree: TreeNode[], allowedExts: Set<string>) => {
  const files: string[] = [];
  const traverse = (node: TreeNode) => {
    if (node.type === 'blob') {
      const ext = node.name.split('.').pop()?.toLowerCase();
      if (ext && allowedExts.has(ext)) {
        files.push(node.path);
      }
    }
    node.children?.forEach(traverse);
  };
  tree.forEach(traverse);
  return files;
};

const sanitizeNodesForStorage = (nodes: Node[]) =>
  nodes.map(node => {
    const data = { ...((node.data || {}) as Record<string, any>) };
    delete data.onDrillDown;
    return {
      ...node,
      data,
    };
  });

export default function Analyze() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');

  const [urlInput, setUrlInput] = useState(`https://github.com/${owner}/${repo}`);
  const [token, setToken] = useState(localStorage.getItem('github_token') || '');
  const [showTokenInput, setShowTokenInput] = useState(!localStorage.getItem('github_token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [branch, setBranch] = useState('main');
  
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');

  const [aiCallCount, setAiCallCount] = useState(0);
  const isAnalysisStoppedRef = useRef(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLog, setExpandedLog] = useState<LogEntry | null>(null);
  const [showFullLogs, setShowFullLogs] = useState(false);

  // Panorama State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isGeneratingPanorama, setIsGeneratingPanorama] = useState(false);
  const [panoramaError, setPanoramaError] = useState('');
  const [showPanoramaFullscreen, setShowPanoramaFullscreen] = useState(false);

  // Panel Visibility State
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showMiddlePanel, setShowMiddlePanel] = useState(true);
  const [showCodePanel, setShowCodePanel] = useState(true);
  const [showPanoramaPanel, setShowPanoramaPanel] = useState(true);

  const historyIdRef = useRef(owner && repo ? buildHistoryId(owner, repo) : '');
  const historyCreatedAtRef = useRef<string>('');
  const loadedFromHistoryRef = useRef(false);
  const [historyMeta, setHistoryMeta] = useState<Pick<AnalysisHistoryRecord, 'updatedAt' | 'markdownFileName'> | null>(null);

  const addLog = (title: string, message: string, data?: any, inputData?: any) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      title,
      message,
      data,
      inputData
    }, ...prev]);
  };

  const hydrateNodesFromHistory = useCallback((storedNodes: Node[], currentTree: TreeNode[]) => {
    const currentCodeFiles = collectCodeFiles(currentTree, panoramaCodeExts);
    return storedNodes.map(node => {
      const data = { ...((node.data || {}) as Record<string, any>) };
      if (typeof data.name === 'string') {
        data.onDrillDown = (payload: any) => manualDrillDown(payload, node.id, data.depth ?? 0, currentCodeFiles);
      }
      return {
        ...node,
        data,
      };
    });
  }, []);

  useEffect(() => {
    if (!owner || !repo) {
      navigate('/');
      return;
    }

    historyIdRef.current = buildHistoryId(owner, repo);
    loadedFromHistoryRef.current = false;
    setUrlInput(`https://github.com/${owner}/${repo}`);

    const cachedRecord = getHistoryRecord(owner, repo);
    if (cachedRecord) {
      historyCreatedAtRef.current = cachedRecord.createdAt;
      setBranch(cachedRecord.branch);
      setTree(cachedRecord.tree);
      setAiResult(cachedRecord.aiResult);
      setLogs(cachedRecord.logs);
      setNodes(hydrateNodesFromHistory(cachedRecord.nodes, cachedRecord.tree));
      setEdges(cachedRecord.edges);
      setHistoryMeta({
        updatedAt: cachedRecord.updatedAt,
        markdownFileName: cachedRecord.markdownFileName,
      });
      setError('');
      setLoading(false);
      loadedFromHistoryRef.current = true;
      return;
    }

    const fetchRepo = async () => {
      setLoading(true);
      setError('');
      addLog('GitHub API', `开始分析 ${owner}/${repo}...`);
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // 1. Get default branch
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!repoRes.ok) {
          if (repoRes.status === 403) throw new Error('GitHub API 速率限制。请稍后再试或配置 Token。');
          if (repoRes.status === 404) throw new Error('未找到仓库。请检查 URL。');
          throw new Error('获取仓库信息失败。');
        }
        const repoData = await repoRes.json();
        const defaultBranch = repoData.default_branch;
        setBranch(defaultBranch);
        addLog('GitHub API', `仓库验证成功。默认分支: ${defaultBranch}`);

        // 2. Get tree
        const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
        if (!treeRes.ok) throw new Error('获取文件树失败。');
        const treeData = await treeRes.json();
        addLog('GitHub API', `成功获取文件树。总文件数: ${treeData.tree.length}`);

        // 3. Build tree structure
        const root: TreeNode[] = [];
        const map = new Map<string, TreeNode>();

        treeData.tree.forEach((item: any) => {
          const parts = item.path.split('/');
          const name = parts[parts.length - 1];
          const node: TreeNode = {
            name,
            path: item.path,
            type: item.type,
            children: item.type === 'tree' ? [] : undefined
          };
          map.set(item.path, node);

          if (parts.length === 1) {
            root.push(node);
          } else {
            const parentPath = parts.slice(0, -1).join('/');
            const parent = map.get(parentPath);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          }
        });

        const sortTree = (nodes: TreeNode[]) => {
          nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'tree' ? -1 : 1;
          });
          nodes.forEach(node => {
            if (node.children) sortTree(node.children);
          });
        };
        sortTree(root);

        setTree(root);
        historyCreatedAtRef.current = historyCreatedAtRef.current || new Date().toISOString();
      } catch (err: any) {
        setError(err.message || '发生未知错误。');
        addLog('Error', `GitHub API 错误: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchRepo();
  }, [owner, repo, navigate, token, hydrateNodesFromHistory, setEdges, setNodes]);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    const match = urlInput.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      navigate(`/analyze?owner=${match[1]}&repo=${match[2].replace(/\.git$/, '')}`);
    } else {
      setError('无效的 GitHub URL 格式。');
    }
  };

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path);
    setLoadingFile(true);
    setFileContent('');
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let text = '';
      
      try {
        // 1. 尝试使用 GitHub API 获取（支持私有仓库和 Token）
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3.raw'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`, { headers });
        if (!res.ok) throw new Error(`API Error ${res.status}`);
        text = await res.text();
      } catch (apiErr: any) {
        console.warn('API fetch failed, trying raw fallback...', apiErr);
        // 2. 如果 API 失败（如速率限制、文件大于 1MB），降级使用 raw.githubusercontent.com
        // 注意：这里绝对不能带 Authorization header，否则会触发跨域 (CORS) 预检请求失败导致 Failed to fetch
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`);
        if (!rawRes.ok) throw new Error(`Raw Error ${rawRes.status}`);
        text = await rawRes.text();
      }
      
      setFileContent(text);
    } catch (err: any) {
      console.error('File fetch error:', err);
      setFileContent(`// 加载文件内容错误。\n// 可能是二进制文件、文件过大，或者发生了 API 错误。\n// 错误详情: ${err.message}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      json: 'json', html: 'html', css: 'css', md: 'markdown',
      py: 'python', go: 'go', rs: 'rust', java: 'java',
      cpp: 'cpp', c: 'c', cs: 'csharp', rb: 'ruby',
      php: 'php', sh: 'bash', yml: 'yaml', yaml: 'yaml',
      xml: 'xml', sql: 'sql', graphql: 'graphql'
    };
    return map[ext || ''] || 'text';
  };

  const handleAIAnalysis = async () => {
    isAnalysisStoppedRef.current = false;
    setIsAnalyzing(true);
    setAiError('');
    setAiResult(null);
    addLog('AI Analysis', '开始 AI 分析项目结构...');
    try {
      const files = collectCodeFiles(tree, codeExts);

      if (files.length === 0) {
        throw new Error('未找到可分析的代码文件。');
      }

      addLog('AI Analysis', `已过滤出 ${files.length} 个代码文件用于分析。`);
      const fileListStr = files.slice(0, 1000).join('\n');
      
      const promptText = `分析以下来自 GitHub 仓库的文件路径列表。识别出项目使用的主要编程语言、技术栈（框架、库、工具）、可能的入口文件（例如 main.ts, index.js, App.java 等），并用中文提供 1-2 句话的项目简介。\n\n文件列表:\n${fileListStr}`;
      
      if (isAnalysisStoppedRef.current) throw new Error('Analysis stopped by user');
      setAiCallCount(c => c + 1);
      const result = await callAi<AIAnalysisResult>(promptText, analysisResultSchema) as AIAnalysisResult;
      if (result) {
        setAiResult(result);
        addLog('AI Analysis', '初步分析完成，开始研判入口文件...', result, { prompt: promptText });

        // Step 2: Verify entry points
        let foundRealEntryPoint = false;
        for (const ep of result.entryPoints) {
          addLog('AI Verify', `正在获取文件内容: ${ep}`);
          try {
            const encodedPath = ep.split('/').map(encodeURIComponent).join('/');
            let content = '';
            try {
              const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3.raw'
              };
              if (token) {
                headers['Authorization'] = `Bearer ${token}`;
              }
              const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`, { headers });
              if (!res.ok) throw new Error(`API Error ${res.status}`);
              content = await res.text();
            } catch (apiErr) {
              const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`);
              if (!rawRes.ok) throw new Error(`Raw Error ${rawRes.status}`);
              content = await rawRes.text();
            }

            const lines = content.split('\n');
            let contentToSend = content;
            if (lines.length > 4000) {
              contentToSend = lines.slice(0, 2000).join('\n') + '\n\n... [中间部分已省略] ...\n\n' + lines.slice(-2000).join('\n');
            }

            const verifyPrompt = `请研判以下文件是否是当前项目的真实入口文件。
项目 GitHub: https://github.com/${owner}/${repo}
项目简介: ${result.summary}
技术栈: ${result.techStack.join(', ')}
文件路径: ${ep}

文件内容:
\`\`\`
${contentToSend}
\`\`\`

请根据以上信息判断该文件是否为项目的核心入口文件（如启动文件、主应用组件等）。
返回 JSON 格式，包含两个字段：
- isEntryPoint (boolean): 是否是入口文件
- reason (string): 判断原因（中文）`;

            addLog('AI Verify', `正在研判文件: ${ep}`, undefined, { prompt: verifyPrompt });

            if (isAnalysisStoppedRef.current) throw new Error('Analysis stopped by user');
            setAiCallCount(c => c + 1);
            const verifyResult = await callAi<{ isEntryPoint: boolean; reason: string }>(verifyPrompt, verifyEntrySchema) as { isEntryPoint: boolean; reason: string };
            addLog('AI Verify', `文件 ${ep} 研判完成: ${verifyResult.isEntryPoint ? '是' : '否'}`, verifyResult, { prompt: verifyPrompt });
            
            if (verifyResult.isEntryPoint) {
              result.verifiedEntryPoint = ep;
              result.entryPointReason = verifyResult.reason;
              setAiResult({ ...result });
              foundRealEntryPoint = true;
              break;
            }
          } catch (err: any) {
            addLog('AI Verify Error', `研判文件 ${ep} 失败: ${err.message}`);
          }
        }
        
        if (!foundRealEntryPoint) {
           addLog('AI Verify', '所有候选文件研判完毕，未找到确切的入口文件。');
        }

      } else {
        throw new Error('AI 返回结果为空');
      }
    } catch (err: any) {
      console.error('AI Analysis error:', err);
      setAiError(err.message || 'AI 分析项目失败。');
      addLog('Error', `AI 分析失败: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchFileContent = async (filePath: string) => {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    try {
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3.raw' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`, { headers });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      return await res.text();
    } catch (apiErr) {
      const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`);
      if (!rawRes.ok) throw new Error(`Raw Error ${rawRes.status}`);
      return await rawRes.text();
    }
  };

  const resolveFilePath = async (guessedPath: string, funcName: string, callerPath: string, codeFiles: string[]) => {
    if (guessedPath && codeFiles.includes(guessedPath)) return guessedPath;
    
    if (codeFiles.length === 0) return callerPath;

    const promptText = `
      我需要找到函数 \`${funcName}\` 的定义所在的文件。
      调用该函数的文件是：\`${callerPath}\`。
      猜测的文件路径是：\`${guessedPath}\`。
      
      请从以下项目中所有的代码文件列表中，找出最可能包含该函数定义的文件路径。
      如果找不到，请返回调用者的文件路径 \`${callerPath}\`。
      
      文件列表：
      ${codeFiles.join('\n')}
      
      请仅返回最可能的文件路径字符串，不要有任何其他解释或格式。
    `;

    try {
      if (isAnalysisStoppedRef.current) throw new Error('Analysis stopped by user');
      setAiCallCount(c => c + 1);
      const resultPath = await callAi<string>(promptText) as string;
      if (codeFiles.includes(resultPath)) return resultPath;
    } catch (e) {
      console.error('Error resolving file path:', e);
    }
    
    return callerPath;
  };

  const applyLayout = useCallback((nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 20, ranksep: 60 });

    const newNodes = nodes.map(n => ({ ...n }));
    
    newNodes.forEach((node) => {
      let estimatedWidth = 250;
      let estimatedHeight = 100;
      if (node.data) {
        const nodeData = node.data as { name?: string; usage?: string };
        const textLen = (nodeData.name?.length || 0) + (nodeData.usage?.length || 0);
        estimatedWidth = Math.min(280, Math.max(220, textLen * 3 + 100));
        const usageLen = nodeData.usage?.length || 0;
        estimatedHeight = 80 + Math.ceil(usageLen / 15) * 16;
      }
      const width = node.measured?.width || estimatedWidth;
      const height = node.measured?.height || estimatedHeight;
      
      dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    newNodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.targetPosition = Position.Left;
      node.sourcePosition = Position.Right;
      
      // Shift position to top-left (dagre returns center)
      const width = nodeWithPosition.width;
      const height = nodeWithPosition.height;
      node.position = {
        x: nodeWithPosition.x - width / 2 + 50,
        y: nodeWithPosition.y - height / 2 + 50,
      };
    });

    return { nodes: newNodes, edges };
  }, []);

  const lastLayoutStrRef = useRef<string>('');

  useEffect(() => {
    if (nodes.length === 0) return;
    
    const currentLayoutStr = nodes.map(n => `${n.id}-${n.measured?.width || 0}-${n.measured?.height || 0}`).join('|');
    
    if (currentLayoutStr !== lastLayoutStrRef.current) {
      lastLayoutStrRef.current = currentLayoutStr;
      const layouted = applyLayout(nodes, edges);
      
      let changed = false;
      for (let i = 0; i < nodes.length; i++) {
        const oldNode = nodes.find(n => n.id === layouted.nodes[i].id);
        if (!oldNode || oldNode.position.x !== layouted.nodes[i].position.x || 
            oldNode.position.y !== layouted.nodes[i].position.y) {
          changed = true;
          break;
        }
      }
      
      if (changed) {
        setNodes(layouted.nodes);
      }
    }
  }, [nodes, edges, applyLayout, setNodes]);

  const manualDrillDown = async (nodeData: any, nodeId: string, currentDepth: number, codeFiles: string[]) => {
    isAnalysisStoppedRef.current = false;
    setIsGeneratingPanorama(true);
    try {
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, canDrillDown: false } } : n));

      const targetFile = await resolveFilePath(nodeData.possibleFile, nodeData.name, 'unknown', codeFiles);
      if (targetFile) {
        await analyzeFunction(nodeData.name, targetFile, currentDepth + 1, nodeId, codeFiles, true);
      }
    } finally {
      setIsGeneratingPanorama(false);
    }
  };

  const analyzeFunction = async (
    funcName: string, 
    filePath: string, 
    depth: number, 
    parentId: string, 
    codeFiles: string[],
    isManual: boolean = false
  ) => {
    if (depth > 1 && !isManual) return;

    addLog('Panorama', `开始分析函数: ${funcName} (深度: ${depth})`, { file: filePath });

    try {
      const content = await fetchFileContent(filePath);
      
      const promptText = `你是一个代码分析专家。请分析以下文件 \`${filePath}\` 中的 \`${funcName}\` 函数（如果 \`${funcName}\` 是文件本身，请分析该文件的主要执行逻辑或默认导出）。
提取该函数内部调用的**关键子函数**。

请返回一个 JSON 数组，每个对象包含：
- name: 子函数名
- possibleFile: 该子函数最可能所在的文件路径（请结合当前文件路径猜测，如果是当前文件则填当前文件路径）
- usage: 该子函数在当前上下文中的作用（简短描述）
- drillDownStatus: 研判是否需要进一步下钻分析。-1表示不需要（如标准库、第三方库函数），0表示不确定，1表示需要（如项目自定义的关键业务函数）。

代码内容：
${content.substring(0, 15000)}`;

      if (isAnalysisStoppedRef.current) throw new Error('Analysis stopped by user');
      setAiCallCount(c => c + 1);
      const subFunctions = await callAi<Array<{ name: string; possibleFile: string; usage: string; drillDownStatus: number }>>(promptText, subFunctionSchema) as Array<{ name: string; possibleFile: string; usage: string; drillDownStatus: number }>;
      if (subFunctions) {
        addLog('Panorama', `成功提取 ${funcName} 的子函数`, subFunctions);

        let newNodesToAdd: Node[] = [];
        let newEdgesToAdd: Edge[] = [];

        for (let i = 0; i < subFunctions.length; i++) {
          const fn = subFunctions[i];
          const id = `${parentId}-fn-${i}`;
          
          const canDrillDown = fn.drillDownStatus === 1 && depth >= 1;
          const shouldAutoDrillDown = fn.drillDownStatus === 1 && depth < 1;

          newNodesToAdd.push({
            id,
            type: 'customFunction',
            position: { x: 0, y: 0 }, // Will be set by layout
            data: {
              ...fn,
              depth,
              canDrillDown,
              onDrillDown: (data: any) => manualDrillDown(data, id, depth, codeFiles)
            }
          });

          newEdgesToAdd.push({
            id: `e-${parentId}-${id}`,
            source: parentId,
            target: id,
            type: 'step',
            animated: false,
            style: { stroke: '#52525b', strokeWidth: 1.5, strokeDasharray: '4 4' }
          });
        }
        
        setNodes(prevNodes => {
          const updatedNodes = [...prevNodes, ...newNodesToAdd];
          setEdges(prevEdges => {
            const updatedEdges = [...prevEdges, ...newEdgesToAdd];
            const layouted = applyLayout(updatedNodes, updatedEdges);
            setTimeout(() => setNodes(layouted.nodes), 0);
            return layouted.edges;
          });
          return updatedNodes;
        });

        // Trigger auto drill down
        for (let i = 0; i < subFunctions.length; i++) {
          const fn = subFunctions[i];
          const id = `${parentId}-fn-${i}`;
          const shouldAutoDrillDown = fn.drillDownStatus === 1 && depth < 1;

          if (shouldAutoDrillDown) {
            const targetFile = await resolveFilePath(fn.possibleFile, fn.name, filePath, codeFiles);
            if (targetFile) {
               await analyzeFunction(fn.name, targetFile, depth + 1, id, codeFiles);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`Error analyzing ${funcName}:`, err);
      addLog('Panorama Error', `分析函数 ${funcName} 失败: ${err.message}`);
    }
  };

  const generatePanorama = async () => {
    if (!aiResult?.verifiedEntryPoint) return;
    isAnalysisStoppedRef.current = false;
    setIsGeneratingPanorama(true);
    setPanoramaError('');
    addLog('Panorama', '开始生成全景图...');
    
    try {
      const ep = aiResult.verifiedEntryPoint;
      
      const codeFiles = collectCodeFiles(tree, panoramaCodeExts);

      const initialNodes: Node[] = [{
        id: 'root',
        type: 'customFunction',
        position: { x: 50, y: 50 },
        data: {
          name: ep.split('/').pop(),
          possibleFile: ep,
          usage: '项目入口文件',
          drillDownStatus: 1,
          depth: 0,
          canDrillDown: false,
          onDrillDown: (data: any) => manualDrillDown(data, 'root', 0, codeFiles)
        }
      }];
      
      setNodes(initialNodes);
      setEdges([]);
      
      await analyzeFunction(ep.split('/').pop() || 'main', ep, 1, 'root', codeFiles);
      
    } catch (err: any) {
      console.error('Panorama error:', err);
      setPanoramaError(err.message || '生成全景图失败');
      addLog('Panorama Error', `生成全景图失败: ${err.message}`);
    } finally {
      setIsGeneratingPanorama(false);
    }
  };

  useEffect(() => {
    if (!owner || !repo || tree.length === 0) return;

    const createdAt = historyCreatedAtRef.current || new Date().toISOString();
    historyCreatedAtRef.current = createdAt;

    const record = saveHistoryRecord({
      id: historyIdRef.current || buildHistoryId(owner, repo),
      owner,
      repo,
      repoUrl: `https://github.com/${owner}/${repo}`,
      branch,
      createdAt,
      updatedAt: new Date().toISOString(),
      fileCount: extractFileList(tree).length,
      fileList: extractFileList(tree),
      tree,
      aiResult,
      logs,
      nodes: sanitizeNodesForStorage(nodes),
      edges,
    });

    setHistoryMeta({
      updatedAt: record.updatedAt,
      markdownFileName: record.markdownFileName,
    });
  }, [owner, repo, branch, tree, aiResult, logs, nodes, edges]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden font-sans relative">
      {/* Header */}
      <header className="py-2 min-h-[3.5rem] border-b border-zinc-800 bg-zinc-950 flex items-center px-4 shrink-0">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center text-zinc-400 hover:text-zinc-100 transition-colors mr-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </button>
        <div className="flex items-center space-x-2">
          <Github className="w-5 h-5 text-emerald-500" />
          <span className="font-semibold text-zinc-100">Visible Code</span>
          <span className="text-zinc-600 mx-2">/</span>
          <span className="text-zinc-300 font-mono text-sm">{owner}/{repo}</span>
        </div>
        
        <div className="ml-auto flex flex-col items-end space-y-2 pr-4">
          {/* Token Manager */}
          <div>
            {showTokenInput ? (
              <div className="flex items-center space-x-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-xl shadow-xl">
                <Key className="w-4 h-4 text-zinc-500 ml-2" />
                <input
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    localStorage.setItem('github_token', e.target.value);
                  }}
                  className="bg-transparent border-none focus:outline-none text-sm text-zinc-200 w-48 placeholder-zinc-600"
                  placeholder="GitHub Token (可选)"
                />
                <button 
                  onClick={() => setShowTokenInput(false)}
                  className="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowTokenInput(true)}
                className="flex items-center space-x-2 bg-zinc-900/50 border border-zinc-800 px-3 py-1.5 rounded-xl hover:bg-zinc-800 transition-colors text-sm text-zinc-400 hover:text-zinc-200"
              >
                <Key className="w-4 h-4" />
                <span>设置 Token</span>
              </button>
            )}
          </div>
          
          {/* Panel Toggles */}
          <div className="flex items-center space-x-2">
            <button onClick={() => setShowLeftPanel(!showLeftPanel)} className={`px-2 py-1 text-xs rounded border transition-colors ${showLeftPanel ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800'}`}>分析/日志</button>
            <button onClick={() => setShowMiddlePanel(!showMiddlePanel)} className={`px-2 py-1 text-xs rounded border transition-colors ${showMiddlePanel ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800'}`}>文件树</button>
            <button onClick={() => setShowCodePanel(!showCodePanel)} className={`px-2 py-1 text-xs rounded border transition-colors ${showCodePanel ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800'}`}>代码查看</button>
            <button onClick={() => setShowPanoramaPanel(!showPanoramaPanel)} className={`px-2 py-1 text-xs rounded border transition-colors ${showPanoramaPanel ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800'}`}>全景图</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup orientation="horizontal">
          {/* Left Column: Input & Info */}
          {showLeftPanel && (
            <>
              <Panel defaultSize={20} minSize={15} className="flex flex-col bg-zinc-900/30">
          <div className="p-4 border-b border-zinc-800 flex items-start justify-between">
            <form onSubmit={handleAnalyze} className="flex-1 space-y-3 mr-4">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">
                分析其他仓库
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="GitHub URL"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-emerald-400">
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </form>
            <button onClick={() => setShowLeftPanel(false)} className="text-zinc-500 hover:text-zinc-300 mt-1"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
              项目信息
            </div>
            {loading ? (
              <div className="flex items-center space-x-2 text-zinc-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>获取数据中...</span>
              </div>
            ) : error ? (
              <div className="text-red-400 text-sm p-3 bg-red-950/30 rounded-lg border border-red-900/50">
                {error}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                  <div className="text-zinc-400 text-xs mb-1">默认分支</div>
                  <div className="font-mono text-sm text-emerald-400">{branch}</div>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                  <div className="text-zinc-400 text-xs mb-1">文件总数</div>
                  <div className="font-mono text-sm text-zinc-200">
                    {tree.reduce((acc, node) => acc + countFiles(node), 0)}
                  </div>
                </div>
                
                {historyMeta && (
                  <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                    <div className="text-zinc-400 text-xs mb-1">历史工程文件</div>
                    <div className="font-mono text-xs text-emerald-400 break-all">{historyMeta.markdownFileName}</div>
                    <div className="text-[11px] text-zinc-500 mt-2">
                      最近更新：{new Date(historyMeta.updatedAt).toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="border-t border-zinc-800 pt-4 mt-4">
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                    AI 分析
                  </div>
                  
                  {!aiResult && !isAnalyzing && (
                    <button 
                      onClick={handleAIAnalysis}
                      className="w-full py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm transition-colors flex items-center justify-center"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      分析项目
                    </button>
                  )}
                  
                  {isAnalyzing && !aiResult && (
                    <div className="flex items-center justify-center space-x-2 text-emerald-400 text-sm py-4 bg-emerald-950/20 rounded-lg border border-emerald-900/30">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI 正在分析项目结构...</span>
                    </div>
                  )}
                  
                  {aiError && (
                    <div className="text-red-400 text-xs p-3 bg-red-950/30 rounded-lg border border-red-900/50 mt-2">
                      {aiError}
                    </div>
                  )}
                  
                  {aiResult && (
                    <div className="space-y-3 mt-2">
                      <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                        <div className="text-zinc-400 text-xs mb-2">编程语言</div>
                        <div className="flex flex-wrap gap-1.5">
                          {aiResult.languages.map(lang => (
                            <span key={lang} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-xs border border-indigo-500/20">
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                        <div className="text-zinc-400 text-xs mb-2">技术栈</div>
                        <div className="flex flex-wrap gap-1.5">
                          {aiResult.techStack.map(tech => (
                            <span key={tech} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 rounded text-xs border border-emerald-500/20">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                        <div className="text-zinc-400 text-xs mb-2 flex items-center justify-between">
                          <span>入口文件</span>
                          {isAnalyzing && !aiResult.verifiedEntryPoint && (
                            <span className="text-emerald-400 flex items-center text-[10px]">
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              研判中...
                            </span>
                          )}
                        </div>
                        {aiResult.verifiedEntryPoint ? (
                          <div className="space-y-2">
                            <div className="text-xs font-mono text-emerald-400 truncate bg-emerald-950/30 px-2 py-1 rounded border border-emerald-900/30" title={aiResult.verifiedEntryPoint}>
                              <Check className="w-3 h-3 inline mr-1" />
                              {aiResult.verifiedEntryPoint}
                            </div>
                            <div className="text-xs text-zinc-400 leading-relaxed border-l-2 border-emerald-500/30 pl-2">
                              {aiResult.entryPointReason}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {aiResult.entryPoints.map(ep => (
                              <div key={ep} className="text-xs font-mono text-zinc-300 truncate bg-zinc-950/50 px-2 py-1 rounded border border-zinc-800/50" title={ep}>
                                {ep}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                        <div className="text-zinc-400 text-xs mb-1">项目总结</div>
                        <div className="text-xs text-zinc-300 leading-relaxed">
                          {aiResult.summary}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* System Logs */}
                <div className="border-t border-zinc-800 pt-4 mt-4 flex-1 flex flex-col min-h-[200px]">
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <div className="flex items-center">
                      <Terminal className="w-4 h-4 mr-2" />
                      系统日志
                      <div className="ml-4 flex items-center space-x-2 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] text-zinc-400">AI检测: {aiCallCount}次</span>
                      </div>
                      {(isAnalyzing || isGeneratingPanorama) && (
                        <button
                          onClick={() => {
                            isAnalysisStoppedRef.current = true;
                            setIsAnalyzing(false);
                            setIsGeneratingPanorama(false);
                            addLog('System', '用户已手动停止AI分析');
                          }}
                          className="ml-2 px-2 py-0.5 text-[10px] bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-900/50 rounded-full transition-colors"
                        >
                          停止分析
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={() => setShowFullLogs(true)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="全屏查看日志"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                    {logs.map(log => (
                      <div key={log.id} className="bg-zinc-900/50 rounded border border-zinc-800 p-2 text-xs">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-emerald-400 font-mono">{log.title}</span>
                          <span className="text-zinc-600 text-[10px]">{log.time}</span>
                        </div>
                        <div className="text-zinc-400 truncate whitespace-pre-wrap" title={log.message}>
                          {log.message.replace(/\\n/g, '\n')}
                        </div>
                        {(log.data || log.inputData) && (
                          <button 
                            onClick={() => setExpandedLog(log)}
                            className="mt-2 flex items-center text-[10px] text-indigo-400 hover:text-indigo-300"
                          >
                            <Maximize2 className="w-3 h-3 mr-1" />
                            查看详情
                          </button>
                        )}
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <div className="text-zinc-600 text-xs italic text-center py-4">暂无日志</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </Panel>
          {showLeftPanel && (showMiddlePanel || showCodePanel || showPanoramaPanel) && <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-emerald-500/50 transition-colors cursor-col-resize" />}
          </>
          )}

          {/* Middle Column: File Tree */}
          {showMiddlePanel && (
            <>
              <Panel defaultSize={15} minSize={10} className="flex flex-col bg-zinc-950">
                <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">文件列表</span>
                  <button onClick={() => setShowMiddlePanel(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                  {loading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {tree.map((node) => (
                        <FileTreeNode 
                          key={node.path} 
                          node={node} 
                          level={0} 
                          onSelect={handleFileSelect}
                          selectedFile={selectedFile}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
              {(showCodePanel || showPanoramaPanel) && <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-emerald-500/50 transition-colors cursor-col-resize" />}
            </>
          )}

          {/* Right Column: Code & Panorama */}
          {(showCodePanel || showPanoramaPanel) && (
            <Panel defaultSize={65} className="flex flex-col min-w-0">
              <PanelGroup orientation="horizontal">
                {/* Code Viewer */}
                {showCodePanel && (
                  <>
                    <Panel defaultSize={50} minSize={20} className="flex flex-col bg-[#1e1e1e] min-w-0">
                      {selectedFile ? (
                        <>
                          <div className="h-10 bg-[#252526] border-b border-[#1e1e1e] flex items-center justify-between px-4 shrink-0">
                            <div className="flex items-center">
                              <FileCode2 className="w-4 h-4 text-emerald-500 mr-2" />
                              <span className="text-sm text-zinc-300 font-mono truncate">{selectedFile}</span>
                            </div>
                            <button onClick={() => setShowCodePanel(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                          </div>
                <div className="flex-1 overflow-auto custom-scrollbar relative">
                  {loadingFile ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]/50 backdrop-blur-sm z-10">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                    </div>
                  ) : null}
                  <SyntaxHighlighter
                    language={getLanguage(selectedFile)}
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: '1rem',
                      background: 'transparent',
                      fontSize: '13px',
                      lineHeight: '1.5',
                    }}
                    showLineNumbers={true}
                    lineNumberStyle={{
                      minWidth: '3em',
                      paddingRight: '1em',
                      color: '#858585',
                      textAlign: 'right',
                    }}
                    wrapLines={true}
                  >
                    {fileContent}
                  </SyntaxHighlighter>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col relative">
                <div className="h-10 bg-[#252526] border-b border-[#1e1e1e] flex items-center justify-between px-4 shrink-0">
                  <div className="flex items-center">
                    <FileCode2 className="w-4 h-4 text-zinc-600 mr-2" />
                    <span className="text-sm text-zinc-500 font-mono">代码查看</span>
                  </div>
                  <button onClick={() => setShowCodePanel(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                  <FileCode2 className="w-16 h-16 mb-4 opacity-20" />
                  <p>在左侧选择一个文件以查看内容</p>
                </div>
              </div>
            )}
          </Panel>
          {showPanoramaPanel && <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-emerald-500/50 transition-colors cursor-col-resize" />}
          </>
          )}

          {/* Panorama Viewer */}
          {showPanoramaPanel && (
            <Panel defaultSize={50} minSize={20} className="flex flex-col bg-zinc-950 min-w-0 relative">
              <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center">
                  <Sparkles className="w-4 h-4 text-emerald-500 mr-2" />
                  <span className="text-sm text-zinc-300 font-medium">全景图分析</span>
                </div>
                <div className="flex items-center space-x-2">
                  {nodes.length > 0 && (
                    <button
                      onClick={() => setShowPanoramaFullscreen(true)}
                      className="text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="全屏查看全景图"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setShowPanoramaPanel(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="flex-1 relative">
                {isGeneratingPanorama && nodes.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                    <div className="text-emerald-400 text-sm">正在生成全景图...</div>
                  </div>
                ) : panoramaError ? (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="text-red-400 text-sm p-4 bg-red-950/30 rounded-lg border border-red-900/50 text-center">
                      {panoramaError}
                      <button 
                        onClick={generatePanorama}
                        className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/80 rounded-lg transition-colors block mx-auto"
                      >
                        重试
                      </button>
                    </div>
                  </div>
                ) : nodes.length > 0 ? (
                  <>
                    {isGeneratingPanorama && (
                      <div className="absolute top-4 right-4 z-10 flex items-center bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500 mr-2" />
                        <span className="text-xs text-emerald-400">正在分析...</span>
                      </div>
                    )}
                    <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    className="bg-zinc-950"
                    minZoom={0.1}
                    nodesDraggable={false}
                  >
                    <Background color="#27272a" gap={16} />
                    <Controls className="!bg-zinc-900 !border-zinc-800 [&>button]:!bg-zinc-900 [&>button]:!border-zinc-800 [&>button]:!fill-zinc-400 hover:[&>button]:!bg-zinc-800" />
                  </ReactFlow>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-6 text-center">
                    <Sparkles className="w-16 h-16 mb-4 opacity-20" />
                    <p className="mb-4">全景图可以展示项目入口文件的函数调用链路</p>
                    {aiResult?.verifiedEntryPoint ? (
                      <button 
                        onClick={generatePanorama}
                        className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm transition-colors"
                      >
                        生成全景图
                      </button>
                    ) : (
                      <p className="text-xs text-zinc-600">请先在左侧完成项目分析并确认入口文件</p>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          )}
              </PanelGroup>
            </Panel>
          )}
        </PanelGroup>
      </div>

      {/* Full Screen Log Modal */}
      {expandedLog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
              <h3 className="text-lg font-medium text-zinc-200 flex items-center">
                <Terminal className="w-5 h-5 mr-2 text-emerald-500" />
                日志详情: {expandedLog.title}
              </h3>
              <button onClick={() => setExpandedLog(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto custom-scrollbar flex-1 flex flex-col">
              <div className="mb-4 text-sm text-zinc-400 shrink-0 whitespace-pre-wrap">{expandedLog.message.replace(/\\n/g, '\n')}</div>
              
              {expandedLog.inputData && expandedLog.data ? (
                <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
                  <div className="flex-1 flex flex-col min-h-0 border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-400 border-b border-zinc-800 shrink-0">
                      输入 (Prompt)
                    </div>
                    <div className="flex-1 overflow-auto bg-[#1e1e1e]">
                      <SyntaxHighlighter
                        language="markdown"
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '13px' }}
                      >
                        {typeof expandedLog.inputData === 'string' ? expandedLog.inputData.replace(/\\n/g, '\n') : JSON.stringify(expandedLog.inputData, null, 2).replace(/\\n/g, '\n')}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col min-h-0 border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-400 border-b border-zinc-800 shrink-0">
                      返回 (Response)
                    </div>
                    <div className="flex-1 overflow-auto bg-[#1e1e1e]">
                      <SyntaxHighlighter
                        language="json"
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '13px' }}
                      >
                        {JSON.stringify(expandedLog.data, null, 2).replace(/\\n/g, '\n')}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto border border-zinc-800 rounded-lg bg-[#1e1e1e]">
                  <SyntaxHighlighter
                    language="json"
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '13px' }}
                  >
                    {JSON.stringify(expandedLog.data || expandedLog.inputData, null, 2).replace(/\\n/g, '\n')}
                  </SyntaxHighlighter>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Full Screen All Logs Modal */}
      {showFullLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
              <h3 className="text-lg font-medium text-zinc-200 flex items-center">
                <Terminal className="w-5 h-5 mr-2 text-emerald-500" />
                系统日志 (全屏)
              </h3>
              <button onClick={() => setShowFullLogs(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto custom-scrollbar flex-1 space-y-3">
              {logs.map(log => (
                <div key={log.id} className="bg-zinc-900/50 rounded border border-zinc-800 p-3 text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-emerald-400 font-mono font-medium">{log.title}</span>
                    <span className="text-zinc-500 text-xs">{log.time}</span>
                  </div>
                  <div className="text-zinc-300 whitespace-pre-wrap">
                    {log.message.replace(/\\n/g, '\n')}
                  </div>
                  {(log.data || log.inputData) && (
                    <button 
                      onClick={() => {
                        setExpandedLog(log);
                      }}
                      className="mt-3 flex items-center text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
                      查看详情
                    </button>
                  )}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-zinc-600 text-sm italic text-center py-8">暂无日志</div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Full Screen Panorama Modal */}
      {showPanoramaFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
          <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 bg-zinc-900/50">
            <h3 className="text-lg font-medium text-zinc-200 flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-emerald-500" />
              全景图分析 (全屏)
            </h3>
            <button onClick={() => setShowPanoramaFullscreen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              className="bg-zinc-950"
              minZoom={0.1}
              nodesDraggable={false}
            >
              <Background color="#27272a" gap={16} />
              <Controls className="!bg-zinc-900 !border-zinc-800 [&>button]:!bg-zinc-900 [&>button]:!border-zinc-800 [&>button]:!fill-zinc-400 hover:[&>button]:!bg-zinc-800" />
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
}

function countFiles(node: TreeNode): number {
  if (node.type === 'blob') return 1;
  return (node.children || []).reduce((acc, child) => acc + countFiles(child), 0);
}

function FileTreeNode({ 
  node, 
  level, 
  onSelect,
  selectedFile
}: { 
  node: TreeNode; 
  level: number; 
  onSelect: (path: string) => void;
  selectedFile: string | null;
}) {
  const [isOpen, setIsOpen] = useState(level < 1);
  const isDir = node.type === 'tree';
  const isSelected = selectedFile === node.path;

  return (
    <div>
      <div 
        className={`flex items-center py-1 pr-2 rounded cursor-pointer hover:bg-zinc-800/50 transition-colors ${
          isSelected ? 'bg-emerald-900/30 text-emerald-400' : 'text-zinc-300'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (isDir) {
            setIsOpen(!isOpen);
          } else {
            onSelect(node.path);
          }
        }}
      >
        <div className="w-4 h-4 mr-1 flex items-center justify-center shrink-0">
          {isDir ? (
            <button className="text-zinc-500 hover:text-zinc-300">
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : null}
        </div>
        
        {isDir ? (
          <Folder className={`w-4 h-4 mr-2 shrink-0 ${isOpen ? 'text-blue-400' : 'text-zinc-500'}`} />
        ) : (
          <File className={`w-4 h-4 mr-2 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-500'}`} />
        )}
        
        <span className="text-sm truncate select-none">{node.name}</span>
      </div>
      
      {isDir && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode 
              key={child.path} 
              node={child} 
              level={level + 1} 
              onSelect={onSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
