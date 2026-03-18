import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Search, AlertCircle, Key, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { getHistoryRecords, type AnalysisHistoryRecord } from '../lib/analysisHistory';

export default function Home() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState(localStorage.getItem('github_token') || '');
  const [showTokenInput, setShowTokenInput] = useState(!localStorage.getItem('github_token'));
  const [error, setError] = useState('');
  const [historyRecords, setHistoryRecords] = useState<AnalysisHistoryRecord[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setHistoryRecords(getHistoryRecords());
  }, []);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('请输入 GitHub 仓库地址');
      return;
    }

    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      setError('无效的 GitHub 地址。请使用格式：https://github.com/owner/repo');
      return;
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    navigate(`/analyze?owner=${owner}&repo=${repo}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-4 relative">
      {/* Top Right Token Manager */}
      <div className="absolute top-4 right-4 z-50">
        {showTokenInput ? (
          <div className="flex items-center space-x-2 bg-zinc-900 border border-zinc-800 p-2 rounded-xl shadow-xl">
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
            className="flex items-center space-x-2 bg-zinc-900/50 border border-zinc-800 px-3 py-2 rounded-xl hover:bg-zinc-800 transition-colors text-sm text-zinc-400 hover:text-zinc-200"
          >
            <Key className="w-4 h-4" />
            <span>设置 Token</span>
          </button>
        )}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl text-center space-y-8"
      >
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full blur opacity-75"></div>
            <div className="relative bg-zinc-900 rounded-full p-4">
              <Github className="w-16 h-16 text-white" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight font-sans">
            Visible Code
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            可视化项目结构，轻松探索和分析 GitHub 仓库代码。
          </p>
        </div>

        <form onSubmit={handleAnalyze} className="mt-12 space-y-4">
          <div className="relative group max-w-xl mx-auto">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              className="block w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-lg"
              placeholder="https://github.com/owner/repo"
            />
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center justify-center space-x-2 text-red-400 text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </motion.div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-emerald-600 border border-transparent rounded-xl hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-zinc-950 transition-colors shadow-lg shadow-emerald-900/20"
            >
              分析仓库
            </button>
          </div>
        </form>
      </motion.div>

      <div className="w-full max-w-6xl mt-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-zinc-100">历史记录</h2>
          <span className="text-sm text-zinc-500">{historyRecords.length} 个项目</span>
        </div>

        {historyRecords.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">
            暂无历史记录，先分析一个 GitHub 仓库。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {historyRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => navigate(`/analyze?owner=${record.owner}&repo=${record.repo}`)}
                className="text-left rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-emerald-500/40 hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-zinc-100">{record.owner}/{record.repo}</div>
                    <div className="mt-1 text-sm text-zinc-500 break-all">{record.repoUrl}</div>
                  </div>
                  <div className="shrink-0 rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-400">
                    {record.fileCount} 文件
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(record.aiResult?.languages || []).slice(0, 4).map((lang) => (
                    <span key={lang} className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300">
                      {lang}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(record.aiResult?.techStack || []).slice(0, 4).map((tech) => (
                    <span key={tech} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                      {tech}
                    </span>
                  ))}
                </div>

                <p className="mt-4 max-h-[4.5rem] overflow-hidden text-sm leading-6 text-zinc-400">
                  {record.aiResult?.summary || '暂无 AI 分析摘要'}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span>{record.branch}</span>
                  <span>{new Date(record.updatedAt).toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
