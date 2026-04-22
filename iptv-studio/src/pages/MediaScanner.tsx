import React, { useState } from 'react';
import { Search, Link, Copy, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface ScanResult {
  url: string;
  source: string;
  type: string;
}

export const MediaScanner: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch('/api/channels/scan-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to scan URL');

      if (data.success) {
        setResults(data.links);
      } else {
        setError(data.error || 'No media streams found.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (link: string, index: number) => {
    navigator.clipboard.writeText(link);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">
          Media <span className="text-indigo-500">Scanner</span>
        </h1>
        <p className="text-slate-400 font-medium max-w-2xl">
          Premium tool for discovering hidden stream links. Input any website URL to extract high-quality M3U8, MPD, and TS media sources.
        </p>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
        <form onSubmit={handleScan} className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-500 transition-colors">
              <Link size={20} />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/live-stream-page"
              className="w-full bg-slate-950/50 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url}
            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 whitespace-nowrap"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            {loading ? 'Scanning...' : 'Detect Media'}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 flex items-center gap-4 text-rose-400">
          <AlertTriangle size={24} />
          <p className="font-bold">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-black text-white uppercase tracking-wider">
              Discovered <span className="text-indigo-500">{results.length}</span> Results
            </h2>
          </div>
          {results.map((result, index) => (
            <div 
              key={index} 
              className="group bg-slate-900/40 hover:bg-indigo-500/5 backdrop-blur-xl border border-white/5 hover:border-indigo-500/30 rounded-2xl p-6 transition-all flex flex-col md:flex-row items-center gap-6"
            >
              <div className="w-12 h-12 bg-slate-950 rounded-xl flex items-center justify-center text-indigo-500 shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                <Radio className={result.type === 'Auto' ? 'text-indigo-400' : 'text-slate-500'} size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md ${
                    result.source === 'yt-dlp' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {result.source}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                    {result.type}
                  </span>
                </div>
                <p className="text-white font-mono text-sm break-all line-clamp-1">{result.url}</p>
              </div>
              <button
                onClick={() => copyToClipboard(result.url, index)}
                className={`shrink-0 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
                  copiedIndex === index 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                    : 'bg-slate-800 hover:bg-white text-slate-400 hover:text-slate-900'
                }`}
              >
                {copiedIndex === index ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copiedIndex === index ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
          <Loader2 className="animate-spin text-indigo-500" size={48} />
          <p className="font-black uppercase tracking-[0.3em] text-xs">Phân tích chuyên sâu...</p>
        </div>
      )}
    </div>
  );
};

const Radio: React.FC<{className?: string, size?: number}> = ({className, size=24}) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>
  </svg>
);
