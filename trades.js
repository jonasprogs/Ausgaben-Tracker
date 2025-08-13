// trades.js – Monats-Trades mit KUMULATIVEM P&L-Chart (ohne dayjs-Pflicht)
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const e = React.createElement;

  // ---------- Storage: vorhandenen Key finden, sonst Default ----------
  const DEFAULT_KEY = "trades-data-v1";
  const KNOWN_KEYS = ["trades-data-v1", "trades-tracker-v1", "trades-tracker-react-v1"];
  function findExistingTradesKey() {
    // 1) bekannte Keys checken
    for (const k of KNOWN_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj && Array.isArray(obj.trades)) return k;
      } catch (_) {}
    }
    // 2) alle Keys scannen – nimm den mit den meisten Trades
    let best = null, bestLen = -1;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const obj = JSON.parse(localStorage.getItem(key));
        if (obj && Array.isArray(obj.trades) && obj.trades.length > bestLen) {
          best = key; bestLen = obj.trades.length;
        }
      } catch (_) {}
    }
    return best || DEFAULT_KEY;
  }
  const STORAGE_KEY = findExistingTradesKey();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && Array.isArray(obj.trades) ? obj : { trades: [] };
    } catch {
      return { trades: [] };
    }
  }
  function save(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  // ---------- Utils (ohne dayjs) ----------
  function todayISO() { return new Date().toISOString().slice(0, 10); }     // YYYY-MM-DD
  function nowMonthKey() { return new Date().toISOString().slice(0, 7); }   // YYYY-MM
  function toYM(dateStr) { return (dateStr || "").slice(0, 7); }            // YYYY-MM*
  function daysInMonth(ym) {
    const [y, m] = ym.split("-").map(Number); // m = 1..12
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();       // Trick: Tag 0 = letzter Tag des Vormonats
  }
  function isValidDate(str) { return /^\d{4}-\d{2}-\d{2}$/.test(str); }
  function fmtEUR(n) { return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }

  // ---------- Mount sicherstellen ----------
  function ensureMount() {
    let mount = document.getElementById("trades-app");
    if (!mount) {
      const host = document.getElementById("page-trades") || document.body;
      mount = document.createElement("div");
      mount.id = "trades-app";
      host.appendChild(mount);
    }
    return mount;
  }

  function App() {
    const [state, setState] = useState(() => load());
    useEffect(() => save(state), [state]);

    const [month, setMonth] = useState(nowMonthKey());
    const monthDays = daysInMonth(month);

    // Eingabe
    const [name, setName]   = useState("");
    const [dateStr, setDateStr] = useState(todayISO());
    const [amount, setAmount] = useState(""); // Gewinn (+) / Verlust (–)

    function addTrade() {
      const val = Number(String(amount).replace(",", "."));
      if (!isFinite(val)) return;
      const ds = isValidDate(dateStr) ? dateStr : todayISO();
      setState(s => ({
        ...s,
        trades: [{ id: Math.random().toString(36).slice(2,9), name: (name||"Trade").trim(), dateStr: ds, pnl: val }, ...s.trades]
      }));
      setName(""); setAmount(""); setDateStr(todayISO());
    }
    function delTrade(id) { setState(s => ({ ...s, trades: s.trades.filter(t => t.id !== id) })); }
    function updateTrade(id, patch) { setState(s => ({ ...s, trades: s.trades.map(t => t.id === id ? { ...t, ...patch } : t) })); }

    // Filter Monat
    const tradesMonthAsc = useMemo(() => {
      return state.trades
        .filter(t => toYM(t.dateStr) === month)
        .sort((a,b) => a.dateStr.localeCompare(b.dateStr)); // aufsteigend für Serie
    }, [state.trades, month]);

    // Serie: pro Tag + kumulativ
    const series = useMemo(() => {
      const perDay = Array(monthDays).fill(0);
      for (const t of tradesMonthAsc) {
        if (!isValidDate(t.dateStr)) continue;
        const idx = parseInt(t.dateStr.slice(8,10), 10) - 1; // 0-basiert
        if (idx>=0 && idx<monthDays) perDay[idx] += Number(t.pnl || 0);
      }
      const cum = [];
      let acc = 0;
      for (let i=0;i<monthDays;i++){ acc += perDay[i]; cum.push(acc); }
      return { perDay, cum };
    }, [tradesMonthAsc, monthDays]);

    // Chart
    const ref = useRef(null), chartRef = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      if (!window.Chart) {
        // Chart.js fehlt → sanfte Degradation
        ref.current.replaceWith(Object.assign(document.createElement("div"), {
          textContent: "Diagramm nicht verfügbar (Chart.js nicht geladen).",
          style: "color:#9ca3af;padding:8px 0;"
        }));
        return;
      }
      chartRef.current?.destroy();
      const axisColor = getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() || "#e5e7eb";
      const textColor = getComputedStyle(document.body).getPropertyValue("--text").trim() || "#111827";
      chartRef.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels: Array.from({ length: monthDays }, (_, i) => String(i + 1)),
          datasets: [
            { label: "Kumulativ", data: series.cum, tension: 0.25, borderWidth: 2, pointRadius: 0 }
          ]
        },
        options: {
          plugins: { legend: { labels: { color: textColor } } },
          scales: {
            x: { grid: { color: axisColor }, ticks: { color: textColor } },
            y: { grid: { color: axisColor }, ticks: { color: textColor } }
          }
        }
      });
      return () => chartRef.current?.destroy();
    }, [series, monthDays]);

    // Tabelle: neueste zuerst
    const tradesMonthDesc = useMemo(() => tradesMonthAsc.slice().sort((a,b)=> b.dateStr.localeCompare(a.dateStr)), [tradesMonthAsc]);

    // UI
    return e("div", { className:"w-container" },

      e("div", { className:"w-card" },
        e("div", { className:"w-row" },
          e("div", null,
            e("label", { className:"w-subtle" }, "Monat"),
            e("input", { type:"month", className:"w-input", value: month, onChange: ev => setMonth(ev.target.value) })
          ),
          e("div", { className:"w-spacer" })
        )
      ),

      e("div", { className:"w-card" },
        e("h3", null, "Neuer Trade"),
        e("div", { className:"w-row", style:{gap:8, flexWrap:"wrap"} },
          e("input", { className:"w-input", placeholder:"Name / Ticker", value:name, onChange:ev=>setName(ev.target.value) }),
          e("input", { className:"w-input", type:"date", value:dateStr, onChange:ev=>setDateStr(ev.target.value) }),
          e("input", { className:"w-input", type:"number", step:"0.01", placeholder:"P&L (€ +/–)", value:amount, onChange:ev=>setAmount(ev.target.value) }),
          e("button", { className:"w-button w-btn-primary", onClick:addTrade }, "+ Hinzufügen")
        )
      ),

      e("div", { className:"w-card" },
        e("h3", null, "Verlauf (kumulativ)"),
        e("div", null, e("canvas", { className:"t-chart", ref:ref }))
      ),

      e("div", { className:"w-card" },
        e("h3", null, "Trades (dieser Monat)"),
        e("div", { style:{overflowX:"auto"} },
          e("table", { className:"w-table" },
            e("thead", null, e("tr", null,
              e("th", null, "Datum"),
              e("th", null, "Name"),
              e("th", { className:"w-num" }, "P&L (€)"),
              e("th", null, "Aktion")
            )),
            e("tbody", null,
              tradesMonthDesc.map(t => e("tr", { key:t.id },
                e("td", null,
                  e("input", {
                    className:"w-input",
                    type:"date",
                    value:t.dateStr,
                    onChange:ev=>updateTrade(t.id,{ dateStr: ev.target.value })
                  })
                ),
                e("td", null,
                  e("input", {
                    className:"w-input",
                    value:t.name||"",
                    onChange:ev=>updateTrade(t.id,{ name: ev.target.value })
                  })
                ),
                e("td", { className:"w-num" },
                  e("input", {
                    className:"w-input",
                    type:"number",
                    step:"0.01",
                    value: t.pnl,
                    style:{ color: Number(t.pnl)>=0 ? "var(--green, #16a34a)" : "var(--red, #dc2626)" },
                    onChange:ev=>updateTrade(t.id,{ pnl: Number(ev.target.value||0) })
                  })
                ),
                e("td", null,
                  e("button", { className:"w-button w-btn-danger", onClick:()=>delTrade(t.id) }, "Löschen")
                )
              ))
            )
          )
        )
      )
    );
  }

  // ---------- Mount & Render ----------
  document.addEventListener("DOMContentLoaded", function(){
    if (window.__tradesMounted) return; // Doppel-Mount verhindern
    const mount = ensureMount();
    window.__tradesMounted = true;
    if (ReactDOM.createRoot) ReactDOM.createRoot(mount).render(e(App));
    else ReactDOM.render(e(App), mount);
  });
})();