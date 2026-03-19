import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Search, AlertCircle, Key, Trash2, Settings2, X, ArrowRight, FolderOpen, Laptop2 } from 'lucide-react';
import { motion } from 'motion/react';
import {
  buildHistoryId,
  getHistoryRecords,
  removeHistoryRecord,
  type AnalysisHistoryRecord,
  type AnalysisSourceType,
} from '../lib/analysisHistory';
import { saveLocalProjectSnapshot } from '../lib/localProjectStore';

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

export default function Home() {
  const [activeMode, setActiveMode] = useState<AnalysisSourceType>('github');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState(localStorage.getItem(GITHUB_TOKEN_STORAGE) || '');
  const [runtimeAiConfig, setRuntimeAiConfig] = useState<RuntimeAiConfig>(() => getRuntimeAiConfig());
  const [draftAiConfig, setDraftAiConfig] = useState<RuntimeAiConfig>(() => getRuntimeAiConfig());
  const [draftGithubToken, setDraftGithubToken] = useState(localStorage.getItem(GITHUB_TOKEN_STORAGE) || '');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');
  const [historyRecords, setHistoryRecords] = useState<AnalysisHistoryRecord[]>([]);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setHistoryRecords(getHistoryRecords());
  }, []);

  const filteredHistory = historyRecords.filter(record => (record.sourceType || 'github') === activeMode);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('请输入 GitHub 仓库地址');
      return;
    }

    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      setError('无效的 GitHub 地址，请使用格式: https://github.com/owner/repo');
      return;
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    navigate(`/analyze?mode=github&owner=${owner}&repo=${repo}`);
  };

  const handleDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeHistoryRecord(id);
    setHistoryRecords(prev => prev.filter(record => record.id !== id));
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
  };

  const handleLocalFolderPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError('');
    setIsImportingLocal(true);
    try {
      const snapshot = await saveLocalProjectSnapshot(files);
      const historyId = buildHistoryId('local', snapshot.id);
      navigate(`/analyze?mode=local&projectId=${snapshot.id}&owner=local&repo=${encodeURIComponent(snapshot.name)}&historyId=${encodeURIComponent(historyId)}`);
    } catch (err: any) {
      setError(err.message || '导入本地项目失败');
    } finally {
      setIsImportingLocal(false);
      event.target.value = '';
    }
  };

  const renderHistoryCard = (record: AnalysisHistoryRecord) => (
    <button
      key={record.id}
      type="button"
      onClick={() => {
        if (record.sourceType === 'local') {
          const projectId = record.sourceId.replace(/^local:/, '');
          navigate(`/analyze?mode=local&projectId=${encodeURIComponent(projectId)}&owner=${encodeURIComponent(record.owner)}&repo=${encodeURIComponent(record.repo)}&historyId=${encodeURIComponent(record.id)}`);
          return;
        }
        navigate(`/analyze?mode=github&owner=${record.owner}&repo=${record.repo}&historyId=${encodeURIComponent(record.id)}`);
      }}
      className="group rounded-2xl border border-[#30363d] bg-[#0d1117] p-5 text-left transition-colors hover:border-[#58a6ff] hover:bg-[#161b22]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-[#f0f6fc]">{record.owner}/{record.repo}</div>
          <div className="mt-1 line-clamp-2 break-all text-xs leading-5 text-[#7d8590]">{record.repoUrl}</div>
        </div>
        <div className="flex items-start gap-2">
          <span className="rounded-full border border-[#30363d] px-2 py-1 text-[11px] text-[#8b949e]">{record.fileCount} 文件</span>
          <button
            type="button"
            onClick={(e) => handleDeleteHistory(e, record.id)}
            className="rounded-lg border border-[#30363d] p-2 text-[#ff7b72] transition-colors hover:border-[#ff7b72]/50 hover:bg-[#2d1117]"
            title="删除历史记录"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(record.aiResult?.languages || []).slice(0, 4).map((lang) => (
          <span key={lang} className="rounded-full border border-[#1f6feb]/25 bg-[#0c2d6b]/20 px-2 py-1 text-[11px] text-[#79c0ff]">{lang}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(record.aiResult?.techStack || []).slice(0, 4).map((tech) => (
          <span key={tech} className="rounded-full border border-[#238636]/25 bg-[#0f2419] px-2 py-1 text-[11px] text-[#56d364]">{tech}</span>
        ))}
      </div>

      <p className="mt-4 h-[72px] overflow-hidden text-sm leading-6 text-[#8b949e]">{record.aiResult?.summary || '暂无 AI 分析摘要'}</p>

      <div className="mt-4 flex items-center justify-between border-t border-[#21262d] pt-4 text-xs text-[#7d8590]">
        <span>{record.branch}</span>
        <span>{new Date(record.updatedAt).toLocaleString()}</span>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#f0f6fc] px-4 py-5 md:px-8">
      <div className="fixed right-4 top-5 z-50 md:right-8">
        <button onClick={openSettings} className="inline-flex items-center gap-2 rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-2.5 text-sm text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#1f2630]">
          <Settings2 className="h-4 w-4" />
          <span>设置</span>
        </button>
      </div>

      <div className="mx-auto min-h-[calc(100vh-2.5rem)] max-w-7xl">
        <div className="px-0 pb-5 pt-16 md:px-2 md:pb-10 md:pt-20">
          <div className="px-5 py-8 md:px-12 md:py-12">
            <div className="mx-auto max-w-3xl text-center">
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-[#30363d] bg-[#0d1117] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <Github className="h-12 w-12 text-[#f0f6fc]" />
                </div>
                <div className="mt-8 text-xs uppercase tracking-[0.34em] text-[#7d8590]">Visible Code</div>
                <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">Visible Code</h1>
                <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#8b949e] md:text-base">从入口文件、框架路由到核心调用链，快速理解一个项目真正的业务结构。</p>
              </motion.div>

              <div className="mx-auto mt-10 flex max-w-xl items-center justify-center rounded-2xl border border-[#30363d] bg-[#0d1117] p-1.5">
                <button
                  onClick={() => {
                    setActiveMode('github');
                    setError('');
                  }}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm transition-colors ${activeMode === 'github' ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:bg-[#161b22]'}`}
                >
                  <span className="inline-flex items-center gap-2"><Github className="h-4 w-4" />GitHub 模式</span>
                </button>
                <button
                  onClick={() => {
                    setActiveMode('local');
                    setError('');
                  }}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm transition-colors ${activeMode === 'local' ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:bg-[#161b22]'}`}
                >
                  <span className="inline-flex items-center gap-2"><Laptop2 className="h-4 w-4" />本地模式</span>
                </button>
              </div>

              {activeMode === 'github' ? (
                <motion.form onSubmit={handleAnalyze} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35 }} className="mx-auto mt-8 max-w-2xl">
                  <div className="rounded-2xl border border-[#30363d] bg-[#0d1117] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <div className="flex flex-col gap-2 md:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6e7681]" />
                        <input
                          type="text"
                          value={url}
                          onChange={(e) => {
                            setUrl(e.target.value);
                            setError('');
                          }}
                          className="h-14 w-full rounded-xl border border-transparent bg-transparent pl-12 pr-4 text-base text-[#f0f6fc] placeholder:text-[#6e7681] focus:border-[#1f6feb] focus:outline-none"
                          placeholder="https://github.com/owner/repo"
                        />
                      </div>
                      <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-[#238636] bg-[#238636] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2ea043]">
                        <span>开始分析</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.form>
              ) : (
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35 }} className="mx-auto mt-8 max-w-2xl">
                  <div className="rounded-2xl border border-[#30363d] bg-[#0d1117] p-6 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <div className="text-sm font-medium text-[#f0f6fc]">本地项目检验</div>
                    <div className="mt-2 text-sm leading-6 text-[#8b949e]">选择本地项目文件夹后，会生成本地快照并进入与 GitHub 模式共用的分析流程。</div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingLocal}
                      className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#238636] bg-[#238636] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span>{isImportingLocal ? '导入中...' : '选择本地项目文件夹'}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleLocalFolderPick}
                      {...({ webkitdirectory: 'true', directory: 'true', multiple: true } as any)}
                    />
                  </div>
                </motion.div>
              )}

              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 flex items-center justify-center gap-2 text-sm text-[#ff7b72]">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </motion.div>
              )}
            </div>

            <div className="mx-auto mt-14 max-w-6xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[#f0f6fc]">{activeMode === 'github' ? 'GitHub 历史记录' : '本地历史记录'}</div>
                  <div className="mt-1 text-xs text-[#7d8590]">只显示当前模式下的分析记录。</div>
                </div>
                <div className="rounded-full border border-[#30363d] bg-[#0d1117] px-3 py-1 text-xs text-[#8b949e]">{filteredHistory.length} 个项目</div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#0d1117]/70 px-6 py-12 text-center text-sm text-[#7d8590]">暂无{activeMode === 'github' ? ' GitHub ' : '本地'}历史记录。</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredHistory.map(renderHistoryCard)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#30363d] bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#21262d] px-5 py-4">
              <div>
                <div className="text-sm font-medium text-[#f0f6fc]">本地环境设置</div>
                <div className="mt-1 text-xs text-[#7d8590]">优先使用本地保存的配置，留空时回退到 `.env`。</div>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-[#7d8590] transition-colors hover:text-[#f0f6fc]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#7d8590]">Base URL</label>
                <input
                  type="text"
                  value={draftAiConfig.baseUrl}
                  onChange={(e) => setDraftAiConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  className="w-full rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2.5 text-sm text-[#f0f6fc] focus:border-[#1f6feb] focus:outline-none"
                  placeholder={BASE_URL || 'https://api.openai.com/v1'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#7d8590]">API Key</label>
                <input
                  type="password"
                  value={draftAiConfig.apiKey}
                  onChange={(e) => setDraftAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2.5 text-sm text-[#f0f6fc] focus:border-[#1f6feb] focus:outline-none"
                  placeholder={AI_API_KEY ? '已从 .env 读取默认值' : '输入 AI API Key'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#7d8590]">Model</label>
                <input
                  type="text"
                  value={draftAiConfig.model}
                  onChange={(e) => setDraftAiConfig(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2.5 text-sm text-[#f0f6fc] focus:border-[#1f6feb] focus:outline-none"
                  placeholder={MODEL || 'gpt-4o-mini'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#7d8590]">GitHub Token</label>
                <div className="relative">
                  <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e7681]" />
                  <input
                    type="password"
                    value={draftGithubToken}
                    onChange={(e) => setDraftGithubToken(e.target.value)}
                    className="w-full rounded-xl border border-[#30363d] bg-[#161b22] py-2.5 pl-10 pr-3 text-sm text-[#f0f6fc] focus:border-[#1f6feb] focus:outline-none"
                    placeholder="可选，用于提升 GitHub API 配额"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#21262d] px-5 py-4">
              <div className="text-xs text-[#7d8590]">当前状态: AI {runtimeAiConfig.baseUrl || runtimeAiConfig.apiKey || runtimeAiConfig.model ? '已配置' : '使用 .env'} · GitHub {token ? '已配置' : '未配置'}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSettings(false)} className="rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#c9d1d9] transition-colors hover:bg-[#1f2630]">取消</button>
                <button onClick={saveSettings} className="rounded-xl border border-[#238636] bg-[#238636] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2ea043]">保存设置</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

