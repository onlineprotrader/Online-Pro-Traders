import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createChart, CandlestickSeries, HistogramSeries, ColorType } from "lightweight-charts";
import { createClient } from "@supabase/supabase-js";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, BookOpen, CandlestickChart,
  Check, ChevronDown, CircleHelp, Clock3, Eye, Flame, Gauge, Layers3, LockKeyhole,
  LogOut, Menu, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users,
  Waves, X, Zap
} from "lucide-react";
import "./style.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").trim().toLowerCase();

const toolsList = [
  { id:"heatmap", name:"Liquidity heatmap", desc:"Order-book depth and liquidity changes", icon:Flame, tag:"ORDER FLOW", detail:"Shows aggregated resting bid/ask depth from the selected exchange. This starter displays a live order-book snapshot, not a historical heatmap." },
  { id:"footprint", name:"Footprint", desc:"Buy vs sell volume by price level", icon:Layers3, tag:"ORDER FLOW", detail:"A true footprint requires trade-side and price-bucket aggregation. The starter uses public trades to estimate taker buy/sell volume." },
  { id:"whales", name:"Whale candles", desc:"Flag unusually large public trades", icon:Waves, tag:"LARGE TRADES", detail:"Highlights unusually large public trades relative to the current sample. A large print does not prove a specific whale identity." },
  { id:"profile", name:"Volume profile", desc:"POC and high-volume price areas", icon:BarChart3, tag:"VOLUME", detail:"Volume profile is estimated from recent candle volume and price buckets. It is not a full historical exchange profile." },
  { id:"gamma", name:"Gamma levels", desc:"Options gamma / zero-gamma context", icon:Gauge, tag:"OPTIONS", detail:"Requires options-chain and open-interest data. No live gamma feed is configured in this starter, so values are marked unavailable rather than fabricated." },
  { id:"futures", name:"Futures context", desc:"Funding, open interest and liquidations", icon:Activity, tag:"DERIVATIVES", detail:"Funding and open interest can be read from public futures endpoints. A cross-exchange liquidation map needs a separate data source." },
  { id:"tape", name:"Tape & L3 events", desc:"Time & sales and book changes", icon:Eye, tag:"ORDER FLOW", detail:"Shows public time-and-sales and order-book snapshots. Full Level 3 order-by-order data is not available from every exchange." },
  { id:"decision", name:"Decision panel", desc:"A transparent market-bias summary", icon:Zap, tag:"ANALYTICS", detail:"Combines trend, RSI and recent trade-flow clues into an educational bias. It is not a guaranteed prediction or financial advice." },
  { id:"chart", name:"Live trading chart", desc:"Candles, volume and timeframes", icon:CandlestickChart, tag:"CHARTING", detail:"Public BTC/USDT market data via Binance public endpoints. No trading account or API key is connected." },
  { id:"risk", name:"Risk management", desc:"Position size, stop and target calculator", icon:ShieldCheck, tag:"RISK", detail:"Calculates position size from your chosen account risk. It does not submit or execute orders." }
];
const fmt = (n, digits=2) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US",{maximumFractionDigits:digits,minimumFractionDigits:digits}) : "—";
const money = n => Number.isFinite(Number(n)) ? "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2}) : "—";

function App() {
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [page,setPage] = useState("home");
  const [authMode,setAuthMode] = useState("login");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [fullName,setFullName] = useState("");
  const [authBusy,setAuthBusy] = useState(false);
  const [authMessage,setAuthMessage] = useState("");
  const [menuOpen,setMenuOpen] = useState(false);
  const [selectedTool,setSelectedTool] = useState("chart");
  const [symbol,setSymbol] = useState("BTCUSDT");
  const [interval,setInterval] = useState("5m");
  const [market,setMarket] = useState({price:null,change:null,high:null,low:null,volume:null,funding:null,oi:null});
  const [marketErr,setMarketErr] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [users,setUsers] = useState([]);
  const [adminBusy,setAdminBusy] = useState(false);
  const isAdmin = !!session && !!ADMIN_EMAIL && session.user.email?.toLowerCase() === ADMIN_EMAIL;
  const approved = isAdmin || !!profile?.approved;
  const expiry = profile?.expires_at ? new Date(profile.expires_at) : null;
  const expired = !!expiry && expiry.getTime() <= Date.now();
  const canUseTerminal = isAdmin || (approved && !expired);
  const isConfigured = !!supabase;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s) => setSession(s));
    return () => subscription.unsubscribe();
  },[]);
  useEffect(() => {
    let live = true;
    async function loadProfile() {
      if (!supabase || !session?.user) { setProfile(null); return; }
      const {data,error} = await supabase.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
      if (!live) return;
      if (error) { setProfile(null); setAuthMessage("Profile could not load. Check Supabase SQL setup and policies."); return; }
      setProfile(data);
    }
    loadProfile();
    return () => {live=false;};
  },[session]);
  useEffect(() => {
    let alive=true;
    async function loadMarket() {
      try {
        setMarketErr("");
        const [ticker, candles] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`).then(r=>{if(!r.ok)throw Error("Ticker feed unavailable");return r.json()}),
          fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=150`).then(r=>{if(!r.ok)throw Error("Candle feed unavailable");return r.json()})
        ]);
        const futuresSymbol = symbol;
        let funding=null, oi=null;
        if (symbol==="BTCUSDT" || symbol==="ETHUSDT") {
          try {
            const [f,o] = await Promise.all([
              fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${futuresSymbol}`).then(r=>r.ok?r.json():null),
              fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${futuresSymbol}`).then(r=>r.ok?r.json():null)
            ]);
            funding=f?.lastFundingRate ? Number(f.lastFundingRate)*100 : null;
            oi=o?.openInterest ? Number(o.openInterest) : null;
          } catch {}
        }
        if (!alive) return;
        setMarket({price:Number(ticker.lastPrice),change:Number(ticker.priceChangePercent),high:Number(ticker.highPrice),low:Number(ticker.lowPrice),volume:Number(ticker.quoteVolume),funding,oi});
        window.__optCandles = candles.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
        setRefresh(v=>v+1);
      } catch(e) { if(alive) setMarketErr(e.message || "Unable to load public market data."); }
    }
    loadMarket();
    const id=setInterval(loadMarket,15000);
    return ()=>{alive=false;clearInterval(id)};
  },[symbol,interval]);
  useEffect(() => {
    if (!isAdmin || !supabase) return;
    (async()=>{const {data}=await supabase.from("profiles").select("*").order("created_at",{ascending:false});setUsers(data||[])})();
  },[isAdmin,session,refresh]);
  async function authSubmit(e) {
    e.preventDefault(); setAuthBusy(true); setAuthMessage("");
    if (!supabase) {setAuthMessage("Supabase is not configured yet. Follow README and add your project URL and anon key.");setAuthBusy(false);return;}
    try {
      if(authMode==="signup") {
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{full_name:fullName}}});
        if(error) throw error;
        if(data.user && !data.session) setAuthMessage("Account created. Check your email to confirm, then sign in. Your terminal access remains pending until admin approval.");
        else setAuthMessage("Account created. Your access is pending admin approval.");
      } else {
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(error) throw error;
        setPage("account");
      }
    } catch(err) {setAuthMessage(err.message||"Authentication failed.");}
    finally {setAuthBusy(false);}
  }
  async function signOut(){if(supabase) await supabase.auth.signOut();setPage("home");setMenuOpen(false)}
  async function updateUser(userId, approvedValue, days) {
    if(!supabase) return;
    setAdminBusy(true);
    const expiresAt=approvedValue ? new Date(Date.now()+Number(days)*86400000).toISOString() : null;
    const {error}=await supabase.from("profiles").update({approved:approvedValue,expires_at:expiresAt,updated_at:new Date().toISOString()}).eq("id",userId);
    if(error) alert("Update failed: "+error.message);
    const {data}=await supabase.from("profiles").select("*").order("created_at",{ascending:false});
    setUsers(data||[]);setAdminBusy(false);
  }
  function openTool(id){setSelectedTool(id);setPage("terminal");setMenuOpen(false)}
  if(page==="terminal" && !canUseTerminal) return <Shell><Header {...{session,setPage,setMenuOpen,menuOpen,signOut,isAdmin}}/><main className="page narrow"><div className="access-card"><LockKeyhole size={34}/><h1>Terminal access restricted</h1><p>{!session?"Please sign in to continue.":!approved?"Your account is waiting for admin approval.": "Your access period has expired."}</p><button className="primary" onClick={()=>setPage(session?"account":"auth")}>{session?"View account status":"Sign in / Create account"}</button></div></main></Shell>;
  return <Shell><Header {...{session,setPage,setMenuOpen,menuOpen,signOut,isAdmin}}/>
    {menuOpen&&<div className="mobile-menu"><button onClick={()=>{setPage("home");setMenuOpen(false)}}>Home</button><button onClick={()=>{setPage("terminal");setMenuOpen(false)}}>Terminal</button><button onClick={()=>{setPage("account");setMenuOpen(false)}}>Account</button>{isAdmin&&<button onClick={()=>{setPage("admin");setMenuOpen(false)}}>Admin dashboard</button>}</div>}
    {page==="home"&&<Home {...{session,setPage,openTool,market,marketErr}}/>}
    {page==="auth"&&<main className="page auth-page"><div className="auth-card"><div className="eyebrow">ONLINE PRO TRADER</div><h1>{authMode==="login"?"Welcome back":"Create your account"}</h1><p className="muted">{authMode==="login"?"Sign in to check your access.":"New accounts need administrator approval before terminal access."}</p><form onSubmit={authSubmit}>{authMode==="signup"&&<label>Full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your name"/></label>}<label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" minLength="8" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary full" disabled={authBusy}>{authBusy?"Please wait…":authMode==="login"?"Sign in":"Create account"}</button></form>{authMessage&&<div className="notice">{authMessage}</div>}<p className="switch-auth">{authMode==="login"?"New here?":"Already have an account?"} <button className="text-btn" onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setAuthMessage("")}}>{authMode==="login"?"Create account":"Sign in"}</button></p>{!isConfigured&&<div className="notice warn">Setup needed: connect Supabase using the README before accounts can work.</div>}</div></main>}
    {page==="account"&&<main className="page narrow"><div className="section-heading"><div><div className="eyebrow">YOUR ACCOUNT</div><h1>Account & access</h1></div></div>{!session?<div className="panel"><p>Sign in or create an account to view your access status.</p><button className="primary" onClick={()=>setPage("auth")}>Sign in / Sign up</button></div>:<div className="panel account-panel"><div className="account-line"><span>Email</span><strong>{session.user.email}</strong></div><div className="account-line"><span>Status</span><strong className={canUseTerminal?"green":"yellow"}>{isAdmin?"Administrator":!approved?"Pending approval":expired?"Expired":"Approved"}</strong></div><div className="account-line"><span>Access expires</span><strong>{isAdmin?"Never (admin)":expiry?expiry.toLocaleString():"Not set"}</strong></div><div className="account-line"><span>Terminal access</span><strong>{canUseTerminal?"Enabled":"Locked"}</strong></div>{canUseTerminal&&<button className="primary" onClick={()=>setPage("terminal")}>Open terminal</button>}{!canUseTerminal&&<p className="muted">Your administrator must approve your account and set an access duration.</p>}</div>}</main>}
    {page==="admin"&&<main className="page"><div className="section-heading"><div><div className="eyebrow">ADMIN ONLY</div><h1>User access control</h1><p className="muted">Approve accounts and set their access duration.</p></div><button className="secondary" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={16}/> Refresh</button></div>{!isAdmin?<div className="notice warn">Admin access is available only to the email configured as VITE_ADMIN_EMAIL.</div>:<div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Expiry</th><th>Approve duration</th><th>Actions</th></tr></thead><tbody>{users.map(u=><AdminRow key={u.id} user={u} busy={adminBusy} onUpdate={updateUser}/>)}{users.length===0&&<tr><td colSpan="5">No profiles found yet.</td></tr>}</tbody></table></div></div>}</main>}
    {page==="terminal"&&canUseTerminal&&<Terminal {...{selectedTool,setSelectedTool,symbol,setSymbol,interval,setInterval,market,marketErr,refresh,openTool}}/>}
    <footer><span>© {new Date().getFullYear()} ONLINE PRO TRADER</span><span>Public market data · Educational analytics · No order execution</span></footer>
  </Shell>;
}
function Shell({children}){return <div className="app-shell">{children}</div>}
function Header({session,setPage,setMenuOpen,menuOpen,signOut,isAdmin}) {
 return <header className="topbar"><button className="brand" onClick={()=>setPage("home")}><span className="brand-mark">OP</span><span>ONLINE PRO <b>TRADER</b></span></button><nav><button onClick={()=>setPage("home")}>Home</button><button onClick={()=>setPage("terminal")}>Terminal</button>{isAdmin&&<button onClick={()=>setPage("admin")}>Admin</button>}<button onClick={()=>setPage("account")}>Account</button></nav><div className="top-actions">{session?<><span className="user-chip">{session.user.email}</span><button className="secondary small" onClick={signOut}><LogOut size={15}/> Sign out</button></>:<button className="primary small" onClick={()=>setPage("auth")}>Sign in</button>}<button className="menu-button" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Open menu">{menuOpen?<X/>:<Menu/>}</button></div></header>
}
function Home({session,setPage,openTool,market,marketErr}) {
 return <><main className="page home-page"><section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> MARKET INTELLIGENCE TERMINAL</div><h1>See the market.<br/><span>Read the flow.</span></h1><p>A professional crypto market workspace for price action, liquidity context, volume analysis and disciplined risk planning.</p><div className="hero-actions"><button className="primary" onClick={()=>setPage(session?"terminal":"auth")}>{session?"Open terminal":"Create account"} <ArrowUpRight size={17}/></button><button className="secondary" onClick={()=>openTool("risk")}>Explore risk tools</button></div><div className="hero-note"><ShieldCheck size={16}/> New accounts require administrator approval</div></div><div className="hero-card"><div className="card-top"><span><span className="live-dot"/> LIVE MARKET</span><span className="pill">PUBLIC FEED</span></div><div className="ticker-name"><span className="coin-icon">₿</span><div><b>Bitcoin / USDT</b><small>BTCUSDT · Binance</small></div></div><div className="hero-price">{market.price?money(market.price):"Connecting…"}</div><div className={(market.change||0)>=0?"positive":"negative"}>{market.change!=null?`${market.change>=0?"+":""}${fmt(market.change)}%  / 24h`:"Waiting for market data"}</div><div className="mini-stats"><div><small>24H HIGH</small><b>{market.high?money(market.high):"—"}</b></div><div><small>24H LOW</small><b>{market.low?money(market.low):"—"}</b></div><div><small>QUOTE VOLUME</small><b>{market.volume?money(market.volume):"—"}</b></div></div>{marketErr&&<p className="muted tiny">{marketErr}</p>}<div className="hero-chart-art"><div className="chart-line"/></div></div></section>
 <section className="stats-strip"><div><span className="stat-icon"><Activity/></span><div><b>Live public data</b><small>Market snapshots refreshed automatically</small></div></div><div><span className="stat-icon"><LockKeyhole/></span><div><b>Approval gated</b><small>Private terminal access control</small></div></div><div><span className="stat-icon"><Clock3/></span><div><b>Timed access</b><small>Admin-managed expiry dates</small></div></div></section>
 <section className="tools-section"><div className="section-heading"><div><div className="eyebrow">THE WORKSPACE</div><h2>Ten professional views.</h2><p className="muted">One terminal. A clearer picture of market structure.</p></div><button className="secondary" onClick={()=>setPage(session?"terminal":"auth")}>Open terminal <ArrowUpRight size={16}/></button></div><div className="tool-grid">{toolsList.map(t=><button className="tool-card" key={t.id} onClick={()=>openTool(t.id)}><span className="tool-icon"><t.icon size={22}/></span><span className="tool-tag">{t.tag}</span><h3>{t.name}</h3><p>{t.desc}</p><span className="tool-link">Open view <ArrowUpRight size={15}/></span></button>)}</div></section><section className="bottom-cta"><div><div className="eyebrow">CONTROLLED ACCESS</div><h2>Your terminal. Your rules.</h2><p>Every account is reviewed by the administrator before access is enabled.</p></div><button className="primary" onClick={()=>setPage(session?"account":"auth")}>{session?"View account":"Get started"} <ArrowUpRight size={16}/></button></section></main></>;
}
function AdminRow({user,busy,onUpdate}) {
 const [days,setDays]=useState("30");
 return <tr><td><strong>{user.full_name||"Trader"}</strong><small>{user.email||user.id}</small></td><td><span className={`status ${user.approved?"approved":"pending"}`}>{user.approved?"Approved":"Pending"}</span></td><td>{user.expires_at?new Date(user.expires_at).toLocaleDateString():"—"}</td><td><select value={days} onChange={e=>setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></td><td><div className="row-actions"><button disabled={busy} className="primary tiny-btn" onClick={()=>onUpdate(user.id,true,days)}><Check size={14}/> Approve</button><button disabled={busy} className="danger tiny-btn" onClick={()=>onUpdate(user.id,false,0)}>Revoke</button></div></td></tr>
}
function Terminal({selectedTool,setSelectedTool,symbol,setSymbol,interval,setInterval,market,marketErr,refresh,openTool}) {
 const current=toolsList.find(t=>t.id===selectedTool)||toolsList[8];
 const [subTab,setSubTab]=useState("overview");
 return <main className="terminal-page"><aside className="terminal-sidebar"><div className="sidebar-label">WORKSPACE</div><div className="market-select"><span className="coin-icon">₿</span><select value={symbol} onChange={e=>setSymbol(e.target.value)}><option value="BTCUSDT">BTC / USDT</option><option value="ETHUSDT">ETH / USDT</option><option value="BNBUSDT">BNB / USDT</option><option value="SOLUSDT">SOL / USDT</option><option value="XRPUSDT">XRP / USDT</option></select><ChevronDown size={14}/></div><div className="sidebar-label">MARKET TOOLS</div>{toolsList.map(t=><button key={t.id} className={`side-tool ${selectedTool===t.id?"active":""}`} onClick={()=>setSelectedTool(t.id)}><t.icon size={17}/><span>{t.name}</span></button>)}<div className="sidebar-foot"><ShieldCheck size={16}/><span>Read-only public data</span></div></aside>
 <section className="terminal-main"><div className="terminal-heading"><div><div className="eyebrow">ONLINE PRO TRADER / TERMINAL</div><h1>{current.name}</h1><p>{current.desc}</p></div><span className="pill"><span className="live-dot"/> LIVE DATA</span></div>
 <div className="market-overview"><div className="market-price"><small>{symbol.replace("USDT","")} / USDT</small><strong>{market.price?money(market.price):"Loading…"}</strong><span className={(market.change||0)>=0?"positive":"negative"}>{market.change!=null?`${market.change>=0?"+":""}${fmt(market.change)}% 24h`:"—"}</span></div><div><small>24H HIGH</small><b>{market.high?money(market.high):"—"}</b></div><div><small>24H LOW</small><b>{market.low?money(market.low):"—"}</b></div><div><small>QUOTE VOLUME</small><b>{market.volume?money(market.volume):"—"}</b></div><div><small>FUNDING RATE</small><b>{market.funding!=null?fmt(market.funding,4)+"%":"N/A"}</b></div><div><small>OPEN INTEREST</small><b>{market.oi?fmt(market.oi,2):"N/A"}</b></div></div>
 {selectedTool==="chart"?<ChartPanel {...{symbol,interval,setInterval,refresh}}/>:selectedTool==="risk"?<RiskPanel/>:<ToolPanel tool={current} symbol={symbol} market={market} refresh={refresh}/>}
 {marketErr&&<div className="notice warn">{marketErr}. Check connection or try again later.</div>}
 <div className="terminal-disclaimer"><CircleHelp size={16}/><span>Market tools are informational only. Data coverage varies by feature. No trading orders are placed and no signal guarantees a result.</span></div>
 </section></main>
}
function ChartPanel({symbol,interval,setInterval,refresh}) {
 const chartRef=useRef(null), hostRef=useRef(null);
 const [loading,setLoading]=useState(true), [err,setErr]=useState("");
 useEffect(()=>{
  if(!hostRef.current)return;
  const chart=createChart(hostRef.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:"#0d0f12"},textColor:"#9ba2ad",fontFamily:"Inter, system-ui, sans-serif"},grid:{vertLines:{color:"#1c2026"},horzLines:{color:"#1c2026"}},rightPriceScale:{borderColor:"#272b32"},timeScale:{borderColor:"#272b32",timeVisible:true,secondsVisible:false},crosshair:{vertLine:{color:"#656d7b",labelBackgroundColor:"#292f39"},horzLine:{color:"#656d7b",labelBackgroundColor:"#292f39"}}});
  const candles=chart.addSeries(CandlestickSeries,{upColor:"#27c58b",downColor:"#f05e69",borderUpColor:"#27c58b",borderDownColor:"#f05e69",wickUpColor:"#27c58b",wickDownColor:"#f05e69"});
  const volume=chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"volume"});
  chart.priceScale("volume").applyOptions({scaleMargins:{top:.82,bottom:0},visible:false});
  chartRef.current={chart,candles,volume};
  const resize=new ResizeObserver(()=>chart.applyOptions({width:hostRef.current?.clientWidth||800,height:390}));
  resize.observe(hostRef.current);
  return ()=>{resize.disconnect();chart.remove();chartRef.current=null};
 },[]);
 useEffect(()=>{
  let cancelled=false;
  async function load(){setLoading(true);setErr("");try{const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`);if(!r.ok)throw Error("Could not load candles");const data=await r.json();if(cancelled||!chartRef.current)return;const cs=data.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));const vs=data.map(k=>({time:Math.floor(k[0]/1000),value:+k[5],color:+k[4]>=+k[1]?"rgba(39,197,139,.45)":"rgba(240,94,105,.45)"}));chartRef.current.candles.setData(cs);chartRef.current.volume.setData(vs);chartRef.current.chart.timeScale().fitContent();}catch(e){if(!cancelled)setErr(e.message)}finally{if(!cancelled)setLoading(false)}}
  load();const id=setInterval(load,30000);return()=>{cancelled=true;clearInterval(id)};
 },[symbol,interval,refresh]);
 return <div className="panel chart-panel"><div className="panel-toolbar"><div className="toolbar-label"><CandlestickChart size={17}/> Price action <span className="pill">SPOT</span></div><div className="intervals">{["1m","5m","15m","1h","4h","1d"].map(x=><button key={x} className={interval===x?"selected":""} onClick={()=>setInterval(x)}>{x}</button>)}</div></div><div ref={hostRef} className="chart-host"/>{loading&&<div className="chart-loading">Loading market candles…</div>}{err&&<div className="notice warn">{err}</div>}<div className="chart-caption">Source: Binance public spot market API · Candlesticks and volume · Refreshes every 30 seconds</div></div>
}
function ToolPanel({tool,symbol,market,refresh}) {
 const [trades,setTrades]=useState([]),[book,setBook]=useState(null),[candles,setCandles]=useState([]),[err,setErr]=useState("");
 useEffect(()=>{let alive=true;async function load(){try{const [t,b,k]=await Promise.all([fetch(`https://api.binance.com/api/v3/trades?symbol=${symbol}&limit=100`).then(r=>r.json()),fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=20`).then(r=>r.json()),fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=100`).then(r=>r.json())]);if(alive){setTrades(t);setBook(b);setCandles(k);setErr("")}}catch(e){if(alive)setErr("Public data feed unavailable.")}}load();const id=setInterval(load,10000);return()=>{alive=false;clearInterval(id)}},[symbol,refresh]);
 const buyVol=trades.filter(t=>!t.isBuyerMaker).reduce((s,t)=>s+Number(t.qty),0), sellVol=trades.filter(t=>t.isBuyerMaker).reduce((s,t)=>s+Number(t.qty),0);
 const bid=book?.bids?.[0]?.[0],ask=book?.asks?.[0]?.[0],spread=bid&&ask?(ask-bid)/((+ask + +bid)/2)*100:null;
 const priceBuckets=useMemo(()=>{const map={};candles.forEach(k=>{const p=Math.round(((+k[2]+ +k[3]+ +k[4])/3)/10)*10;map[p]=(map[p]||0)+ +k[5]});return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,12)},[candles]);
 const bigTrades=trades.filter(t=>+t.quoteQty>Math.max(10000, (market.price||0)*0.03)).slice(-12).reverse();
 return <div className="tool-content"><div className="panel tool-detail"><div className="tool-detail-head"><span className="tool-icon"><tool.icon size={22}/></span><span className="tool-tag">{tool.tag}</span></div><h2>{tool.name}</h2><p>{tool.detail}</p>{err&&<div className="notice warn">{err}</div>}
 {tool.id==="heatmap"&&<><h3>Live order-book depth snapshot</h3><div className="depth-grid"><div><h4>BIDS / BUYERS</h4>{(book?.bids||[]).slice(0,10).map((x,i)=><div className="depth-row bid" key={i}><span>{fmt(+x[0],1)}</span><span>{fmt(+x[1],4)}</span><i style={{width:`${Math.min(100,+x[1]/Math.max(0.0001,...(book?.bids||[]).slice(0,10).map(y=>+y[1]))*100)}%`}}/></div>)}</div><div><h4>ASKS / SELLERS</h4>{(book?.asks||[]).slice(0,10).map((x,i)=><div className="depth-row ask" key={i}><span>{fmt(+x[0],1)}</span><span>{fmt(+x[1],4)}</span><i style={{width:`${Math.min(100,+x[1]/Math.max(0.0001,...(book?.asks||[]).slice(0,10).map(y=>+y[1]))*100)}%`}}/></div>)}</div></div><p className="chart-caption">This is a current depth snapshot, not a historical heatmap.</p></>}
 {tool.id==="footprint"&&<><div className="two-metrics"><Metric label="Estimated taker buys" value={fmt(buyVol,4)+" "+symbol.replace("USDT","")}/><Metric label="Estimated taker sells" value={fmt(sellVol,4)+" "+symbol.replace("USDT","")}/></div><div className="flow-bar"><span style={{width:`${100*buyVol/Math.max(.0000001,buyVol+sellVol)}%`}}/></div><p className="chart-caption">Based on the latest 100 public trades. A full footprint requires more granular aggregation and historical trade data.</p></>}
 {tool.id==="whales"&&<><h3>Large public prints</h3><div className="table-wrap"><table><thead><tr><th>Time</th><th>Side estimate</th><th>Price</th><th>Quote value</th></tr></thead><tbody>{bigTrades.map(t=><tr key={t.id}><td>{new Date(t.time).toLocaleTimeString()}</td><td className={t.isBuyerMaker?"negative":"positive"}>{t.isBuyerMaker?"Sell taker":"Buy taker"}</td><td>{fmt(+t.price,2)}</td><td>{money(+t.quoteQty)}</td></tr>)}{!bigTrades.length&&<tr><td colSpan="4">No unusually large prints in the current sample.</td></tr>}</tbody></table></div></>}
 {tool.id==="profile"&&<><h3>Recent candle volume by approximate price bucket</h3><div className="profile-list">{priceBuckets.map(([p,v])=><div className="profile-row" key={p}><b>{fmt(+p,0)}</b><div><i style={{width:`${v/Math.max(1,...priceBuckets.map(x=>x[1]))*100}%`}}/></div><span>{fmt(v,2)}</span></div>)}</div><p className="chart-caption">Estimated from the last 100 five-minute candles. POC = highest-volume bucket in this sample.</p>{priceBuckets[0]&&<div className="two-metrics"><Metric label="Estimated POC" value={money(+priceBuckets[0][0])}/><Metric label="Sample candles" value="100 × 5m"/></div>}</>}
 {tool.id==="gamma"&&<div className="unavailable"><LockKeyhole size={25}/><h3>Options data source required</h3><p>Live Gamma Exposure, zero-gamma and max-pain need options-chain open interest and strike data. This starter intentionally does not invent values.</p><span className="status pending">Not connected</span></div>}
 {tool.id==="futures"&&<><div className="two-metrics"><Metric label="Funding rate" value={market.funding!=null?fmt(market.funding,5)+"%":"Unavailable"}/><Metric label="Open interest" value={market.oi?fmt(market.oi,2)+" contracts":"Unavailable"}/></div><p className="chart-caption">Public futures metrics for BTC/ETH only where supported. A multi-venue liquidation map requires a separate feed.</p><div className="unavailable"><Activity size={22}/><h3>Liquidation map not connected</h3><p>No cross-exchange liquidation data provider is configured.</p></div></>}
 {tool.id==="tape"&&<><div className="two-metrics"><Metric label="Best bid" value={bid?fmt(+bid,2):"—"}/><Metric label="Best ask" value={ask?fmt(+ask,2):"—"}/><Metric label="Spread" value={spread!=null?fmt(spread,4)+"%":"—"}/></div><h3>Recent time & sales</h3><div className="table-wrap"><table><thead><tr><th>Time</th><th>Side</th><th>Price</th><th>Quantity</th></tr></thead><tbody>{trades.slice(-20).reverse().map(t=><tr key={t.id}><td>{new Date(t.time).toLocaleTimeString()}</td><td className={t.isBuyerMaker?"negative":"positive"}>{t.isBuyerMaker?"Sell":"Buy"}</td><td>{fmt(+t.price,2)}</td><td>{fmt(+t.qty,5)}</td></tr>)}</tbody></table></div><p className="chart-caption">Public trades and Level 2 snapshots only; full Level 3 order IDs are not supplied by this feed.</p></>}
 {tool.id==="decision"&&<DecisionPanel {...{market,buyVol,sellVol,candles}}/>}
 </div><div className="panel side-info"><h3>Data status</h3><div className="status-line"><span className="live-dot"/> Binance public API</div><div className="info-row"><span>Selected market</span><b>{symbol}</b></div><div className="info-row"><span>Last price</span><b>{market.price?money(market.price):"—"}</b></div><div className="info-row"><span>Refresh interval</span><b>10 seconds</b></div><div className="info-row"><span>Exchange account</span><b>Not connected</b></div><div className="notice">No API secret is needed for public market data. Never paste exchange secret keys into this demo.</div></div></div>
}
function DecisionPanel({market,buyVol,sellVol,candles}) {
 const closes=candles.map(k=>+k[4]), last=closes.at(-1), avg=closes.length?closes.slice(-20).reduce((a,b)=>a+b,0)/Math.min(20,closes.length):null;
 let bias="Mixed / wait", cls="yellow";
 if(last&&avg){if(last>avg*1.002&&buyVol>sellVol){bias="Bullish conditions";cls="green"}else if(last<avg*.998&&sellVol>buyVol){bias="Bearish conditions";cls="red"}}
 const change=market.change||0;
 return <><div className={`decision-banner ${cls}`}><Sparkles size={24}/><div><small>RULE-BASED SNAPSHOT</small><h2>{bias}</h2><p>Not a probability or a guarantee. Confirm with your own plan.</p></div></div><div className="two-metrics"><Metric label="24h price change" value={`${change>=0?"+":""}${fmt(change)}%`}/><Metric label="Recent trade flow" value={buyVol>sellVol?"Buy volume higher":sellVol>buyVol?"Sell volume higher":"Balanced / unavailable"}/><Metric label="Last close vs 20-candle average" value={last&&avg?(last>avg?"Above average":"Below average"):"Insufficient data"}/><Metric label="Suggested action" value="Wait for confirmation"/></div><p className="chart-caption">This simple educational heuristic uses recent candles, 24h change and the latest public trades. It does not use a trained predictive model or guarantee accuracy.</p></>
}
function Metric({label,value}){return <div className="metric"><small>{label}</small><strong>{value}</strong></div>}
function RiskPanel() {
 const [balance,setBalance]=useState("100"),[risk,setRisk]=useState("1"),[entry,setEntry]=useState("110000"),[stop,setStop]=useState("108000"),[target,setTarget]=useState("114000");
 const result=useMemo(()=>{const b=+balance,r=+risk/100,e=+entry,s=+stop,t=+target;if(!(b>0&&r>0&&e>0&&s>0&&e!==s))return null;const riskCash=b*r,unitRisk=Math.abs(e-s),qty=riskCash/unitRisk,reward=Math.abs(t-e),rr=reward/unitRisk;return {riskCash,qty,notional:qty*e,rewardCash:qty*reward,rr}},[balance,risk,entry,stop,target]);
 return <div className="risk-layout"><div className="panel risk-form"><div className="panel-title"><ShieldCheck/><div><h2>Position size calculator</h2><p>Plan the risk before entering a trade.</p></div></div><div className="form-grid"><label>Account balance (USDT)<input type="number" value={balance} onChange={e=>setBalance(e.target.value)}/></label><label>Risk per trade (%)<input type="number" min="0.1" max="100" step="0.1" value={risk} onChange={e=>setRisk(e.target.value)}/></label><label>Entry price<input type="number" value={entry} onChange={e=>setEntry(e.target.value)}/></label><label>Stop-loss price<input type="number" value={stop} onChange={e=>setStop(e.target.value)}/></label><label>Take-profit price<input type="number" value={target} onChange={e=>setTarget(e.target.value)}/></label></div></div><div className="panel risk-results"><div className="eyebrow">CALCULATION</div><h2>Trade plan</h2>{result?<><Metric label="Maximum planned loss" value={money(result.riskCash)}/><Metric label="Position size (base units)" value={fmt(result.qty,6)}/><Metric label="Position notional" value={money(result.notional)}/><Metric label="Potential reward at target" value={money(result.rewardCash)}/><Metric label="Reward / risk" value={`${fmt(result.rr,2)} : 1`}/></>:<p>Enter valid positive prices and balance.</p>}<p className="chart-caption">Excludes fees, slippage, funding and liquidation effects. Leverage can increase losses; this calculator does not place orders.</p></div></div>
}
createRoot(document.getElementById("root")).render(<App/>);
