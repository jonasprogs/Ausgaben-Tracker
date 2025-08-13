// trades.js – Monats-Trades mit KUMULATIVEM P&L + Monats-Summe
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const e = React.createElement;

  // ---------- Storage ----------
  const DEFAULT_KEY = "trades-data-v1";
  const KNOWN_KEYS = ["trades-data-v1", "trades-tracker-v1", "trades-tracker-react-v1"];
  function findExistingTradesKey() {
    for (const k of KNOWN_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj && Array.isArray(obj.trades)) return k;
      } catch (_) {}
    }
    // Scan fallback
    let best = null, bestLen = -1;
    for (let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      try {
        const obj = JSON.parse(localStorage.getItem(key));
        if (obj && Array.isArray(obj.trades) && obj.trades.length>bestLen){ best=key; bestLen=obj.trades.length; }
      } catch(_){}
    }
    return best || DEFAULT_KEY;
  }
  const STORAGE_KEY = findExistingTradesKey();
  function load(){ try{ const raw=localStorage.getItem(STORAGE_KEY); const obj=raw?JSON.parse(raw):null; return obj&&Array.isArray(obj.trades)?obj:{trades:[]}; }catch{ return {trades:[]}; } }
  function save(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  // ---------- Utils ----------
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function nowMonthKey(){ return new Date().toISOString().slice(0,7); }
  function toYM(s){ return (s||"").slice(0,7); }
  function daysInMonth(ym){ const [y,m]=ym.split("-").map(Number); if(!y||!m) return 31; return new Date(y,m,0).getDate(); }
  function isValidDate(str){ return /^\d{4}-\d{2}-\d{2}$/.test(str); }
  function fmtEUR(n){ return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }
  function ensureMount(){
    let m=document.getElementById("trades-app");
    if(!m){ const host=document.getElementById("page-trades")||document.body; m=document.createElement("div"); m.id="trades-app"; host.appendChild(m); }
    return m;
  }

  function App(){
    const [state,setState]=useState(()=>load());
    useEffect(()=>save(state),[state]);

    const [month,setMonth]=useState(nowMonthKey());
    const monthDays=daysInMonth(month);

    // Eingabe
    const [name,setName]=useState("");
    const [dateStr,setDateStr]=useState(todayISO());
    const [amount,setAmount]=useState(""); // +/- EUR

    function addTrade(){
      const val=Number(String(amount).replace(",","."));
      if(!isFinite(val)) return;
      const ds=isValidDate(dateStr)?dateStr:todayISO();
      setState(s=>({...s,trades:[{id:Math.random().toString(36).slice(2,9),name:(name||"Trade").trim(),dateStr:ds,pnl:val},...s.trades]}));
      setName(""); setAmount(""); setDateStr(todayISO());
    }
    function delTrade(id){ setState(s=>({...s,trades:s.trades.filter(t=>t.id!==id)})); }
    function updateTrade(id,patch){ setState(s=>({...s,trades:s.trades.map(t=>t.id===id?{...t,...patch}:t)})); }

    // Filter + Sort
    const tradesAsc = useMemo(()=> state.trades
      .filter(t=>toYM(t.dateStr)===month)
      .sort((a,b)=>a.dateStr.localeCompare(b.dateStr))
    ,[state.trades,month]);
    const tradesDesc = useMemo(()=> tradesAsc.slice().sort((a,b)=>b.dateStr.localeCompare(a.dateStr)), [tradesAsc]);

    // Monats-Summe & Serie
    const monthSum = useMemo(()=> tradesAsc.reduce((a,b)=>a+Number(b.pnl||0),0),[tradesAsc]);
    const series = useMemo(()=>{
      const perDay=Array(monthDays).fill(0);
      for(const t of tradesAsc){
        if(!isValidDate(t.dateStr)) continue;
        const i=parseInt(t.dateStr.slice(8,10),10)-1;
        if(i>=0 && i<monthDays) perDay[i]+=Number(t.pnl||0);
      }
      const cum=[]; let acc=0;
      for(let i=0;i<monthDays;i++){ acc+=perDay[i]; cum.push(acc); }
      return { perDay, cum };
    },[tradesAsc,monthDays]);

    // Chart
    const ref=useRef(null), chartRef=useRef(null);
    useEffect(()=>{
      if(!ref.current || !window.Chart) return;
      chartRef.current?.destroy();
      const axis=getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim()||"#e5e7eb";
      const text=getComputedStyle(document.body).getPropertyValue("--text").trim()||"#111827";
      chartRef.current=new Chart(ref.current,{
        type:"line",
        data:{ labels:Array.from({length:monthDays},(_,i)=>String(i+1)),
          datasets:[ { label:"Kumulativ", data:series.cum, tension:.25, borderWidth:2, pointRadius:0 } ] },
        options:{ plugins:{ legend:{ labels:{ color:text } } }, scales:{ x:{ grid:{color:axis}, ticks:{color:text} }, y:{ grid:{color:axis}, ticks:{color:text} } } }
      });
      return()=>chartRef.current?.destroy();
    },[series,monthDays]);

    return e("div",{className:"w-container"},

      e("div",{className:"w-card"},
        e("div",{className:"w-row"},
          e("div",null,
            e("label",{className:"w-subtle"},"Monat"),
            e("input",{type:"month",className:"w-input",value:month,onChange:ev=>setMonth(ev.target.value)})
          ),
          e("div",{className:"w-spacer"}),
          e("div",{className:"w-pill",style:{fontWeight:600}},
            "Monats-P&L: ", e("span",{style:{marginLeft:6, color: monthSum>=0?"var(--green,#16a34a)":"var(--red,#dc2626)" }}, fmtEUR(monthSum))
          )
        )
      ),

      e("div",{className:"w-card"},
        e("h3",null,"Neuer Trade"),
        e("div",{className:"w-row",style:{gap:8,flexWrap:"wrap"}},
          e("input",{className:"w-input",placeholder:"Name / Ticker",value:name,onChange:ev=>setName(ev.target.value)}),
          e("input",{className:"w-input",type:"date",value:dateStr,onChange:ev=>setDateStr(ev.target.value)}),
          e("input",{className:"w-input",type:"number",step:"0.01",placeholder:"P&L (€ +/–)",value:amount,onChange:ev=>setAmount(ev.target.value)}),
          e("button",{className:"w-button w-btn-primary",onClick:addTrade},"+ Hinzufügen")
        )
      ),

      e("div",{className:"w-card"},
        e("h3",null,"Verlauf (kumulativ)"),
        e("div",null,e("canvas",{className:"t-chart",ref:ref}))
      ),

      e("div",{className:"w-card"},
        e("h3",null,"Trades (dieser Monat)"),
        e("div",{style:{overflowX:"auto"}},
          e("table",{className:"w-table"},
            e("thead",null,e("tr",null,
              e("th",null,"Datum"),
              e("th",null,"Name"),
              e("th",{className:"w-num"},"P&L (€)"),
              e("th",null,"Aktion")
            )),
            e("tbody",null,
              tradesDesc.map(t=>e("tr",{key:t.id},
                e("td",null,
                  e("input",{className:"w-input",type:"date",value:t.dateStr,onChange:ev=>updateTrade(t.id,{dateStr:ev.target.value})})
                ),
                e("td",null,
                  e("input",{className:"w-input",value:t.name||"",onChange:ev=>updateTrade(t.id,{name:ev.target.value})})
                ),
                e("td",{className:"w-num"},
                  e("input",{className:"w-input",type:"number",step:"0.01",value:t.pnl,
                    style:{color:Number(t.pnl)>=0?"var(--green,#16a34a)":"var(--red,#dc2626)"},
                    onChange:ev=>updateTrade(t.id,{pnl:Number(ev.target.value||0)})})
                ),
                e("td",null,
                  e("button",{className:"w-button w-btn-danger",onClick:()=>delTrade(t.id)},"Löschen")
                )
              ))
            )
          )
        )
      )
    );
  }

  document.addEventListener("DOMContentLoaded", function(){
    if(window.__tradesMounted) return;
    window.__tradesMounted=true;
    const mount=ensureMount();
    if(ReactDOM.createRoot) ReactDOM.createRoot(mount).render(e(App));
    else ReactDOM.render(e(App), mount);
  });
})();