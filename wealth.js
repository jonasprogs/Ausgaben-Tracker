// Vermögen (monatliche Snapshots) – eigenständiges Modul
// Schreibt UI & Logik in den Drawer-Content (div#drawerPage)

(function(){
  const STORE_KEY = "wealth_snapshots_v1"; // { [yyyy-mm]: { items:[{id,name,category,amount}], note? }, __lastYM? }
  const DEFAULT_CATS = ["Cash","Tagesgeld","Depot","Krypto","Renten/ETF","Sonstiges"];
  const PALETTE = ["#4f7cff","#00c2a8","#ffb020","#a78bfa","#ef5da8","#34d399","#f87171","#22d3ee","#f59e0b","#60a5fa"];

  const $ = (root, sel) => root.querySelector(sel);
  const h = (tag, props={}, ...children) => {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(props||{})){
      if (k==="class") el.className = v;
      else if (k.startsWith("on") && typeof v==="function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k==="html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const c of children){ if (c!=null) el.append(c.nodeType? c: document.createTextNode(c)); }
    return el;
  };

  const fmtEUR = n => new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0));
  const uid = () => Math.random().toString(36).slice(2,9);
  const nowYM = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  };

  function load(){ try{ const v = localStorage.getItem(STORE_KEY); return v? JSON.parse(v): {}; }catch{return {};}}
  function save(obj){ localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }

  function calcByCategory(items){
    const total = items.reduce((a,b)=>a+Number(b.amount||0),0);
    const map = new Map();
    for (const it of items){
      const k = it.category||"Sonstiges";
      map.set(k,(map.get(k)||0)+Number(it.amount||0));
    }
    const arr = [...map.entries()].map(([category,amount],i)=>({
      category, amount, pct: total? (amount/total*100):0, color: PALETTE[i%PALETTE.length]
    }));
    return { total, rows: arr };
  }

  function render(container){
    const data = load();
    let month = data.__lastYM || nowYM();
    if (!data[month]) data[month] = { items:[], note:"" };
    save(data);

    container.append(
      // Kopfzeile
      h("section",{class:"w-card"},
        h("div",{class:"w-row"},
          h("div",{},
            h("label",{},"Monat"),
            h("input",{type:"month", value:month, onChange:e=>{
              month = e.target.value;
              if (!data[month]) data[month] = { items:[], note:"" };
              data.__lastYM = month; save(data); redraw();
            }})
          ),
          h("button",{class:"w-ghost", onClick:()=>{ if(!data[month]) data[month]={items:[],note:""}; save(data); redraw(); }},"Monat anlegen"),
          h("button",{class:"w-ghost", onClick:()=>{
            const [y,m] = month.split("-").map(Number);
            const prev = new Date(y, m-2, 1);
            const ym = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}`;
            const src = data[ym];
            if (src){ data[month] = { items: src.items.map(x=>({...x, id:uid()})), note: src.note||"" }; save(data); redraw(); }
            else { alert("Kein Vormonat vorhanden."); }
          }},"Vom Vormonat übernehmen"),
          h("div",{style:"flex:1"}),
          h("button",{class:"w-ghost", onClick:()=>{
            const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`vermoegen_backup.json`; a.click();
            setTimeout(()=>URL.revokeObjectURL(url),400);
          }},"Backup (JSON)"),
          h("button",{class:"w-ghost", onClick:()=>{
            const items = (data[month]?.items)||[];
            let csv = `Monat,Name,Kategorie,Betrag(EUR)\n`;
            for (const it of items){
              csv += `${month},"${(it.name||"").replace(/"/g,'""')}",${it.category},${Number(it.amount||0).toFixed(2)}\n`;
            }
            const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`vermoegen_${month}.csv`; a.click();
            setTimeout(()=>URL.revokeObjectURL(url),400);
          }},"CSV Export")
        ),
        h("div",{class:"w-row", style:"margin-top:8px"},
          h("div",{class:"w-pill", id:"kpiTotal"},"Gesamt: –"),
          h("div",{class:"w-pill", id:"kpiCount"},"Positionen: 0")
        )
      ),

      // Chart + Legende
      h("section",{class:"w-card"},
        h("h3",{},"Verteilung"),
        h("div",{class:"w-grid2"},
          h("div",{}, h("canvas",{id:"wealthPie", height:"240"})),
          h("div",{}, h("div",{id:"wealthLegend", class:"legend"}))
        )
      ),

      // Tabelle Positionen
      h("section",{class:"w-card"},
        h("div",{class:"w-row"},
          h("h3",{},"Positionen"),
          h("div",{style:"flex:1"}),
          h("button",{class:"w-primary", onClick:()=>{
            data[month].items.push({ id:uid(), name:"", category:"Cash", amount:0 });
            save(data); redraw();
          }},"+ Position")
        ),
        h("table",{class:"w-table"},
          h("thead",{}, h("tr",{},
            h("th",{},"Name"),
            h("th",{},"Kategorie"),
            h("th",{class:"w-num"},"Betrag (€)"),
            h("th",{},"Aktion")
          )),
          h("tbody",{id:"wealthTBody"})
        ),
        h("div",{class:"w-meta", style:"margin-top:8px"},"Tipp: Trage jeden Monat deinen Stand ein. Prozentwerte berechnen sich automatisch.")
      )
    );

    let pie = null;

    function redraw(){
      const items = data[month]?.items || [];
      const { total, rows } = calcByCategory(items);

      // KPIs
      $('#kpiTotal', container).textContent = `Gesamt: ${fmtEUR(total)}`;
      $('#kpiCount', container).textContent = `Positionen: ${items.length}`;

      // Tabelle
      const tbody = $('#wealthTBody', container);
      tbody.innerHTML = '';
      for (const it of items){
        const tr = h("tr",{}, 
          h("td",{}, h("input",{value:it.name||"", placeholder:"z. B. Sparkasse", oninput:e=>{ it.name=e.target.value; save(data);} })),
          h("td",{}, (()=> {
            const sel = h("select", { onchange:e=>{ it.category=e.target.value; save(data); redraw(); }});
            for (const c of DEFAULT_CATS) sel.append(h("option",{value:c, ...(it.category===c?{selected:""}:{})}, c));
            return sel;
          })()),
          h("td",{class:"w-num"}, h("input",{type:"number", step:"0.01", value:it.amount??0, oninput:e=>{
            it.amount = Number(e.target.value||0); save(data); redraw();
          }})),
          h("td",{}, h("button",{class:"w-danger", onclick:()=>{ 
            data[month].items = items.filter(x=>x.id!==it.id); save(data); redraw();
          }},"Löschen"))
        );
        tbody.append(tr);
      }

      // Legende
      const legend = $('#wealthLegend', container);
      legend.innerHTML='';
      for (const r of rows){
        const row = h("div",{class:"w-row", style:"align-items:center"},
          h("div",{style:`width:10px;height:10px;border-radius:50%;background:${r.color}`}),
          h("div",{style:"margin-left:8px"}, r.category),
          h("div",{class:"w-meta", style:"margin-left:8px"}, `${r.pct.toFixed(1)}% · ${fmtEUR(r.amount)}`)
        );
        legend.append(row);
      }

      // Chart
      const ctx = document.getElementById('wealthPie');
      if (!ctx) return;
      if (pie) pie.destroy();
      pie = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: rows.map(r=>`${r.category} (${r.pct.toFixed(1)}%)`),
          datasets: [{ data: rows.map(r=>r.amount), backgroundColor: rows.map(r=>r.color) }]
        },
        options: {
          plugins: {
            legend: { position:'bottom', labels:{ color:'#e5e7eb' } },
            tooltip: { callbacks: { label: (c)=> `${c.label}: ${fmtEUR(c.raw)}` } }
          }
        }
      });
    }

    // erste Darstellung
    redraw();
  }

  // Exponieren
  window.WealthModule = { render };
})();