(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);

  const STORAGE_KEY = "budget-tracker-react-v11";
  const CATEGORIES = ["Lebensmittel", "Restaurant", "Mobilität", "Kleidung", "Wohnen", "Fix", "Other"];

  // ---------- Helpers ----------
  function loadState() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function currency(n) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n || 0)); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999"; }

  // OCR helpers
  function parseAllAmounts(text) {
    const re = /(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?:\s*€)?/g;
    const out = []; let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1];
      const val = Number(raw.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
      if (isFinite(val)) out.push({ raw, value: val, index: m.index });
    }
    const uniq = [];
    for (const a of out) if (!uniq.some(u => Math.abs(u.value - a.value) < 1e-6 && Math.abs(u.index - a.index) < 5)) uniq.push(a);
    return uniq;
  }
  function suggestNameFromText(text) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const amountLike = /(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/;
    for (const l of lines) {
      const ban = /(visa|mastercard|amex|karte|card|iban|bic|konto|ref|auth|betrag|summe|gesamt|mwst|ust|tax)/i;
      if (ban.test(l)) continue; if (amountLike.test(l)) continue; if (l.length < 3) continue;
      return l.slice(0, 60);
    }
    return "";
  }

  // Charts data helpers
  function buildCategorySums(expenses) {
    const sums = {};
    for (const e of expenses) {
      const c = e.category || "Lebensmittel";
      sums[c] = (sums[c] || 0) + Number(e.amount || 0);
    }
    const labels = CATEGORIES;
    const data = labels.map(l => sums[l] || 0);
    return { labels, data };
  }
  function buildCumulativeSeries(monthDays, budget, today, monthExpenses, overrideAdd) {
    const daily = (Number(budget) || 0) / monthDays;
    const plan = Array.from({ length: monthDays }, (_, i) => daily * (i + 1));

    const byDay = Array(monthDays).fill(0);
    for (const e of monthExpenses) {
      if ((e.category || "Lebensmittel") !== "Lebensmittel") continue;
      const d = dayjs(e.dateStr, "YYYY-MM-DD", true);
      if (d.isValid() && d.isSame(today, "month") && d.isSame(today, "year")) byDay[d.date() - 1] += Number(e.amount || 0);
    }
    const ist = [];
    let acc = Number(overrideAdd || 0);
    for (let i = 0; i < monthDays; i++) { acc += byDay[i]; ist.push(acc); }
    return { plan, ist };
  }

  function App() {
    const today = dayjs().tz("Europe/Berlin");
    const monthKey = today.format("YYYY-MM");
    const e = React.createElement;

    // ---------- State ----------
    const [state, setState] = useState(() => {
      const loaded = loadState() || { monthlyBudget: 350, useOverride: false, overrideSpentToDate: "", expenses: [] };
      if (!loaded.lastSeenMonthKey) loaded.lastSeenMonthKey = monthKey;
      return loaded;
    });
    useEffect(() => saveState(state), [state]);

    // Collapsible charts
    const [showDonut, setShowDonut] = useState(true);
    const [showLine, setShowLine] = useState(true);

    // Monatsbanner
    const [showMonthBanner, setShowMonthBanner] = useState(state.lastSeenMonthKey !== monthKey);
    function acceptNewMonthClear() { setState(s => ({ ...s, expenses: [], overrideSpentToDate: "", lastSeenMonthKey: monthKey })); setShowMonthBanner(false); }
    function dismissNewMonth() { setState(s => ({ ...s, lastSeenMonthKey: monthKey })); setShowMonthBanner(false); }

    // ---------- Monatswerte ----------
    const monthDays = today.daysInMonth();
    const dayOfMonth = today.date();
    const monthEnd = today.endOf("month");

    const monthExpenses = useMemo(() => {
      return state.expenses.filter(x => dayjs(x.dateStr, "YYYY-MM-DD").format("YYYY-MM") === monthKey);
    }, [state.expenses, monthKey]);

    const foodSum = useMemo(() => monthExpenses
      .filter(x => (x.category || "Lebensmittel") === "Lebensmittel")
      .reduce((a, b) => a + Number(b.amount || 0), 0),
    [monthExpenses]);

    const overrideRaw = String(state.overrideSpentToDate ?? "").trim();
    const spentToDateFood = (state.useOverride && isFinite(Number(overrideRaw)))
      ? foodSum + Number(overrideRaw || 0)
      : foodSum;

    const plannedCumulative = ((Number(state.monthlyBudget) || 0) / monthDays) * dayOfMonth;
    const todayAvailable = plannedCumulative - spentToDateFood;

    const remainingBudget = (Number(state.monthlyBudget) || 0) - spentToDateFood;
    const remainingDays = monthEnd.diff(today.startOf("day"), "day") + 1;
    const suggestedDaily = remainingDays > 0 ? remainingBudget / remainingDays : 0;

    const dailyBudget = (Number(state.monthlyBudget) || 0) / monthDays;
    const daysDeltaRaw = dailyBudget > 0 ? (todayAvailable / dailyBudget) : 0;
    const daysHint = daysDeltaRaw > 0.05
      ? `Du bist ${Math.abs(daysDeltaRaw).toFixed(1)} Tage im Vorsprung.`
      : (daysDeltaRaw < -0.05
          ? `Du musst ${Math.abs(daysDeltaRaw).toFixed(1)} Tage sparen, um im Plan zu sein.`
          : "Du bist heute exakt im Plan.");

    // ---------- Eingabe ----------
    const [name, setName] = useState("");
    const [amount, setAmount] = useState("");
    const [amountFlash, setAmountFlash] = useState(false);
    const [dateStr, setDateStr] = useState(today.format("YYYY-MM-DD"));
    const [category, setCategory] = useState("Lebensmittel");

    function addExpense() {
      const amt = Number((amount || "").toString().replace(",", "."));
      if (!name.trim() || !isFinite(amt)) return;
      const valid = dayjs(dateStr, "YYYY-MM-DD", true).isValid() ? dateStr : today.format("YYYY-MM-DD");
      setState(s => ({ ...s, expenses: [{ id: uid(), name: name.trim(), amount: amt, dateStr: valid, category }, ...s.expenses] }));
      setName(""); setAmount(""); setDateStr(today.format("YYYY-MM-DD")); setCategory("Lebensmittel");
    }
    function deleteExpense(id) { setState(s => ({ ...s, expenses: s.expenses.filter(x => x.id !== id) })); }
    function newMonth() { if (confirm("Alle Ausgaben löschen (neuer Monat)?")) setState(s => ({ ...s, expenses: [], overrideSpentToDate: "", lastSeenMonthKey: monthKey })); }
    function resetAll() { if (confirm("Alles auf Standard zurücksetzen?")) setState({ monthlyBudget: 350, useOverride: false, overrideSpentToDate: "", expenses: [], lastSeenMonthKey: monthKey }); }

    // ---------- OCR ----------
    const [file, setFile] = useState(null);
    const [filePreview, setFilePreview] = useState("");
    const [note, setNote] = useState("");
    const [ocrStatus, setOcrStatus] = useState("idle");
    const [ocrProgress, setOcrProgress] = useState(0);
    const [foundAmounts, setFoundAmounts] = useState([]);
    const [selectedAmount, setSelectedAmount] = useState(null);
    const [suggestedName, setSuggestedName] = useState("");

    function onFileChange(ev) {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      setFile(f); setFilePreview(URL.createObjectURL(f));
      setOcrStatus("idle"); setOcrProgress(0);
      setFoundAmounts([]); setSelectedAmount(null); setSuggestedName(""); setNote("");
    }
    async function runOCR() {
      if (!file) return;
      setOcrStatus("running"); setOcrProgress(0);
      try {
        const { data } = await Tesseract.recognize(file, 'deu+eng', { logger: m => { if (m.status === 'recognizing text' && m.progress != null) setOcrProgress(Math.round(m.progress * 100)); } });
        const text = data?.text || "";
        const amounts = parseAllAmounts(text);
        setFoundAmounts(amounts);
        setSuggestedName(note.trim() ? note.trim() : suggestNameFromText(text));
        setOcrStatus("done");
      } catch (err) { console.error(err); setOcrStatus("error"); }
    }
    function clearOCR() {
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFile(null); setFilePreview(""); setFoundAmounts([]); setSelectedAmount(null);
      setSuggestedName(""); setNote(""); setOcrStatus("idle"); setOcrProgress(0);
    }
    function selectAmount(a, { adopt = true } = {}) {
      setSelectedAmount(a);
      if (adopt) {
        setAmount(String(a.value.toFixed(2)));
        setName(suggestedName || name);
        setCategory("Lebensmittel");
        setDateStr(today.format("YYYY-MM-DD"));
        setAmountFlash(true); setTimeout(() => setAmountFlash(false), 900);
      }
    }
    function saveSelectionDirect(a) {
      if (!a) return;
      const finalName = (suggestedName || note || "Wallet-Import").trim();
      setState(s => ({ ...s, expenses: [{ id: uid(), name: finalName, amount: Number(a.value.toFixed(2)), dateStr: today.format("YYYY-MM-DD"), category: "Lebensmittel" }, ...s.expenses] }));
    }

    // ---------- Charts ----------
    const donutRef = useRef(null), lineRef = useRef(null);
    const donutChart = useRef(null), lineChart = useRef(null);
    function chartColors() { return [cssVar("--chart-1"), cssVar("--chart-2"), cssVar("--chart-3"), cssVar("--chart-4"), cssVar("--chart-5")]; }
    const gridColor = cssVar("--chart-grid");
    const textColor = getComputedStyle(document.body).getPropertyValue("--text").trim();

    useEffect(() => {
      if (!donutRef.current) return;
      const { labels, data } = buildCategorySums(monthExpenses);
      const colors = chartColors();
      donutChart.current?.destroy();
      donutChart.current = new Chart(donutRef.current, {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderWidth: 0 }] },
        options: { plugins: { legend: { labels: { color: textColor } } }, layout: { padding: 8 }, cutout: "55%" }
      });
      return () => donutChart.current?.destroy();
    }, [monthExpenses, state.monthlyBudget, state.useOverride, state.overrideSpentToDate]);

    useEffect(() => {
      if (!lineRef.current) return;
      const { plan, ist } = buildCumulativeSeries(
        monthDays, state.monthlyBudget, today, monthExpenses,
        (state.useOverride && isFinite(Number(overrideRaw))) ? Number(overrideRaw) : 0
      );
      const colors = chartColors();
      lineChart.current?.destroy();
      lineChart.current = new Chart(lineRef.current, {
        type: "line",
        data: {
          labels: Array.from({ length: monthDays }, (_, i) => `${i + 1}`),
          datasets: [
            { label: "Plan (kumuliert)", data: plan, tension: 0.25, borderWidth: 2, pointRadius: 0, borderColor: colors[0] },
            { label: "Kumuliert (mit Override)", data: ist, tension: 0.25, borderWidth: 2, pointRadius: 0, borderColor: colors[1] }
          ]
        },
        options: {
          plugins: { legend: { labels: { color: textColor } } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor } }
          },
          layout: { padding: 8 }
        }
      });
      return () => lineChart.current?.destroy();
    }, [state.monthlyBudget, monthExpenses, monthDays, monthKey, state.useOverride, state.overrideSpentToDate]);

    // ---------- UI ----------
    const banner = showMonthBanner ? e("div", { className: "banner card" },
      e("div", { style: { marginBottom: 8 } }, "Neuer Monat erkannt. Möchtest du die Ausgaben-Liste leeren?"),
      e("div", { className: "actions" },
        e("button", { className: "btn", onClick: acceptNewMonthClear }, "Neuer Monat"),
        e("button", { className: "btn ghost", onClick: dismissNewMonth }, "Später")
      )
    ) : null;

    const settings = e("div", { className: "card" },
      e("h2", null, "Einstellungen"),
      e("div", { className: "row" },
        e("div", null,
          e("label", null, "Monatsbudget (Lebensmittel) €"),
          e("input", { className: "input", type: "number", step: "0.01", value: state.monthlyBudget, onChange: ev => setState(s => ({ ...s, monthlyBudget: Number(ev.target.value) })) })
        ),
        e("div", null,
          e("label", { style: { display: "block" } },
            e("input", { type: "checkbox", checked: state.useOverride, onChange: ev => setState(s => ({ ...s, useOverride: ev.target.checked })) }),
            " Override aktiv?"
          ),
          e("input", { className: "input", type: "number", step: "0.01", value: state.overrideSpentToDate, placeholder: "Zusatzwert zu bisherigen Ausgaben", onChange: ev => setState(s => ({ ...s, overrideSpentToDate: ev.target.value })) })
        )
      ),
      e("div", { className: "actions", style: { marginTop: 12 } },
        e("button", { className: "btn", onClick: newMonth }, "Neuer Monat"),
        e("button", { className: "btn ghost", onClick: resetAll }, "Zurücksetzen")
      )
    );

    const overview = e("div", { className: "card" },
      e("h2", null, "Übersicht (Lebensmittel-Budget)"),
      e("div", { className: "kpi" },
        e("div", { className: "chip" }, e("div", { className: "sub" }, "Monatsbudget"), e("div", { className: "val" }, currency(state.monthlyBudget))),
        e("div", { className: "chip" }, e("div", { className: "sub" }, "Geplant kumuliert bis heute"), e("div", { className: "val" }, currency(plannedCumulative))),
        e("div", { className: "chip" }, e("div", { className: "sub" }, "Bisher ausgegeben (Lebensmittel)"), e("div", { className: "val" }, currency(spentToDateFood))),
        e("div", { className: "chip" }, e("div", { className: "sub" }, "Heute verfügbar"),
          e("div", { className: "val" }, todayAvailable >= 0 ? e("span", { className: "success" }, currency(todayAvailable)) : e("span", { className: "danger" }, currency(todayAvailable)))
        ),
        e("div", { className: "chip" }, e("div", { className: "sub" }, "Vorschlag / Tag"), e("div", { className: "val" }, currency(suggestedDaily)))
      ),
      e("div", { style: { marginTop: 8, color: daysDeltaRaw >= 0 ? "#22c55e" : "#ef4444" } }, daysHint),
      e("div", { style: { marginTop: 14 } },
        e("div", { className: "progress" },
          e("span", { style: { width: `${Math.max(0, Math.min(100, (spentToDateFood / (state.monthlyBudget || 1)) * 100))}%` } })
        )
      )
    );

    const chartsCat = e("div", { className: "card" },
      e("h2", null, "Ausgaben je Kategorie"),
      e("div", { className: "actions", style: { marginBottom: 8 } },
        e("button", { className: "btn ghost", onClick: () => setShowDonut(v => !v) }, showDonut ? "Einklappen" : "Ausklappen")
      ),
      showDonut ? e("div", null, e("canvas", { ref: donutRef, height: 220 })) : e("div", { style: { color: "#9ca3af" } }, "eingeklappt")
    );

    const chartsLine = e("div", { className: "card" },
      e("h2", null, "Plan vs. Kumuliert (mit Override)"),
      e("div", { className: "actions", style: { marginBottom: 8 } },
        e("button", { className: "btn ghost", onClick: () => setShowLine(v => !v) }, showLine ? "Einklappen" : "Ausklappen")
      ),
      showLine ? e("div", null, e("canvas", { ref: lineRef, height: 220 })) : e("div", { style: { color: "#9ca3af" } }, "eingeklappt")
    );

    const manual = e("div", { className: "card" },
      e("h2", null, "Ausgabe hinzufügen"),
      e("input", { className: `input${amountFlash ? " flash" : ""}`, placeholder: "Betrag (€)", type: "number", step: "0.01", value: amount, onChange: ev => setAmount(ev.target.value) }),
      e("input", { className: "input", placeholder: "Name (z. B. REWE, Kaffee…)", value: name, onChange: ev => setName(ev.target.value) }),
      e("input", { className: "input", type: "date", value: dateStr, onChange: ev => setDateStr(ev.target.value) }),
      e("select", { className: "input", value: category, onChange: ev => setCategory(ev.target.value) }, CATEGORIES.map(c => e("option", { key: c, value: c }, c))),
      e("div", { className: "actions", style: { marginTop: 10 } },
        e("button", { className: "btn", onClick: addExpense }, "Hinzufügen")
      )
    );

    const ocr = e("div", { className: "card" },
      e("h2", null, "Bild-Import (OCR) – Wallet/Screenshot"),
      e("input", { className: "input", type: "file", accept: "image/*", onChange: onFileChange }),
      filePreview ? e("div", { style: { marginTop: 10 } }, e("img", { src: filePreview, alt: "preview", style: { maxWidth: "100%", borderRadius: 12, border: "1px solid var(--panel-border)" } })) : null,
      e("div", { style: { marginTop: 8 } },
        e("label", null, "Notiz (optional) – überschreibt erkannten Namen"),
        e("input", { className: "input", value: note, onChange: ev => setNote(ev.target.value), placeholder: "z. B. REWE Steinweg, Cappuccino" })
      ),
      e("div", { className: "actions", style: { marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" } },
        e("button", { className: "btn", onClick: runOCR, disabled: !file || ocrStatus === "running" }, ocrStatus === "running" ? `Scan läuft… ${ocrProgress}%` : "Scan starten"),
        e("button", { className: "btn ghost", onClick: clearOCR, disabled: (ocrStatus === "idle" && !file) }, "Scan zurücksetzen")
      ),
      ocrStatus === "done" ? e("div", { style: { marginTop: 12 } },
        e("div", { style: { marginBottom: 8, color: "#9ca3af" } }, "Gefundene Beträge im Bild (tippe zum Übernehmen):"),
        foundAmounts.length === 0
          ? e("div", null, "Keine Beträge erkannt.")
          : e("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
              foundAmounts.map((a, i) =>
                e("button", {
                  key: i,
                  className: `amount-pill${selectedAmount && selectedAmount.index === a.index && selectedAmount.value === a.value ? " selected" : ""}`,
                  onClick: () => selectAmount(a, { adopt: true })
                }, currency(a.value))
              )
            ),
        e("div", { style: { marginTop: 12 } },
          e("label", null, "Vorgeschlagener Name (anpassbar)"),
          e("input", { className: "input", value: suggestedName, onChange: ev => setSuggestedName(ev.target.value), placeholder: "z. B. REWE Steinweg" })
        ),
        selectedAmount ? e("div", { className: "actions", style: { marginTop: 10, display: "flex", gap: 8 } },
          e("button", { className: "btn", onClick: () => selectAmount(selectedAmount, { adopt: true }) }, "In Formular übernehmen"),
          e("button", { className: "btn", onClick: () => saveSelectionDirect(selectedAmount) }, "Direkt speichern")
        ) : null
      ) : null,
      ocrStatus === "error" ? e("div", { style: { marginTop: 8, color: "#fca5a5" } }, "OCR fehlgeschlagen. Versuch es mit einem klareren Screenshot.") : null
    );

    // --------- Tabelle (Name editierbar, Kategorie Dropdown) ---------
    const table = e("div", { className: "card" },
      e("h2", null, "Ausgaben (dieser Monat)"),
      monthExpenses.length === 0
        ? e("p", null, "Noch keine Ausgaben.")
        : e("table", { className: "table" },
            e("thead", null, e("tr", null,
              e("th", null, "Datum"),
              e("th", null, "Name"),
              e("th", null, "Kategorie"),
              e("th", { className: "right" }, "Betrag"),
              e("th", null, "")
            )),
            e("tbody", null,
              monthExpenses
                .slice()
                .sort((a, b) =>
                  dayjs(b.dateStr, "YYYY-MM-DD").valueOf() - dayjs(a.dateStr, "YYYY-MM-DD").valueOf()
                )
                .map(exp => e("tr", { key: exp.id },
                  e("td", null, dayjs(exp.dateStr, "YYYY-MM-DD").format("DD.MM.YYYY")),
                  e("td", null,
                    e("input", {
                      className: "input table-text",
                      type: "text",
                      placeholder: "Name / Händler",
                      value: exp.name || "",
                      onChange: ev => setState(s => ({
                        ...s,
                        expenses: s.expenses.map(x =>
                          x.id === exp.id ? { ...x, name: ev.target.value } : x
                        )
                      }))
                    })
                  ),
                  e("td", null,
                    e("select", {
                      className: "input table-select",
                      value: exp.category || "Lebensmittel",
                      onChange: ev => setState(s => ({
                        ...s,
                        expenses: s.expenses.map(x =>
                          x.id === exp.id ? { ...x, category: ev.target.value } : x
                        )
                      }))
                    }, CATEGORIES.map(c => e("option", { key: c, value: c }, c)))
                  ),
                  e("td", { className: "right" }, currency(Number(exp.amount))),
                  e("td", null,
                    e("button", { className: "btn ghost", onClick: () => deleteExpense(exp.id) }, "Löschen")
                  )
                ))
            )
          )
    );

    return React.createElement(React.Fragment, null,
      banner,
      settings,
      overview,
      chartsCat,
      chartsLine,
      manual,
      ocr,
      table
    );
  }

  ReactDOM.createRoot(document.getElementById("app")).render(React.createElement(App));
})();