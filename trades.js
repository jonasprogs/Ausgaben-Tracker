// trades.js – Monats-Trades mit KUMULATIVEM P&L-Chart
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const e = React.createElement;

  // dayjs-Plugins nur aktivieren, wenn vorhanden (verhindert Runtime-Fehler)
  if (window.dayjs_plugin_utc) dayjs.extend(window.dayjs_plugin_utc);
  if (window.dayjs_plugin_timezone) dayjs.extend(window.dayjs_plugin_timezone);

  // -------- Storage: vorhandenen Key smart finden, sonst Default --------
  const DEFAULT_KEY = "trades-data-v1";
  const KNOWN_KEYS = ["trades-data-v1", "trades-tracker-v1", "trades-tracker-react-v1"];

  function findExistingTradesKey() {
    // 1) bekannte Keys prüfen
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
  function save(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  function uid() { return Math.random().toString(36).slice(2, 9); }
  function fmt(n) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n || 0)); }
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function App() {
    const today = (window.dayjs_plugin_timezone ? dayjs().tz("Europe/Berlin") : dayjs());
    const [state, setState] = useState(() => load());
    useEffect(() => save(state), [state]);

    const [month, setMonth] = useState(today.format("YYYY-MM"));
    const monthDays = dayjs(month + "-01").daysInMonth();

    // -------- Eingabe --------
    const [name, setName] = useState("");
    const [dateStr, setDateStr] = useState(today.format("YYYY-MM-DD"));
    const [amount, setAmount] = useState(""); // P&L (+ Gewinn / – Verlust)

    function addTrade() {
      const val = Number(String(amount).replace(",", "."));
      if (!isFinite(val)) return;
      const ds = dayjs(dateStr, "YYYY-MM-DD", true).isValid() ? dateStr : today.format("YYYY-MM-DD");
      setState(s => ({
        ...s,
        trades: [{ id: uid(), name: (name || "Trade").trim(), dateStr: ds, pnl: val }, ...s.trades]
      }));
      setName(""); setAmount(""); setDateStr(today.format("YYYY-MM-DD"));
    }
    function delTrade(id) { setState(s => ({ ...s, trades: s.trades.filter(t => t.id !== id) })); }
    function updateTrade(id, patch) { setState(s => ({ ...s, trades: s.trades.map(t => t.id === id ? { ...t, ...patch } : t) })); }

    // -------- Filter & Aggregation --------
    const tradesMonth = useMemo(() => {
      return state.trades
        .filter(t => dayjs(t.dateStr, "YYYY-MM-DD").format("YYYY-MM") === month)
        .sort((a,b) => dayjs(a.dateStr, "YYYY-MM-DD").valueOf() - dayjs(b.dateStr, "YYYY-MM-DD").valueOf());
    }, [state.trades, month]);

    // Per-Tag-Summe UND kumulativ (kumulative Linie ist gewünscht)
    const series = useMemo(() => {
      const perDay = Array(monthDays).fill(0);
      for (const t of tradesMonth) {
        const d = dayjs(t.dateStr, "YYYY-MM-DD", true);
        if (!d.isValid()) continue;
        const idx = d.date() - 1; // 0-basiert
        perDay[idx] += Number(t.pnl || 0);
      }
      const cum = [];
      let acc = 0;
      for (let i = 0; i < monthDays; i++) { acc += perDay[i]; cum.push(acc); }
      return { perDay, cum };
    }, [tradesMonth, monthDays]);

    // -------- Chart --------
    const ref = useRef(null), chartRef = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      if (!window.Chart) {
        // Falls Chart.js nicht geladen ist, nichts crashen – zeig einfach keinen Chart.
        ref.current.replaceWith(Object.assign(document.createElement("div"), {
          textContent: "Chart.js nicht geladen – Diagramm wird nicht angezeigt.",
          style: "color:#9ca3af;padding:8px 0;"
        }));
        return;
      }
      chartRef.current?.destroy();
      const axisColor = cssVar("--chart-grid", "#e5e7eb");
      const textColor = cssVar("--text", "#111827");
      chartRef.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels: Array.from({ length: monthDays }, (_, i) => String(i + 1)),
          datasets: [
            // Nur die kumulative Linie (wie gewünscht)
            { label: "Kumulativ", data: series.cum, tension: 0.25, borderWidth: 2, pointRadius: 0 }
            // Wenn du zusätzlich die Tagessumme sehen willst, füge hinzu:
            // { label: "Tagessumme", data: series.perDay, tension: 0.25, borderWidth: 1, pointRadius: 0 }
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

    // -------- UI --------
    return e("div", { className:"w-container" },

      e("div", { className:"w-card" },
        e("div", { className:"w-row" },
          e("div", null,
            e("label", { className:"w-subtle" }, "Monat"),
            e("input", { type:"month", className:"w-input", value:month, onChange:ev=>setMonth(ev.target.value) })
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
              tradesMonth
                .slice()
                .sort((a,b)=> dayjs(b.dateStr).valueOf() - dayjs(a.dateStr).valueOf()) // Tabelle: neueste zuerst
                .map(t => e("tr", { key:t.id },
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

  // Mount
  document.addEventListener("DOMContentLoaded", function(){
    const mount = document.getElementById("trades-app");
    if (!mount) return;
    if (ReactDOM.createRoot) {
      ReactDOM.createRoot(mount).render(React.createElement(App));
    } else {
      ReactDOM.render(React.createElement(App), mount);
    }
  });
})();