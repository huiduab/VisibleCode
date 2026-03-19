import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Github, Search, ArrowLeft, Loader2, FileCode2, Folder, File, ChevronRight, ChevronDown, Key, Sparkles, X, Terminal, Maximize2, Check, Code2, Settings2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ReactFlow, Background, Controls, Node, Edge, Position, Handle, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import dagre from 'dagre';
import {
  buildHistoryId,
  extractFileList,
  getHistoryRecord,
  saveHistoryRecord,
  type AnalysisHistoryRecord,
  type FunctionCategoryItem,
  type AnalysisSourceType,
} from '../lib/analysisHistory';
import { loadProjectSource, type LoadedProjectSource } from '../lib/projectSources';

const FunctionNodeComponent = ({ data }: any) => {
  const fileName = data.possibleFile ? data.possibleFile.split('/').pop() : '未知文件';
  const categoryColor = data.categoryColor || '#10b981';
  const faded = Boolean(data.faded);
  
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
    <div
      className={`group relative rounded-lg border min-w-[220px] max-w-[280px] w-max font-sans transition-all ${
        faded ? 'bg-zinc-900 opacity-45' : 'bg-zinc-950'
      }`}
      style={{
        borderColor: faded ? '#3f3f46' : categoryColor,
        boxShadow: faded ? 'none' : `0 0 0 1px ${categoryColor}44, 0 0 0 3px ${categoryColor}16`,
      }}
    >
      <Handle type="target" position={Position.Left} className="w-0 h-0 border-0 bg-transparent" />
      
      {/* Header: File name */}
      <div
        className="px-3 py-1.5 border-b rounded-t-lg flex items-center"
        style={{
          borderColor: faded ? '#3f3f46' : `${categoryColor}55`,
          color: faded ? '#71717a' : '#a1a1aa',
        }}
      >
        <File className="w-3.5 h-3.5 mr-1.5" />
        <span className="font-mono text-xs truncate">{fileName}</span>
      </div>
      
      {/* Body: Function name and description */}
      <div className="p-3 rounded-b-lg flex flex-col gap-3">
        <div
          className="rounded-md border px-3 py-2"
          style={{
            borderColor: faded ? '#3f3f46' : `${categoryColor}44`,
            background: faded ? 'rgba(24,24,27,0.55)' : `${categoryColor}10`,
          }}
        >
          <div className="flex items-start">
            <Code2 className="w-4 h-4 mr-1.5 shrink-0 mt-0.5" style={{ color: faded ? '#71717a' : categoryColor }} />
            <div className={`font-semibold text-sm leading-5 break-all ${faded ? 'text-zinc-500' : 'text-zinc-100'}`}>{data.name}</div>
          </div>
        </div>
        <div className={`text-xs leading-relaxed ${faded ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {data.usage}
        </div>
        {data.routePath && (
          <div
            className="rounded-md border px-3 py-2"
            style={{
              borderColor: faded ? '#3f3f46' : 'rgba(56,189,248,0.35)',
              background: faded ? 'rgba(15,23,42,0.18)' : 'rgba(12,74,110,0.18)',
            }}
          >
            <div className={`text-[10px] uppercase tracking-[0.18em] mb-1 ${faded ? 'text-zinc-700' : 'text-sky-500'}`}>URL</div>
            <div className={`text-[11px] font-mono break-all ${faded ? 'text-sky-700' : 'text-sky-300'}`}>
              {data.routePath}
            </div>
          </div>
        )}
        {data.categoryName && (
          <div>
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]"
              style={{
                borderColor: faded ? '#3f3f46' : `${categoryColor}66`,
                color: faded ? '#71717a' : categoryColor,
              }}
            >
              {data.categoryName}
            </span>
          </div>
        )}
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

interface PanoramaFunctionNodeData {
  name: string;
  possibleFile: string;
  usage: string;
  drillDownStatus: number;
  depth: number;
  canDrillDown: boolean;
  categoryKey?: string;
  routePath?: string;
  bridgeId?: string;
  bridgeLabel?: string;
  onDrillDown: (data: any) => void;
  categoryName?: string;
  categoryColor?: string;
  faded?: boolean;
}

interface BridgeTarget {
  name: string;
  possibleFile: string;
  usage: string;
  drillDownStatus: number;
  routePath?: string;
  bridgeId: string;
  bridgeLabel: string;
}

interface BridgeResolution {
  bridgeId: string;
  bridgeLabel: string;
  description: string;
  targets: BridgeTarget[];
}

interface BridgeResolverContext {
  aiResult: AIAnalysisResult;
  codeFiles: string[];
  fetchFileContent: (filePath: string) => Promise<string>;
}

interface BridgeDefinition {
  id: string;
  label: string;
  resolve: (context: BridgeResolverContext) => Promise<BridgeResolution | null>;
}

interface LogEntry {
  id: string;
  time: string;
  title: string;
  message: string;
  data?: any;
  inputData?: any;
}

interface CategoryAssignment {
  functionName?: string;
  nodeKey?: string;
  category: string;
}

type JsonSchema = Record<string, any>;

interface RuntimeAiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const AI_API_KEY = process.env.AI_API_KEY as string | undefined;
const BASE_URL = (process.env.BASE_URL as string | undefined)?.replace(/\/+$/, '');
const MODEL = process.env.MODEL as string | undefined;
const AI_API_KEY_STORAGE = 'runtime_ai_api_key';
const BASE_URL_STORAGE = 'runtime_ai_base_url';
const MODEL_STORAGE = 'runtime_ai_model';
const GITHUB_TOKEN_STORAGE = 'github_token';

const getRuntimeAiConfig = (): RuntimeAiConfig => ({
  apiKey: localStorage.getItem(AI_API_KEY_STORAGE) || AI_API_KEY || '',
  baseUrl: (localStorage.getItem(BASE_URL_STORAGE) || BASE_URL || '').replace(/\/+$/, ''),
  model: localStorage.getItem(MODEL_STORAGE) || MODEL || '',
});

const ensureAiConfig = (config: RuntimeAiConfig) => {
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error('AI 配置缺失，请在右上角设置中填写，或在 .env 中设置 AI_API_KEY、BASE_URL、MODEL。');
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
  const config = getRuntimeAiConfig();
  ensureAiConfig(config);

  const postChat = async (body: Record<string, any>) => {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
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
        model: config.model,
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
        model: config.model,
        temperature: 0.1,
        messages: [{ role: 'user', content: buildJsonPrompt(prompt, schema) }],
      });
      const fallbackText = extractResponseText(fallbackData);
      if (!fallbackText) throw new Error('AI 杩斿洖涓虹┖');
      return JSON.parse(fallbackText) as T;
    }
  }

  const data = await postChat({
    model: config.model,
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

const categorySchema = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          summary: { type: 'string' },
          functions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['name', 'summary', 'functions'],
        additionalProperties: false,
      },
    },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          functionName: { type: 'string' },
          nodeKey: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['category'],
        additionalProperties: false,
      },
    },
  },
  required: ['categories', 'assignments'],
  additionalProperties: false,
} satisfies JsonSchema;

const CATEGORY_COLORS = ['#14b8a6', '#f59e0b', '#38bdf8', '#f97316', '#10b981', '#eab308', '#fb7185', '#a3e635', '#2dd4bf', '#60a5fa'];

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

const normalizeTechStackLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

const joinRouteSegments = (...parts: Array<string | undefined>) => {
  const cleaned = parts
    .map(part => (part || '').trim())
    .filter(Boolean)
    .map(part => part.replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .map(part => part.replace(/\/+/g, '/'))
    .map(part => (part === '/' ? '' : part.replace(/^\/|\/$/g, '')))
    .filter(Boolean);

  return cleaned.length ? `/${cleaned.join('/')}` : '/';
};

const extractAnnotationPath = (annotation: string) => {
  const quoted =
    annotation.match(/(?:value|path)?\s*=?\s*\{\s*"([^"]+)"/) ||
    annotation.match(/(?:value|path)?\s*=?\s*"([^"]+)"/);
  return quoted?.[1] || '';
};

const extractRequestMethod = (annotationName: string, annotation: string) => {
  const directMap: Record<string, string> = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH',
  };

  if (directMap[annotationName]) return directMap[annotationName];
  const methodMatch = annotation.match(/RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/);
  return methodMatch?.[1] || 'REQUEST';
};

const parseSpringControllerTargets = (content: string, filePath: string): BridgeTarget[] => {
  const classMatch = content.match(/((?:@\w+(?:\([^)]*\))?\s*)+)\s*(?:public\s+)?class\s+([A-Za-z_]\w*)/s);
  if (!classMatch) return [];

  const classAnnotations = classMatch[1];
  if (!/@(RestController|Controller)\b/.test(classAnnotations)) return [];

  const classRequestMapping = classAnnotations.match(/@RequestMapping\s*\(([\s\S]*?)\)/);
  const classRoute = classRequestMapping ? extractAnnotationPath(classRequestMapping[0]) : '';

  const methodRegex = /((?:@\w+(?:\([^)]*\))?\s*)+)\s*(?:public|protected|private)\s+(?:static\s+)?(?:[\w<>\[\],?.]+\s+)+([A-Za-z_]\w*)\s*\([^;{)]*\)\s*(?:throws [^{]+)?\{/g;
  const targets: BridgeTarget[] = [];
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(content)) !== null) {
    const annotationBlock = match[1];
    const methodName = match[2];
    const mappingMatch = annotationBlock.match(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(\(([\s\S]*?)\))?/);
    if (!mappingMatch) continue;

    const annotationName = mappingMatch[1];
    const fullAnnotation = mappingMatch[0];
    const methodPath = extractAnnotationPath(fullAnnotation);
    const httpMethod = extractRequestMethod(annotationName, fullAnnotation);
    const routePath = `${httpMethod} ${joinRouteSegments(classRoute, methodPath)}`;

    targets.push({
      name: methodName,
      possibleFile: filePath,
      usage: `Spring Controller 入口，处理 ${routePath} 请求`,
      drillDownStatus: 1,
      routePath,
      bridgeId: 'spring-boot-controller',
      bridgeLabel: 'Spring Boot Controller Bridge',
    });
  }

  return targets;
};

const toPythonRoutePath = (rawPath: string) => {
  const normalized = joinRouteSegments(rawPath.replace(/^r['"]|['"]$/g, ''));
  return normalized.replace(/<str:([^>]+)>/g, '{$1}').replace(/<int:([^>]+)>/g, '{$1}').replace(/<slug:([^>]+)>/g, '{$1}').replace(/<uuid:([^>]+)>/g, '{$1}').replace(/<path:([^>]+)>/g, '{path:$1}').replace(/<([^>]+)>/g, '{$1}');
};

const extractPythonFunctionBlocks = (content: string) => {
  const lines = content.split('\n');
  const functions: Array<{ name: string; decorators: string[] }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const defMatch = line.match(/^(\s*)(?:async\s+def|def)\s+([A-Za-z_]\w*)\s*\(/);
    if (!defMatch) continue;

    const indent = defMatch[1].length;
    const decorators: string[] = [];
    let cursor = i - 1;
    while (cursor >= 0) {
      const candidate = lines[cursor];
      if (!candidate.trim()) {
        cursor -= 1;
        continue;
      }

      const decoratorMatch = candidate.match(/^(\s*)@/);
      if (!decoratorMatch || decoratorMatch[1].length !== indent) break;
      decorators.unshift(candidate.trim());
      cursor -= 1;
    }

    functions.push({ name: defMatch[2], decorators });
  }

  return functions;
};

const parseFlaskTargets = (content: string, filePath: string): BridgeTarget[] => {
  const functions = extractPythonFunctionBlocks(content);
  const targets: BridgeTarget[] = [];

  for (const fn of functions) {
    const routeDecorator = fn.decorators.find(item => /@\w+(?:\.\w+)?\.route\s*\(/.test(item));
    if (!routeDecorator) continue;

    const pathMatch = routeDecorator.match(/\.route\(\s*(?:r)?['"]([^'"]+)['"]/);
    const methodsMatch = routeDecorator.match(/methods\s*=\s*\[([^\]]+)\]/);
    const methods = methodsMatch
      ? Array.from(methodsMatch[1].matchAll(/['"]([A-Z]+)['"]/g)).map(match => match[1])
      : ['GET'];
    const routePath = `${methods.join('/')} ${toPythonRoutePath(pathMatch?.[1] || '/')}`;

    targets.push({
      name: fn.name,
      possibleFile: filePath,
      usage: `Python 路由入口，处理 ${routePath} 请求`,
      drillDownStatus: 1,
      routePath,
      bridgeId: 'python-flask-route',
      bridgeLabel: 'Flask Route Bridge',
    });
  }

  return targets;
};

const parseFastApiTargets = (content: string, filePath: string): BridgeTarget[] => {
  const functions = extractPythonFunctionBlocks(content);
  const targets: BridgeTarget[] = [];
  const methodMap: Record<string, string> = {
    get: 'GET',
    post: 'POST',
    put: 'PUT',
    delete: 'DELETE',
    patch: 'PATCH',
    options: 'OPTIONS',
    head: 'HEAD',
    api_route: 'REQUEST',
  };

  for (const fn of functions) {
    for (const decorator of fn.decorators) {
      const routeMatch = decorator.match(/@\w+(?:\.\w+)?\.(get|post|put|delete|patch|options|head|api_route)\(\s*(?:r)?['"]([^'"]+)['"]/i);
      if (!routeMatch) continue;

      const method = methodMap[routeMatch[1].toLowerCase()] || 'REQUEST';
      const methodsMatch = decorator.match(/methods\s*=\s*\[([^\]]+)\]/);
      const methods = methodsMatch
        ? Array.from(methodsMatch[1].matchAll(/['"]([A-Z]+)['"]/g)).map(match => match[1])
        : [method];
      const routePath = `${methods.join('/')} ${toPythonRoutePath(routeMatch[2])}`;

      targets.push({
        name: fn.name,
        possibleFile: filePath,
        usage: `Python 路由入口，处理 ${routePath} 请求`,
        drillDownStatus: 1,
        routePath,
        bridgeId: 'python-fastapi-route',
        bridgeLabel: 'FastAPI Route Bridge',
      });
    }
  }

  return targets;
};

const extractDjangoViewTargets = (content: string, filePath: string, routePrefix: string, viewName: string) => {
  const functionRegex = new RegExp(`^(?:async\\s+def|def)\\s+${viewName}\\s*\\(`, 'm');
  const classRegex = new RegExp(`^class\\s+${viewName}\\s*\\(`, 'm');

  if (functionRegex.test(content)) {
    return [{
      name: viewName,
      possibleFile: filePath,
      usage: `Python 路由入口，处理 REQUEST ${toPythonRoutePath(routePrefix)} 请求`,
      drillDownStatus: 1,
      routePath: `REQUEST ${toPythonRoutePath(routePrefix)}`,
      bridgeId: 'python-django-route',
      bridgeLabel: 'Django Route Bridge',
    }];
  }

  if (!classRegex.test(content)) return [];

  const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
  const methods = httpMethods.filter(method => new RegExp(`^[ \\t]+def\\s+${method}\\s*\\(`, 'm').test(content));
  const resolvedMethods = methods.length > 0 ? methods.map(method => method.toUpperCase()) : ['REQUEST'];

  return [{
    name: viewName,
    possibleFile: filePath,
    usage: `Python 路由入口，处理 ${resolvedMethods.join('/')} ${toPythonRoutePath(routePrefix)} 请求`,
    drillDownStatus: 1,
    routePath: `${resolvedMethods.join('/')} ${toPythonRoutePath(routePrefix)}`,
    bridgeId: 'python-django-route',
    bridgeLabel: 'Django Route Bridge',
  }];
};

const parseDjangoUrlTargets = async (codeFiles: string[], fetchFileContent: (filePath: string) => Promise<string>) => {
  const urlFiles = codeFiles.filter(file => /(?:^|\/)urls\.py$/i.test(file));
  const moduleToFile = new Map<string, string>();
  codeFiles.filter(file => file.toLowerCase().endsWith('.py')).forEach(file => {
    const moduleName = file.replace(/\.py$/i, '').replace(/\//g, '.');
    moduleToFile.set(moduleName, file);
  });

  const targets: BridgeTarget[] = [];

  for (const urlFile of urlFiles) {
    const content = await fetchFileContent(urlFile);
    const importAliases = new Map<string, string>();
    const fromImports = Array.from(content.matchAll(/from\s+([A-Za-z0-9_\.]+)\s+import\s+([^\n]+)/g));
    fromImports.forEach(([, modulePath, importList]) => {
      importList.split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
        const [name, alias] = item.split(/\s+as\s+/).map(value => value.trim());
        importAliases.set(alias || name, `${modulePath}.${name}`);
      });
    });

    const includeImports = Array.from(content.matchAll(/import\s+([A-Za-z0-9_\.]+)(?:\s+as\s+([A-Za-z0-9_]+))?/g));
    includeImports.forEach(([, modulePath, alias]) => {
      const parts = modulePath.split('.');
      importAliases.set(alias || parts[parts.length - 1], modulePath);
    });

    const routeMatches = Array.from(content.matchAll(/(?:path|re_path)\(\s*(?:r)?['"]([^'"]*)['"]\s*,\s*([A-Za-z0-9_\.]+)(?:\.as_view\(\))?/g));
    for (const [, routePrefix, viewRef] of routeMatches) {
      if (viewRef === 'include') continue;

      let filePath = '';
      let viewName = viewRef;
      if (viewRef.includes('.')) {
        const parts = viewRef.split('.');
        const rootAlias = parts.shift() || '';
        const resolvedModule = importAliases.get(rootAlias) || rootAlias;
        viewName = parts.pop() || viewRef;
        const moduleName = parts.length > 0 ? `${resolvedModule}.${parts.join('.')}` : resolvedModule;
        filePath = moduleToFile.get(moduleName) || '';
      } else {
        const resolvedImport = importAliases.get(viewRef);
        if (resolvedImport) {
          const segments = resolvedImport.split('.');
          viewName = segments.pop() || viewRef;
          filePath = moduleToFile.get(segments.join('.')) || '';
        }
      }

      if (!filePath) continue;
      const viewContent = await fetchFileContent(filePath);
      targets.push(...extractDjangoViewTargets(viewContent, filePath, routePrefix, viewName));
    }
  }

  return targets;
};

const springBootBridge: BridgeDefinition = {
  id: 'spring-boot-controller',
  label: 'Spring Boot Controller Bridge',
  resolve: async ({ aiResult, codeFiles, fetchFileContent }) => {
    const techStackLabels = aiResult.techStack.map(normalizeTechStackLabel);
    const looksLikeSpring =
      techStackLabels.some(item => item.includes('springboot') || item.includes('springmvc') || item === 'spring') ||
      (aiResult.verifiedEntryPoint?.toLowerCase().endsWith('.java') ?? false);

    if (!looksLikeSpring || !aiResult.verifiedEntryPoint) return null;

    const entryContent = await fetchFileContent(aiResult.verifiedEntryPoint);
    const isSpringBootEntry =
      /@SpringBootApplication\b/.test(entryContent) ||
      /SpringApplication\.run\s*\(/.test(entryContent) ||
      /implements\s+CommandLineRunner\b/.test(entryContent);

    if (!isSpringBootEntry) return null;

    const javaFiles = codeFiles.filter(file => file.toLowerCase().endsWith('.java'));
    const controllerFiles = javaFiles.filter(file => /controller/i.test(file));
    const scanTargets = controllerFiles.length > 0 ? controllerFiles : javaFiles;
    const bridgeTargets: BridgeTarget[] = [];

    for (const filePath of scanTargets) {
      const content = await fetchFileContent(filePath);
      if (!/@(RestController|Controller)\b/.test(content)) continue;
      bridgeTargets.push(...parseSpringControllerTargets(content, filePath));
    }

    if (bridgeTargets.length === 0) return null;

    return {
      bridgeId: 'spring-boot-controller',
      bridgeLabel: 'Spring Boot Controller Bridge',
      description: `检测到 Spring Boot 项目，已从主入口桥接到 ${bridgeTargets.length} 个 Controller 方法。`,
      targets: bridgeTargets.filter((target, index, list) =>
        list.findIndex(item =>
          item.name === target.name &&
          item.possibleFile === target.possibleFile &&
          item.routePath === target.routePath
        ) === index
      ),
    };
  },
};

const flaskBridge: BridgeDefinition = {
  id: 'python-flask-route',
  label: 'Flask Route Bridge',
  resolve: async ({ aiResult, codeFiles, fetchFileContent }) => {
    const techStackLabels = aiResult.techStack.map(normalizeTechStackLabel);
    const looksLikeFlask = techStackLabels.some(item => item.includes('flask'));
    if (!looksLikeFlask) return null;

    const pyFiles = codeFiles.filter(file => file.toLowerCase().endsWith('.py'));
    const bridgeTargets: BridgeTarget[] = [];
    for (const filePath of pyFiles) {
      const content = await fetchFileContent(filePath);
      if (!/from\s+flask\s+import|import\s+flask|Flask\s*\(/.test(content)) continue;
      bridgeTargets.push(...parseFlaskTargets(content, filePath));
    }

    if (bridgeTargets.length === 0) return null;
    return {
      bridgeId: 'python-flask-route',
      bridgeLabel: 'Flask Route Bridge',
      description: `检测到 Flask 项目，已从入口桥接到 ${bridgeTargets.length} 个路由函数。`,
      targets: bridgeTargets,
    };
  },
};

const fastApiBridge: BridgeDefinition = {
  id: 'python-fastapi-route',
  label: 'FastAPI Route Bridge',
  resolve: async ({ aiResult, codeFiles, fetchFileContent }) => {
    const techStackLabels = aiResult.techStack.map(normalizeTechStackLabel);
    const looksLikeFastApi = techStackLabels.some(item => item.includes('fastapi'));
    if (!looksLikeFastApi) return null;

    const pyFiles = codeFiles.filter(file => file.toLowerCase().endsWith('.py'));
    const bridgeTargets: BridgeTarget[] = [];
    for (const filePath of pyFiles) {
      const content = await fetchFileContent(filePath);
      if (!/from\s+fastapi\s+import|FastAPI\s*\(|APIRouter\s*\(/.test(content)) continue;
      bridgeTargets.push(...parseFastApiTargets(content, filePath));
    }

    if (bridgeTargets.length === 0) return null;
    return {
      bridgeId: 'python-fastapi-route',
      bridgeLabel: 'FastAPI Route Bridge',
      description: `检测到 FastAPI 项目，已从入口桥接到 ${bridgeTargets.length} 个路由函数。`,
      targets: bridgeTargets,
    };
  },
};

const djangoBridge: BridgeDefinition = {
  id: 'python-django-route',
  label: 'Django Route Bridge',
  resolve: async ({ aiResult, codeFiles, fetchFileContent }) => {
    const techStackLabels = aiResult.techStack.map(normalizeTechStackLabel);
    const looksLikeDjango = techStackLabels.some(item => item.includes('django'));
    if (!looksLikeDjango) return null;

    const bridgeTargets = await parseDjangoUrlTargets(codeFiles, fetchFileContent);
    if (bridgeTargets.length === 0) return null;

    return {
      bridgeId: 'python-django-route',
      bridgeLabel: 'Django Route Bridge',
      description: `检测到 Django 项目，已从入口桥接到 ${bridgeTargets.length} 个路由视图。`,
      targets: bridgeTargets,
    };
  },
};

const BRIDGE_DEFINITIONS: BridgeDefinition[] = [springBootBridge, fastApiBridge, flaskBridge, djangoBridge];

const buildNodeCategoryKey = (name: string, possibleFile?: string, routePath?: string) =>
  `${possibleFile || 'unknown'}::${name}::${routePath || ''}`.toLowerCase();

const sanitizeNodesForStorage = (nodes: Node[]) =>
  nodes.map(node => {
    const data = { ...((node.data || {}) as Record<string, any>) };
    delete data.onDrillDown;
    return {
      ...node,
      data,
    };
  });

const sanitizeLegacyText = (value: string) => {
  const replacements: Array<[string, string]> = [
    ['寮€濮嬪垎鏋愬嚱鏁?', '开始分析函数'],
    ['寮€濮?AI 鍒嗘瀽椤圭洰缁撴瀯...', '开始 AI 分析项目结构...'],
    ['寮€濮嬪垎鏋?','开始分析 '],
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
  ];

  return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), value);
};

const sanitizeLogEntry = (entry: LogEntry): LogEntry => ({
  ...entry,
  title: sanitizeLegacyText(entry.title),
  message: sanitizeLegacyText(entry.message),
});

export default function Analyze() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sourceMode = (searchParams.get('mode') === 'local' ? 'local' : 'github') as AnalysisSourceType;
  const projectId = searchParams.get('projectId');
  const historyId = searchParams.get('historyId');
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');

  const [urlInput, setUrlInput] = useState(`https://github.com/${owner}/${repo}`);
  const [token, setToken] = useState(localStorage.getItem(GITHUB_TOKEN_STORAGE) || '');
  const [runtimeAiConfig, setRuntimeAiConfig] = useState<RuntimeAiConfig>(() => getRuntimeAiConfig());
  const [draftAiConfig, setDraftAiConfig] = useState<RuntimeAiConfig>(() => getRuntimeAiConfig());
  const [draftGithubToken, setDraftGithubToken] = useState(localStorage.getItem(GITHUB_TOKEN_STORAGE) || '');
  const [showSettings, setShowSettings] = useState(false);
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
  const [functionCategories, setFunctionCategories] = useState<FunctionCategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isClassifyingFunctions, setIsClassifyingFunctions] = useState(false);

  const [aiCallCount, setAiCallCount] = useState(0);
  const isAnalysisStoppedRef = useRef(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLog, setExpandedLog] = useState<LogEntry | null>(null);
  const [showFullLogs, setShowFullLogs] = useState(false);

  // Panorama State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef<Node[]>([]);
  const [isGeneratingPanorama, setIsGeneratingPanorama] = useState(false);
  const [panoramaError, setPanoramaError] = useState('');
  const [showPanoramaFullscreen, setShowPanoramaFullscreen] = useState(false);
  const panoramaAnalysisCacheRef = useRef<Map<string, Array<{ name: string; possibleFile: string; usage: string; drillDownStatus: number }>>>(new Map());
  const fileContentCacheRef = useRef<Map<string, string>>(new Map());
  const loadedSourceRef = useRef<LoadedProjectSource | null>(null);

  // Panel Visibility State
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showMiddlePanel, setShowMiddlePanel] = useState(true);
  const [showCodePanel, setShowCodePanel] = useState(true);
  const [showPanoramaPanel, setShowPanoramaPanel] = useState(true);

  const historyIdRef = useRef(historyId || (sourceMode === 'local' ? buildHistoryId('local', projectId || '') : (owner && repo ? buildHistoryId('github', owner, repo) : '')));
  const historyCreatedAtRef = useRef<string>('');
  const loadedFromHistoryRef = useRef(false);
  const [historyMeta, setHistoryMeta] = useState<Pick<AnalysisHistoryRecord, 'updatedAt' | 'markdownFileName'> | null>(null);

  const addLog = (title: string, message: string, data?: any, inputData?: any) => {
    setLogs(prev => [sanitizeLogEntry({
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      title,
      message,
      data,
      inputData
    }), ...prev]);
  };

  const openSettings = () => {
    setDraftAiConfig(getRuntimeAiConfig());
    setDraftGithubToken(localStorage.getItem(GITHUB_TOKEN_STORAGE) || '');
    setShowSettings(true);
  };

  const saveSettings = () => {
    const nextConfig: RuntimeAiConfig = {
      apiKey: draftAiConfig.apiKey.trim(),
      baseUrl: draftAiConfig.baseUrl.trim().replace(/\/+$/, ''),
      model: draftAiConfig.model.trim(),
    };
    const nextToken = draftGithubToken.trim();

    if (nextConfig.apiKey) localStorage.setItem(AI_API_KEY_STORAGE, nextConfig.apiKey);
    else localStorage.removeItem(AI_API_KEY_STORAGE);

    if (nextConfig.baseUrl) localStorage.setItem(BASE_URL_STORAGE, nextConfig.baseUrl);
    else localStorage.removeItem(BASE_URL_STORAGE);

    if (nextConfig.model) localStorage.setItem(MODEL_STORAGE, nextConfig.model);
    else localStorage.removeItem(MODEL_STORAGE);

    if (nextToken) localStorage.setItem(GITHUB_TOKEN_STORAGE, nextToken);
    else localStorage.removeItem(GITHUB_TOKEN_STORAGE);

    setRuntimeAiConfig(nextConfig);
    setToken(nextToken);
    setShowSettings(false);
    addLog('Settings', '已更新本地运行配置', {
      baseUrl: nextConfig.baseUrl || '(使用 .env)',
      model: nextConfig.model || '(使用 .env)',
      githubToken: nextToken ? '已设置' : '未设置',
      aiApiKey: nextConfig.apiKey ? '已设置' : '(使用 .env 或未设置)',
    });
  };

  const hydrateNodesFromHistory = useCallback((storedNodes: Node[], currentTree: TreeNode[]) => {
    const currentCodeFiles = collectCodeFiles(currentTree, panoramaCodeExts);
    return storedNodes.map(node => {
      const data = { ...((node.data || {}) as Record<string, any>) };
      if (typeof data.name === 'string') {
        data.categoryKey = buildNodeCategoryKey(data.name, data.possibleFile, data.routePath);
        data.onDrillDown = (payload: any) => manualDrillDown(payload, node.id, data.depth ?? 0, currentCodeFiles);
      }
      return {
        ...node,
        data,
      };
    });
  }, []);

  useEffect(() => {
    if (!owner || !repo || (sourceMode === 'local' && !projectId)) {
      navigate('/');
      return;
    }

    historyIdRef.current = historyId || (sourceMode === 'local' ? buildHistoryId('local', projectId || '') : buildHistoryId('github', owner, repo));
    loadedFromHistoryRef.current = false;
    setUrlInput(sourceMode === 'github' ? `https://github.com/${owner}/${repo}` : repo);
    setSelectedFile(null);
    setFileContent('');
    setFunctionCategories([]);
    setSelectedCategory(null);
    setNodes([]);
    setEdges([]);
    setAiResult(null);
    setLogs([]);
    setHistoryMeta(null);
    setPanoramaError('');
    fileContentCacheRef.current.clear();

    const cachedRecord = getHistoryRecord(historyIdRef.current);
    if (cachedRecord) {
      historyCreatedAtRef.current = cachedRecord.createdAt;
      setBranch(cachedRecord.branch);
      setTree(cachedRecord.tree);
      setAiResult(cachedRecord.aiResult);
      setFunctionCategories(cachedRecord.functionCategories || []);
      setLogs(cachedRecord.logs.map(sanitizeLogEntry));
      setNodes(hydrateNodesFromHistory(cachedRecord.nodes, cachedRecord.tree));
      setEdges(cachedRecord.edges);
      setHistoryMeta({
        updatedAt: cachedRecord.updatedAt,
        markdownFileName: cachedRecord.markdownFileName,
      });
      setError('');
      setLoading(false);
      loadedFromHistoryRef.current = true;
    }

    const fetchProject = async () => {
      setLoading(true);
      setError('');
      addLog('Project Source', `开始加载${sourceMode === 'github' ? ' GitHub ' : '本地'}项目 ${owner}/${repo}...`);
      try {
        const loadedSource = await loadProjectSource({
          sourceType: sourceMode,
          owner,
          repo,
          projectId,
          token,
        });

        loadedSourceRef.current = loadedSource;
        setBranch(loadedSource.branch);
        setTree(loadedSource.tree as TreeNode[]);
        historyCreatedAtRef.current = historyCreatedAtRef.current || new Date().toISOString();
        addLog('Project Source', `项目加载完成。来源: ${loadedSource.sourceType}，文件数: ${extractFileList(loadedSource.tree).length}`);
      } catch (err: any) {
        setError(err.message || '发生未知错误。');
        addLog('Error', `项目加载失败: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [owner, repo, projectId, historyId, sourceMode, navigate, token, hydrateNodesFromHistory, setEdges, setNodes]);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    const match = urlInput.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      navigate(`/analyze?mode=github&owner=${match[1]}&repo=${match[2].replace(/\.git$/, '')}`);
    } else {
      setError('无效的 GitHub URL 格式。');
    }
  };

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path);
    setLoadingFile(true);
    setFileContent('');
    try {
      const text = await fetchFileContent(path);
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
      
      const promptText = `分析以下来自 GitHub 仓库的文件路径列表。识别项目使用的主要编程语言、技术栈、可能的入口文件，并用中文提供 1-2 句话的项目简介。\n\n文件列表:\n${fileListStr}`;
      
      if (isAnalysisStoppedRef.current) throw new Error('Analysis stopped by user');
      setAiCallCount(c => c + 1);
      const result = await callAi<AIAnalysisResult>(promptText, analysisResultSchema) as AIAnalysisResult;
      if (result) {
        setAiResult(result);
        addLog('AI Analysis', '初步分析完成，开始研判入口文件。', result, { prompt: promptText });

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

请根据以上信息判断该文件是否为项目的核心入口文件。返回 JSON：
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
           addLog('AI Verify', '所有候选文件研判完毕，未找到明确的入口文件。');
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
    const cached = fileContentCacheRef.current.get(filePath);
    if (cached !== undefined) return cached;
    if (!loadedSourceRef.current) throw new Error('项目数据源未初始化。');

    const text = await loadedSourceRef.current.fetchFileContent(filePath);
    fileContentCacheRef.current.set(filePath, text);
    return text;
  };

  const buildPanoramaCacheKey = (funcName: string, filePath: string) =>
    `${filePath}::${funcName}`.toLowerCase();

  const resolveBridge = async (codeFiles: string[]) => {
    if (!aiResult?.verifiedEntryPoint) return null;

    for (const definition of BRIDGE_DEFINITIONS) {
      try {
        const bridge = await definition.resolve({
          aiResult,
          codeFiles,
          fetchFileContent,
        });
        if (bridge) {
          addLog('Panorama Bridge', bridge.description, bridge.targets, {
            bridgeId: definition.id,
            bridgeLabel: definition.label,
          });
          return bridge;
        }
      } catch (err: any) {
        addLog('Panorama Bridge Error', `桥接解析失败: ${definition.label} - ${err.message}`);
      }
    }

    return null;
  };

  const resolveFilePath = async (guessedPath: string, funcName: string, callerPath: string, codeFiles: string[]) => {
    const normalizedFuncName = funcName.includes('::') ? funcName.split('::').pop()?.trim() || funcName : funcName;
    const className = funcName.includes('::') ? funcName.split('::')[0]?.trim() : '';
    if (guessedPath && codeFiles.includes(guessedPath)) return guessedPath;
    
    if (codeFiles.length === 0) return callerPath;

    const promptText = `
      我需要找到函数 \`${funcName}\` 的定义所在文件。
      调用该函数的文件是：\`${callerPath}\`。
      猜测的文件路径是：\`${guessedPath}\`。
      规范化后的函数名是：\`${normalizedFuncName}\`。
      ${className ? `如果它是类方法，则所属类名可能是：\`${className}\`。` : ''}
      请从以下代码文件列表中，找出最可能包含该函数定义的文件路径。
      需要同时考虑以下两种情况：
      1. 代码里以 \`ClassName::FunctionName\` 或类似静态/类方法形式出现
      2. 函数直接定义在 class 内部，调用时未完整带出类名前缀
      如果找不到，请返回调用者文件路径 \`${callerPath}\`。
      文件列表：
      ${codeFiles.join('\n')}
      请只返回最可能的文件路径字符串，不要输出额外解释。
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
    nodesRef.current = nodes;
  }, [nodes]);

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
        await new Promise(resolve => setTimeout(resolve, 80));
        await classifyFunctions(nodesRef.current);
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

    addLog('Panorama', `开始分析函数 ${funcName} (深度: ${depth})`, { file: filePath });

    try {
      const cacheKey = buildPanoramaCacheKey(funcName, filePath);
      const cachedSubFunctions = panoramaAnalysisCacheRef.current.get(cacheKey);
      let subFunctions: Array<{ name: string; possibleFile: string; usage: string; drillDownStatus: number }> | undefined;

      if (cachedSubFunctions) {
        subFunctions = cachedSubFunctions;
        addLog('Panorama Cache', `命中缓存: ${funcName}`, cachedSubFunctions, { file: filePath, cacheKey });
      } else {
        addLog('Panorama Cache', `未命中缓存: ${funcName}`, undefined, { file: filePath, cacheKey });
        const content = await fetchFileContent(filePath);
        const promptText = `你是代码调用链分析专家。请分析文件 \`${filePath}\` 中的 \`${funcName}\` 函数；如果 \`${funcName}\` 代表整个入口文件，则分析该文件的核心执行流程。

只返回“与核心业务流程直接相关”的关键子函数调用，忽略以下内容：
- 数组、对象、Map、Set 的常规增删改查或遍历
- 字符串处理、格式化、trim、split、replace、substring 等操作
- 简单条件判断、日志输出、类型转换、序列化/反序列化
- 标准库函数、第三方库的通用工具函数
- 纯 UI 样式处理、事件绑定的浅层包装

优先保留这些调用：
- 驱动主流程的业务函数
- 请求分发、状态流转、权限校验、数据加载、持久化、核心计算
- 项目内部自定义函数、类方法、模块方法

返回 JSON 数组，每个对象包含：
- name: 子函数名
- possibleFile: 该子函数最可能所在文件路径；若在当前文件中则填当前文件
- usage: 该子函数在当前流程中的业务作用，简短描述
- drillDownStatus: 是否值得继续下钻，-1=不需要，0=不确定，1=需要

代码内容：
${content.substring(0, 15000)}`;

        addLog('Panorama AI Request', `分析关键子函数: ${funcName}`, undefined, { prompt: promptText, file: filePath });
        if (isAnalysisStoppedRef.current) throw new Error('Analysis stopped by user');
        setAiCallCount(c => c + 1);
        subFunctions = await callAi<Array<{ name: string; possibleFile: string; usage: string; drillDownStatus: number }>>(promptText, subFunctionSchema) as Array<{ name: string; possibleFile: string; usage: string; drillDownStatus: number }>;
        panoramaAnalysisCacheRef.current.set(cacheKey, subFunctions);
        addLog('Panorama AI Response', `关键子函数分析完成: ${funcName}`, subFunctions, { prompt: promptText, file: filePath });
      }

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
              categoryKey: buildNodeCategoryKey(fn.name, fn.possibleFile),
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
          const styledNodes = applyCategoryStyles(updatedNodes, functionCategories, selectedCategory);
          setEdges(prevEdges => {
            const updatedEdges = [...prevEdges, ...newEdgesToAdd];
            const styledEdges = applyCategoryEdgeStyles(updatedEdges, styledNodes, selectedCategory);
            const layouted = applyLayout(styledNodes, styledEdges);
            setTimeout(() => setNodes(layouted.nodes), 0);
            return layouted.edges;
          });
          return styledNodes;
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
      const rootNode: Node = {
        id: 'root',
        type: 'customFunction',
        position: { x: 50, y: 50 },
        data: {
          name: ep.split('/').pop() || 'main',
          possibleFile: ep,
          usage: '项目入口文件',
          drillDownStatus: 1,
          depth: 0,
          canDrillDown: false,
          categoryKey: buildNodeCategoryKey(ep.split('/').pop() || 'main', ep),
          onDrillDown: (data: any) => manualDrillDown(data, 'root', 0, codeFiles)
        } satisfies PanoramaFunctionNodeData
      };

      const bridge = await resolveBridge(codeFiles);
      if (bridge) {
        const bridgeNodes: Node[] = bridge.targets.map((target, index) => {
          const nodeId = `root-bridge-${bridge.bridgeId}-${index}`;
          return {
            id: nodeId,
            type: 'customFunction',
            position: { x: 0, y: 0 },
            data: {
              ...target,
              depth: 1,
              canDrillDown: false,
              categoryKey: buildNodeCategoryKey(target.name, target.possibleFile, target.routePath),
              onDrillDown: (data: any) => manualDrillDown(data, nodeId, 1, codeFiles),
            } satisfies PanoramaFunctionNodeData
          };
        });

        const bridgeEdges: Edge[] = bridgeNodes.map(node => ({
          id: `e-root-${node.id}`,
          source: 'root',
          target: node.id,
          type: 'step',
          animated: false,
          style: { stroke: '#52525b', strokeWidth: 1.5, strokeDasharray: '4 4' }
        }));

        const initialNodes = [rootNode, ...bridgeNodes];
        const styledNodes = applyCategoryStyles(initialNodes, functionCategories, selectedCategory);
        const styledEdges = applyCategoryEdgeStyles(bridgeEdges, styledNodes, selectedCategory);
        const layouted = applyLayout(styledNodes, styledEdges);
        setNodes(layouted.nodes);
        setEdges(layouted.edges);

        for (let index = 0; index < bridge.targets.length; index++) {
          const target = bridge.targets[index];
          const nodeId = `root-bridge-${bridge.bridgeId}-${index}`;
          await analyzeFunction(target.name, target.possibleFile, 1, nodeId, codeFiles);
        }
      } else {
        setNodes([rootNode]);
        setEdges([]);
        await analyzeFunction(ep.split('/').pop() || 'main', ep, 1, 'root', codeFiles);
      }

      await new Promise(resolve => setTimeout(resolve, 80));
      await classifyFunctions(nodesRef.current);
      
    } catch (err: any) {
      console.error('Panorama error:', err);
      setPanoramaError(err.message || '生成全景图失败');
      addLog('Panorama Error', `生成全景图失败: ${err.message}`);
    } finally {
      setIsGeneratingPanorama(false);
    }
  };

  const applyCategoryStyles = useCallback((baseNodes: Node[], categories: FunctionCategoryItem[], activeCategory: string | null) => {
    const functionToCategory = new Map<string, FunctionCategoryItem>();
    categories.forEach(category => {
      category.functions.forEach(func => {
        functionToCategory.set(func, category);
      });
    });

    return baseNodes.map(node => {
      const data = { ...((node.data || {}) as Record<string, any>) };
      const nodeKey = typeof data.categoryKey === 'string'
        ? data.categoryKey
        : buildNodeCategoryKey(data.name || '', data.possibleFile, data.routePath);
      const matchedCategory = functionToCategory.get(nodeKey) || functionToCategory.get(data.name || '');
      const isFaded = activeCategory ? matchedCategory?.name !== activeCategory : false;
      data.categoryName = matchedCategory?.name;
      data.categoryColor = matchedCategory?.color || '#10b981';
      data.faded = isFaded;
      data.categoryKey = nodeKey;
      return { ...node, data };
    });
  }, []);

  const applyCategoryEdgeStyles = useCallback((baseEdges: Edge[], styledNodes: Node[], activeCategory: string | null) => {
    const nodeMap = new Map(styledNodes.map(node => [node.id, node]));

    return baseEdges.map(edge => {
      const targetNode = nodeMap.get(edge.target);
      const targetData = (targetNode?.data || {}) as Record<string, any>;
      const categoryColor = targetData.categoryColor || '#52525b';
      const faded = activeCategory ? Boolean(targetData.faded) : false;

      return {
        ...edge,
        style: {
          stroke: faded ? '#3f3f46' : categoryColor,
          strokeWidth: faded ? 1 : 2,
          strokeDasharray: '4 4',
          opacity: faded ? 0.28 : 0.92,
        },
      };
    });
  }, []);

  const classifyFunctions = useCallback(async (currentNodes: Node[]) => {
    if (!owner || !repo || !aiResult || currentNodes.length === 0) return;

    const functions = currentNodes.map(node => {
      const data = (node.data || {}) as { name?: string; usage?: string; possibleFile?: string; routePath?: string };
      return {
        key: buildNodeCategoryKey(data.name || node.id, data.possibleFile || '', data.routePath),
        name: data.name || node.id,
        description: data.usage || '',
        file: data.possibleFile || '',
        routePath: data.routePath || '',
      };
    });

    setIsClassifyingFunctions(true);
    addLog('Function Category', '开始进行功能分类', { count: functions.length });
    try {
      setAiCallCount(c => c + 1);
      const prompt = `请根据以下项目信息对函数进行功能分类，总分类数不超过 10 类。\n仓库地址: https://github.com/${owner}/${repo}\n技术栈: ${aiResult.techStack.join(', ')}\n编程语言: ${aiResult.languages.join(', ')}\n函数列表:\n${functions.map(fn => `- key=${fn.key} | name=${fn.name} | 文件=${fn.file} | URL=${fn.routePath || '无'} | 描述=${fn.description}`).join('\n')}\n\n要求：\n1. assignments 中优先返回 nodeKey 字段，值必须直接使用上面提供的 key。\n2. functionName 字段保留原始函数名，便于展示。\n3. 同名函数如果 key 不同，必须分别归类，不要合并。\n\n请返回分类结果和每个函数的归属。`;
      const result = await callAi<{ categories: Array<{ name: string; summary: string; functions: string[] }>; assignments: CategoryAssignment[] }>(prompt, categorySchema) as { categories: Array<{ name: string; summary: string; functions: string[] }>; assignments: CategoryAssignment[] };

      const normalizedCategories: FunctionCategoryItem[] = result.categories.slice(0, 10).map((category, index) => ({
        name: category.name,
        summary: category.summary,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        functions: category.functions,
      }));

      const categoryMap = new Map(normalizedCategories.map(category => [category.name, category]));
      result.assignments.forEach(item => {
        const target = categoryMap.get(item.category);
        const assignmentKey = item.nodeKey || (item.functionName ? functions.find(fn => fn.name === item.functionName)?.key : '');
        if (target && assignmentKey && !target.functions.includes(assignmentKey)) {
          target.functions.push(assignmentKey);
        }
      });

      setFunctionCategories(normalizedCategories);
      setSelectedCategory(null);
      const styledNodes = applyCategoryStyles(currentNodes, normalizedCategories, null);
      setNodes(styledNodes);
      setEdges(prevEdges => applyCategoryEdgeStyles(prevEdges, styledNodes, null));
      addLog('Function Category', '功能分类完成', normalizedCategories);
    } catch (err: any) {
      addLog('Function Category Error', `功能分类失败: ${err.message}`);
    } finally {
      setIsClassifyingFunctions(false);
    }
  }, [aiResult, applyCategoryEdgeStyles, applyCategoryStyles, owner, repo, setEdges, setNodes]);

  const handleCategorySelect = (categoryName: string | null) => {
    const nextCategory = selectedCategory === categoryName ? null : categoryName;
    setSelectedCategory(nextCategory);
    setNodes(prevNodes => {
      const styledNodes = applyCategoryStyles(prevNodes, functionCategories, nextCategory);
      setEdges(prevEdges => applyCategoryEdgeStyles(prevEdges, styledNodes, nextCategory));
      return styledNodes;
    });
  };

  useEffect(() => {
    if (!owner || !repo || tree.length === 0) return;

    const createdAt = historyCreatedAtRef.current || new Date().toISOString();
    historyCreatedAtRef.current = createdAt;

    const record = saveHistoryRecord({
      id: historyIdRef.current || (sourceMode === 'local' ? buildHistoryId('local', projectId || '') : buildHistoryId('github', owner, repo)),
      sourceType: sourceMode,
      sourceId: loadedSourceRef.current?.sourceId || historyIdRef.current,
      owner,
      repo,
      repoUrl: loadedSourceRef.current?.repoUrl || (sourceMode === 'local' ? `local://${repo}` : `https://github.com/${owner}/${repo}`),
      branch,
      createdAt,
      updatedAt: new Date().toISOString(),
      fileCount: extractFileList(tree).length,
      fileList: extractFileList(tree),
      tree,
      aiResult,
      functionCategories,
      logs,
      nodes: sanitizeNodesForStorage(nodes),
      edges,
    });

    setHistoryMeta({
      updatedAt: record.updatedAt,
      markdownFileName: record.markdownFileName,
    });
  }, [owner, repo, branch, tree, aiResult, functionCategories, logs, nodes, edges]);

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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-400">
              <span className={`${runtimeAiConfig.baseUrl ? 'text-emerald-400' : 'text-zinc-600'}`}>BaseURL</span>
              <span className={`${runtimeAiConfig.apiKey ? 'text-emerald-400' : 'text-zinc-600'}`}>API</span>
              <span className={`${runtimeAiConfig.model ? 'text-emerald-400' : 'text-zinc-600'}`}>Model</span>
              <span className={`${token ? 'text-emerald-400' : 'text-zinc-600'}`}>GitHub</span>
            </div>
            <button
              onClick={openSettings}
              className="flex items-center space-x-2 bg-zinc-900/50 border border-zinc-800 px-3 py-1.5 rounded-xl hover:bg-zinc-800 transition-colors text-sm text-zinc-400 hover:text-zinc-200"
            >
              <Settings2 className="w-4 h-4" />
              <span>设置</span>
            </button>
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
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-500">当前项目</div>
                  <div className="mt-2 text-lg font-semibold text-zinc-100">{repo}</div>
                  <div className="mt-1 text-sm font-mono text-emerald-400">{owner}/{repo}</div>
                  <div className="mt-3 text-[11px] text-zinc-500">
                    分支 {branch} · 文件 {tree.reduce((acc, node) => acc + countFiles(node), 0)}
                  </div>
                </div>

                {historyMeta && (
                  <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                    <div className="text-zinc-400 text-xs mb-1">历史工程文件</div>
                    <div className="font-mono text-xs text-emerald-400 break-all">{historyMeta.markdownFileName}</div>
                    <div className="text-[11px] text-zinc-500 mt-2">最近更新：{new Date(historyMeta.updatedAt).toLocaleString()}</div>
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

                <div className="border-t border-zinc-800 pt-4 mt-4">
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>功能分类</span>
                    {isClassifyingFunctions && <span className="text-[10px] text-emerald-400">分类中...</span>}
                  </div>
                  <div className="space-y-2">
                    {functionCategories.length > 0 && (
                      <button
                        onClick={() => handleCategorySelect(null)}
                        className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${selectedCategory === null ? 'border-zinc-400 bg-zinc-900 text-zinc-100 shadow-[0_0_0_1px_rgba(244,244,245,0.15)]' : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900'}`}
                      >
                        全部分类
                      </button>
                    )}
                    {functionCategories.map(category => (
                      <button
                        key={category.name}
                        onClick={() => handleCategorySelect(category.name)}
                        className="w-full text-left rounded-xl border p-3 transition-all"
                        style={{
                          borderColor: category.color,
                          background: 'rgba(24,24,27,0.92)',
                          boxShadow: selectedCategory === category.name
                            ? `0 0 0 1px ${category.color}66, 0 0 0 4px ${category.color}18`
                            : `inset 3px 0 0 ${category.color}`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium" style={{ color: category.color }}>{category.name}</div>
                            <div className="mt-1 text-xs text-zinc-300">{category.summary}</div>
                          </div>
                          <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: `${category.color}66`, color: category.color }}>
                            {category.functions.length}
                          </span>
                        </div>
                      </button>
                    ))}
                    {functionCategories.length === 0 && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-4 text-xs text-zinc-500">
                        生成全景图后会自动进行功能分类。
                      </div>
                    )}
                  </div>
                </div>

                {/* System Logs */}
                <div className="border-t border-zinc-800 pt-4 mt-4 flex-1 flex flex-col min-h-[200px]">
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <div className="flex items-center">
                      <Terminal className="w-4 h-4 mr-2" />
                      系统日志
                      <div className="ml-4 flex items-center space-x-2 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] text-zinc-400">AI检测 {aiCallCount}次</span>
                      </div>
                      {(isAnalyzing || isGeneratingPanorama) && (
                        <button
                          onClick={() => {
                            isAnalysisStoppedRef.current = true;
                            setIsAnalyzing(false);
                            setIsGeneratingPanorama(false);
                            addLog('System', '用户已手动停止 AI 分析');
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

      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <div className="text-sm font-medium text-zinc-100">本地环境设置</div>
                <div className="mt-1 text-xs text-zinc-500">优先使用本地保存的配置，留空时回退到 `.env`。</div>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">Base URL</label>
                <input
                  type="text"
                  value={draftAiConfig.baseUrl}
                  onChange={(e) => setDraftAiConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder={BASE_URL || 'https://api.openai.com/v1'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">API Key</label>
                <input
                  type="password"
                  value={draftAiConfig.apiKey}
                  onChange={(e) => setDraftAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder={AI_API_KEY ? '已从 .env 读取默认值' : '输入 AI API Key'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">Model</label>
                <input
                  type="text"
                  value={draftAiConfig.model}
                  onChange={(e) => setDraftAiConfig(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder={MODEL || 'gpt-4o-mini'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">GitHub Token</label>
                <div className="relative">
                  <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="password"
                    value={draftGithubToken}
                    onChange={(e) => setDraftGithubToken(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-10 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="可选，用于提升 GitHub API 配额"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-4">
              <div className="text-xs text-zinc-500">
                当前状态：AI {runtimeAiConfig.baseUrl || runtimeAiConfig.apiKey || runtimeAiConfig.model ? '已配置' : '使用 .env'} · GitHub {token ? '已配置' : '未配置'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  取消
                </button>
                <button
                  onClick={saveSettings}
                  className="rounded-lg border border-emerald-700/50 bg-emerald-600/20 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-600/30"
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                系统日志（全屏）
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
              全景图分析（全屏）
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










