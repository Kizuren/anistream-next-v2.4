"use client";
import { useState } from "react";

export default function CachePage() {
  const [secret,   setSecret]   = useState("");
  const [animeId,  setAnimeId]  = useState("");
  const [target,   setTarget]   = useState("all");
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);

  async function call(body) {
    setLoading(true); setResult(null);
    try {
      const r = await fetch("/api/cache/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-clear-secret": secret },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setResult(d);
    } catch (e) {
      setResult({ error: e.message });
    } finally { setLoading(false); }
  }

  const btn = "padding:8px 18px;border:1px solid #c0394d;border-radius:6px;background:#c0394d;color:#fff;cursor:pointer;font-size:13px;font-weight:600;";
  const btnGhost = "padding:8px 18px;border:1px solid #555;border-radius:6px;background:transparent;color:#ccc;cursor:pointer;font-size:13px;";
  const inp = "width:100%;padding:8px 10px;background:#1a1628;border:1px solid #333;border-radius:6px;color:#f0eaf5;font-size:13px;box-sizing:border-box;";
  const lbl = "display:block;font-size:12px;color:#9a8faa;margin-bottom:4px;";

  return (
    <div style={{ minHeight:"100vh", padding:"40px 24px", maxWidth:600, margin:"0 auto", fontFamily:"Inter,sans-serif", color:"#f0eaf5" }}>
      <h1 style={{ fontFamily:"Cinzel,serif", fontSize:24, marginBottom:6 }}>Cache Manager</h1>
      <p style={{ color:"#9a8faa", fontSize:13, marginBottom:32 }}>
        Clear Redis (Upstash) and Turso SQLite caches. Use this when a source mapping is stale or streams break.
      </p>

      <div style={{ display:"flex", flexDirection:"column", gap:16, background:"#0d0b14", padding:24, borderRadius:10, border:"1px solid #2a2040", marginBottom:24 }}>
        <div>
          <label style={{ ...lbl }}>Cache Clear Secret (if set in Vercel)</label>
          <input style={{ ...inp }} type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Leave blank if not configured" />
        </div>
        <div>
          <label style={{ ...lbl }}>AniList ID (optional — clears one anime only)</label>
          <input style={{ ...inp }} type="number" value={animeId} onChange={e => setAnimeId(e.target.value)} placeholder="e.g. 125367 — blank for full clear" />
        </div>
        {!animeId && (
          <div>
            <label style={{ ...lbl }}>Target</label>
            <select style={{ ...inp }} value={target} onChange={e => setTarget(e.target.value)}>
              <option value="all">All (Redis + Turso)</option>
              <option value="redis">Redis only</option>
              <option value="turso">Turso only</option>
            </select>
          </div>
        )}
        <div style={{ display:"flex", gap:10, marginTop:4 }}>
          <button style={{ ...btn }} disabled={loading}
            onClick={() => animeId ? call({ anilistId: Number(animeId) }) : call({ target })}>
            {loading ? "Clearing…" : animeId ? `Clear anime ${animeId}` : `Clear ${target}`}
          </button>
          <button style={{ ...btnGhost }} onClick={() => { setResult(null); setAnimeId(""); }}>Reset</button>
        </div>
      </div>

      {result && (
        <pre style={{ background:"#0d0b14", border:"1px solid #2a2040", borderRadius:8, padding:16, fontSize:12, color:"#9a8faa", whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <div style={{ marginTop:32, color:"#5a5068", fontSize:12 }}>
        <p><strong style={{ color:"#9a8faa" }}>When to clear cache:</strong></p>
        <ul style={{ marginTop:8, paddingLeft:20, lineHeight:2 }}>
          <li>Source returns wrong episodes or no stream after a Crysoline update</li>
          <li>AnimePahe/Anizone ID changed (stale UUID in Turso)</li>
          <li>429 storms — clear Redis to reset rate-limit state</li>
          <li>After adding/changing a source in crysoline.js</li>
        </ul>
      </div>
    </div>
  );
}
