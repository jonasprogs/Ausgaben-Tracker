// trades.js – Monats-Trades mit kumulativem P&L-Chart
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const e = React.createElement;
  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);

  // Storage: versuche bekannte Keys zu lesen, schreibe in den ersten vorhandenen – sonst default
  const FALLBACK_KEY = "trades-data-v1";
  const POSSIBLE_KEYS = ["trades-data-v1", "trades-tracker-v1", "trades-tracker-react-v1"];
  function pickKey() {
    for (const k of POSSIBLE_KEYS) { if (localStorage.getItem(k)) return k; }
    return FALLBACK_KEY;
  }
  const STORAGE_KEY = pickKey();

  function load() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : { trades: [] }; } catch { return { trades: [] }; } }
  function save(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function fmt(n) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n || 0)); }

  function App() {
    const today = dayjs().tz("Europe/Berlin");
    const [state, setState] = useState(() => load());
    useEffect(() => save(state), [state]);

    const [month, setMonth] = useState(today.format("YYYY-MM"));
    const monthDays = dayjs(month + "-01").daysInMonth();

    // Eingabe
    const [name, setName] = useState("");
    const [dateStr, setDateStr] = useState(today.format("YYYY-MM-DD"));
    const [amount, setAmount] = useState(""); // Gewinn (positiv) / Verlust (negativ)

    function addTrade() {
      const val = Number(String(amount).replace(",", "."));
      if (!isFinite(val)) return;
      const dOk = dayjs(dateStr, "YYYY-MM-DD", true).isValid() ? dateStr : today.format("YYYY-MM-DD");
      setState(s => ({ ...s, trades: [{ id: uid(), name: name.trim() || "Trade", dateStr: dOk, pnl: val }, ...s.trades] }));
      setName(""); setAmount(""); setDateStr(today.format("YYYY-MM-DD"));
    }
    function delTrade(id) { setState(s => ({ ...s, trades: s.trades.filter(t => t.id !== id) })); }
    function updateTrade(id, patch) { setState(s => ({ ...s, trades: s.trades.map(t => t.id === id ? { ...t, ...patch } : t) })); }

    // Filter Monat
    const tradesMonth = useMemo(() => {
      return state.trades
        .filter(t => dayjs(t.dateStr, "YYYY-MM-DD").format("YYYY-MM") === month)
        .sort((a,b) => dayjs(a.dateStr).valueOf() - dayjs(b.dateStr).valueOf());
    }, [state.trades, month]);

    // Kumulativer P&L je Tag
    const series = useMemo(() => {
      const perDay = Array(monthDays).fill(0);
      for (const t of tradesMonth) {
        const d = dayjs(t.dateStr, "YYYY-MM-DD", true);
        if (!d.isValid()) continue;
        const idx = d.date() - 1;
        perDay[idx] += Number(t.pnl || 0);
      }
      const cum = [];
      let acc = 0;
      for (let i=0;i<monthDays;i++){ acc += perDay[i]; cum.push(acc); }
      return { perDay, cum };
    }, [tradesMonth, monthDays]);

    // Chart
    const ref = useRef(null), chartRef = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels: Array.from({length: monthDays}, (_,i)=> String(i+1)),
          datasets: [
            { label: "Kumulativ", data: series.cum, tension: .25, borderWidth: 2, pointRadius: 0 },
            { label: "Tagessumme", data: series.perDay, tension: .25, borderWidth: 1, pointRadius: 0 }
          ]
        },
        options: {
          plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue("--text").trim() } } },
          scales: {
            x: { grid: { color: getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() } },
            y: { grid: { color: getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() } }
          }
        }
      });
      return () => chartRef.current?.destroy();
    }, [series, monthDays]);

    // UI
    return e("div", { className:"w-container" },
      e("div", { className:"w-card" },
        e("div", { className:"w-row" },
          e("div", null,
            e("label", { className:"w-subtle" }, "Monat"),
            e("input", { type:"month", className:"w-input", value:month, onChange:ev=>setMonth(ev.target.value) })
          ),
          e("div", { className:"w-spacer" }),
          e("div", { className:"t-legend" },
            e("span", { className:"dot green" }), "Gewinn ",
            e("span", { className:"dot red", style:{marginLeft:8} }), "Verlust"
          )
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
        e("h3", null, "Verlauf"),
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
              tradesMonth.map(t => e("tr", { key:t.id },
                e("td", null,
                  e("input", { className:"w-input", type:"date", value:t.dateStr,
                    onChange:ev=>updateTrade(t.id,{ dateStr: ev.target.value })
                  })
                ),
                e("td", null,
                  e("input", { className:"w-input", value:t.name||"", onChange:ev=>updateTrade(t.id,{ name: ev.target.value }) })
                ),
                e("td", { className:"w-num" },
                  e("input", { className:"w-input", type:"number", step:"0.01", value:t.pnl,
                    style:{ color: Number(t.pnl)>=0 ? "var(--green)" : "var(--red)" },
                    onChange:ev=>updateTrade(t.id,{ pnl: Number(ev.target.value||0) })
                  })
                ),
                e("td", null, e("button", { className:"w-button w-btn-danger", onClick:()=>delTrade(t.id) }, "Löschen"))
              ))
            )
          )
        )
      )
    );
  }

  document.addEventListener("DOMContentLoaded", function(){
    const mount = document.getElementById("trades-app");
    if (!mount) return;
    const root = ReactDOM.createRoot ? ReactDOM.createRoot(mount) : null;
    if (root) root.render(React.createElement(App)); else ReactDOM.render(React.createElement(App), mount);
  });
})();