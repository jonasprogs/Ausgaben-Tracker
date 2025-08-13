// abrechnung.js – Monats-Abrechnung inkl. optionaler Trade-Einnahmen (React UMD, kein JSX)
(function(){
  var h=React.createElement, useState=React.useState, useEffect=React.useEffect, useRef=React.useRef;

  var STORAGE_KEY="summary-data-v1"; // Abrechnung
  var EXPENSES_KEY=(window.StorageTools && StorageTools.KEYS && StorageTools.KEYS.expenses) || "budget-tracker-react-v11";

  // ---- Trades: Key-Finder + Reader ----
  var TRADE_KEYS=["trades-data-v1","trades-tracker-v1","trades-tracker-react-v1"];
  function findTradeKey(){
    // bekannte Keys
    for(var i=0;i<TRADE_KEYS.length;i++){
      try{ var raw=localStorage.getItem(TRADE_KEYS[i]); if(!raw) continue; var o=JSON.parse(raw); if(o && Array.isArray(o.trades)) return TRADE_KEYS[i]; }catch(_){}
    }
    // scan
    var best=null, len=-1;
    for(var j=0;j<localStorage.length;j++){
      var k=localStorage.key(j);
      try{ var o2=JSON.parse(localStorage.getItem(k)); if(o2 && Array.isArray(o2.trades) && o2.trades.length>len){best=k; len=o2.trades.length;} }catch(_){}
    }
    return best || TRADE_KEYS[0];
  }
  var TRADES_KEY=findTradeKey();
  function tradesSumForMonth(ym){
    try{
      var raw=localStorage.getItem(TRADES_KEY); if(!raw) return 0;
      var o=JSON.parse(raw)||{}; var arr=Array.isArray(o.trades)?o.trades:[];
      var sum=0;
      for(var i=0;i<arr.length;i++){
        var t=arr[i]; var ds=(t&&t.dateStr)||""; if(ds.slice(0,7)!==ym) continue;
        sum+=Number(t.pnl||0);
      }
      return sum;
    }catch(_){return 0;}
  }

  // ---- Realtime Hooks für Ausgaben ----
  (function initRealtime(){
    if(!window.__lsHooked){
      window.__lsHooked=true;
      var origSet=localStorage.setItem, origRem=localStorage.removeItem;
      function fire(key){ try{ window.dispatchEvent(new CustomEvent("ls-change",{detail:{key}})); if(window.bcFinance) window.bcFinance.postMessage({type:"ls",key}); }catch(_){ } }
      localStorage.setItem=function(k,v){ var r=origSet.apply(this,arguments); fire(k); return r; };
      localStorage.removeItem=function(k){ var r=origRem.apply(this,arguments); fire(k); return r; };
    }
    if(!window.bcFinance && "BroadcastChannel" in window){ try{ window.bcFinance=new BroadcastChannel("finance-app"); }catch(_){ } }
  })();

  function nowYM(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function fmtEUR(n){ return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }
  function loadCfg(){ try{ var raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
  function saveCfg(obj){ localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

  // Ausgaben der Ausgaben-App lesen
  function readFromExpenseApp(month){
    var raw=localStorage.getItem(EXPENSES_KEY);
    if(!raw) return {found:false,total:0,groceries:0,monthBudget:0,useOverride:false,overrideAdd:0,sig:""};
    var st; try{ st=JSON.parse(raw); }catch(e){ return {found:false,total:0,groceries:0,monthBudget:0,useOverride:false,overrideAdd:0,sig:""}; }
    var expenses=Array.isArray(st.expenses)?st.expenses:[], total=0, groceries=0;
    for(var i=0;i<expenses.length;i++){
      var e=expenses[i]; var ds=e&&e.dateStr?String(e.dateStr):null; if(!ds) continue;
      var ym=ds.slice(0,7); if(ym!==month) continue;
      var amt=Number(e.amount||0); total+=amt; if((e.category||"")==="Lebensmittel") groceries+=amt;
    }
    var monthBudget=Number(st.monthlyBudget||0);
    var useOverride=!!st.useOverride;
    var overrideAdd=useOverride && isFinite(Number(st.overrideSpentToDate)) ? Number(st.overrideSpentToDate) : 0;
    var sig=[expenses.length,total.toFixed(2),groceries.toFixed(2),monthBudget.toFixed(2),useOverride?1:0,Number(overrideAdd||0).toFixed(2)].join("|");
    return {found:true,total:total,groceries:groceries,monthBudget:monthBudget,useOverride:useOverride,overrideAdd:overrideAdd,sig:sig};
  }

  function App(){
    var init=loadCfg();
    var initialYM=init.__lastYM || nowYM();
    if(!init[initialYM]) init[initialYM]={ incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true, includeTrades:true };
    if(!init.__uiCollapsed) init.__uiCollapsed={ incomes:false, fixed:false, out:false };

    var st=useState(init), data=st[0], setData=st[1];
    var ymst=useState(initialYM), month=ymst[0], setMonth=ymst[1];
    var tick=useState(0), setTick=tick[1];

    // Live refresh der Ausgaben + Trades
    var lastSigRef=useRef("");
    useEffect(function(){
      function isVisible(){
        var el=document.getElementById("page-abrechnung"); return el && el.style.display!=="none" && document.visibilityState==="visible";
      }
      function refresh(){
        var auto=readFromExpenseApp(month);
        var sig=auto.sig+"|trades:"+tradesSumForMonth(month).toFixed(2);
        if(sig!==lastSigRef.current){ lastSigRef.current=sig; setTick(function(t){return (t+1)%100000;}); }
      }
      function onLs(ev){
        if(!ev||!ev.detail) return;
        if(ev.detail.key===EXPENSES_KEY || ev.detail.key===TRADES_KEY) refresh();
      }
      window.addEventListener("ls-change", onLs);
      window.addEventListener("storage", onLs);
      var id=setInterval(function(){ if(isVisible()) refresh(); }, 1200);
      refresh();
      return function(){ window.removeEventListener("ls-change", onLs); window.removeEventListener("storage", onLs); clearInterval(id); };
    }, [month]);

    function monthData(){
      var cur=data[month];
      if(!cur){ cur={ incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true, includeTrades:true };
        setData(function(prev){ var c=Object.assign({},prev); c[month]=cur; c.__lastYM=month; saveCfg(c); return c; });
      }
      cur.incomes=Array.isArray(cur.incomes)?cur.incomes:[]; cur.fixed=Array.isArray(cur.fixed)?cur.fixed:[]; cur.overrides=cur.overrides||{};
      if(typeof cur.useAutoPlan!=="boolean") cur.useAutoPlan=true;
      if(typeof cur.includeTrades!=="boolean") cur.includeTrades=true;
      return cur;
    }
    function setMonthPatch(patch){
      setData(function(prev){ var copy=Object.assign({},prev); var base=copy[month]||{ incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true, includeTrades:true };
        copy[month]=Object.assign({},base,patch); copy.__lastYM=month; saveCfg(copy); return copy; });
    }
    function ensureMonth(m){
      setData(function(prev){ var copy=Object.assign({},prev); if(!copy[m]) copy[m]={ incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true, includeTrades:true }; copy.__lastYM=m; saveCfg(copy); return copy; });
    }
    function setCollapsed(section,val){
      setData(function(prev){ var copy=Object.assign({},prev); var ui=Object.assign({incomes:false,fixed:false,out:false}, copy.__uiCollapsed||{}); ui[section]=!!val; copy.__uiCollapsed=ui; saveCfg(copy); return copy; });
    }

    var cur=monthData(); var ui=Object.assign({incomes:false,fixed:false,out:false}, data.__uiCollapsed||{});

    var incomes=cur.incomes, plannedManual=Number(cur.planned||0), fixed=cur.fixed, ovr=cur.overrides;
    var incomeSum=incomes.reduce(function(a,b){ return a+Number(b.amount||0); },0);
    var fixedSum=fixed.reduce(function(a,b){ return a+Number(b.amount||0); },0);

    var auto=readFromExpenseApp(month);
    var groceriesWithOverride=auto.groceries + (auto.overrideAdd||0);
    var totalSpent=auto.total;
    var autoPlanRest=Math.max(0, Number(auto.monthBudget||0) - Number(groceriesWithOverride||0));

    var totalSpentEff=(ovr.totalSpent!=null)?Number(ovr.totalSpent):totalSpent;
    var groceriesEff=(ovr.groceriesSpent!=null)?Number(ovr.groceriesSpent):groceriesWithOverride;
    var autoPlanEff=cur.useAutoPlan ? autoPlanRest : 0;

    var otherSpent=Math.max(0, Number(totalSpentEff) - Number(groceriesEff));

    // ---- Trades als Einnahmen (auto) ----
    var tradesIncomeMonth = tradesSumForMonth(month); // kann neg. sein (Verlust)
    var includeTrades = !!cur.includeTrades;
    var effectiveIncomeSum = Number(incomeSum) + (includeTrades ? Number(tradesIncomeMonth) : 0);

    var net = Number(effectiveIncomeSum) - Number(fixedSum) - Number(totalSpentEff) - Number(plannedManual) - Number(autoPlanEff);

    function addIncome(){ setMonthPatch({ incomes: incomes.concat([{id:uid(), name:"", amount:0}]) }); }
    function updIncome(id,patch){ setMonthPatch({ incomes: incomes.map(function(x){ return x.id===id?Object.assign({},x,patch):x; }) }); }
    function delIncome(id){ setMonthPatch({ incomes: incomes.filter(function(x){ return x.id!==id; }) }); }

    function addFixed(){ setMonthPatch({ fixed: fixed.concat([{id:uid(), name:"", amount:0}]) }); }
    function updFixed(id,patch){ setMonthPatch({ fixed: fixed.map(function(x){ return x.id===id?Object.assign({},x,patch):x; }) }); }
    function delFixed(id){ setMonthPatch({ fixed: fixed.filter(function(x){ return x.id!==id; }) }); }

    function recalcFromExpenses(){
      var base=data[month]||{ incomes:[], planned:0, fixed:[], overrides:{} };
      base.overrides=Object.assign({}, base.overrides, { totalSpent: totalSpent, groceriesSpent: groceriesWithOverride });
      setMonthPatch(base); alert("Ausgaben neu übernommen.");
    }

    return h("div",{className:"w-container"},

      // Kopf
      h("div",{className:"w-card"},
        h("div",{className:"w-row"},
          h("div",null,
            h("label",{className:"w-subtle"},"Monat"),
            h("input",{type:"month",value:month,onChange:function(e){var v=e.target.value; setMonth(v); ensureMonth(v);}, className:"w-input",style:{minWidth:"180px"}})
          ),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-pill"},"Einnahmen: "+fmtEUR(effectiveIncomeSum)),
          includeTrades ? h("div",{className:"w-pill"},"Trades: "+fmtEUR(tradesIncomeMonth)) : h("div",{className:"w-pill w-muted"},"Trades: aus"),
          h("div",{className:"w-pill"},"Fixkosten: "+fmtEUR(fixedSum)),
          h("div",{className:"w-pill"},"Ausgaben: "+fmtEUR(totalSpentEff))
        )
      ),

      // Einnahmen
      h("div",{className:"w-card"},
        h("div",{className:"w-row",style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Einnahmen"),
          h("div",{className:"w-spacer"}),
          h("label",{className:"w-subtle",style:{display:"flex",alignItems:"center",gap:8}},
            h("input",{type:"checkbox",checked:includeTrades,onChange:function(ev){ setMonthPatch({ includeTrades: !!ev.target.checked }); }}),
            "Trades als Einnahmen einrechnen"
          ),
          h("button",{className:"w-button w-btn-primary",onClick:addIncome,style:{marginLeft:8}},"+ Einnahme")
        ),
        h("div",{style:{overflowX:"auto"}},
          h("table",{className:"w-table"},
            h("thead",null,h("tr",null,h("th",null,"Name"),h("th",{className:"w-num"},"Betrag (€)"),h("th",null,"Aktion"))),
            h("tbody",null,
              incomes.map(function(row){
                return h("tr",{key:row.id},
                  h("td",null, h("input",{className:"w-input",value:row.name||"",onChange:function(e){updIncome(row.id,{name:e.target.value});}})),
                  h("td",{className:"w-num"}, h("input",{className:"w-input",type:"number",step:"0.01",value:row.amount||0,onChange:function(e){updIncome(row.id,{amount:Number(e.target.value||0)});}})),
                  h("td",null, h("button",{className:"w-button w-btn-danger",onClick:function(){delIncome(row.id);}},"Löschen"))
                );
              }),
              includeTrades ? h("tr",{key:"__auto_trade__",className:"w-muted"},
                h("td",null,"(Auto) Trades "+month),
                h("td",{className:"w-num"}, fmtEUR(tradesIncomeMonth)),
                h("td",null, h("span",{className:"w-subtle"},"automatisch"))
              ) : null
            )
          )
        )
      ),

      // Fixkosten
      h("div",{className:"w-card"},
        h("div",{className:"w-row",style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Fixkosten"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-primary",onClick:addFixed},"+ Position")
        ),
        h("div",{style:{overflowX:"auto"}},
          h("table",{className:"w-table"},
            h("thead",null,h("tr",null,h("th",null,"Name"),h("th",{className:"w-num"},"Betrag (€)"),h("th",null,"Aktion"))),
            h("tbody",null,
              fixed.map(function(fx){
                return h("tr",{key:fx.id},
                  h("td",null, h("input",{className:"w-input",value:fx.name||"",onChange:function(e){updFixed(fx.id,{name:e.target.value});}})),
                  h("td",{className:"w-num"}, h("input",{className:"w-input",type:"number",step:"0.01",value:fx.amount||0,onChange:function(e){updFixed(fx.id,{amount:Number(e.target.value||0)});}})),
                  h("td",null, h("button",{className:"w-button w-btn-danger",onClick:function(){delFixed(fx.id);}},"Löschen"))
                );
              })
            )
          )
        )
      ),

      // Ausgaben + Auto-Werte
      h("div",{className:"w-card"},
        h("div",{className:"w-row",style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Ausgaben & Auto-Werte"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-ghost",onClick:recalcFromExpenses},"Neu aus Ausgaben übernehmen")
        ),
        h("div",{className:"w-grid-2"},
          h("div",null,
            h("label",{className:"w-subtle"},"Gesamt ausgegeben (auto, "+month+")"),
            h("input",{className:"w-input",type:"number",step:"0.01",value:(ovr.totalSpent!=null?ovr.totalSpent:totalSpent),
              onChange:function(e){ var v=Number(e.target.value||0); var next=Object.assign({},cur.overrides,{totalSpent:v}); setMonthPatch({overrides:next}); }})
          ),
          h("div",null,
            h("label",{className:"w-subtle"},"Lebensmittel (inkl. Override)"),
            h("input",{className:"w-input",type:"number",step:"0.01",value:(ovr.groceriesSpent!=null?ovr.groceriesSpent:groceriesWithOverride),
              onChange:function(e){ var v=Number(e.target.value||0); var next=Object.assign({},cur.overrides,{groceriesSpent:v}); setMonthPatch({overrides:next}); }})
          )
        ),
        h("div",{className:"w-grid-2",style:{marginTop:"10px"}},
          h("div",null,
            h("label",{className:"w-subtle"},"Auto-Plan (Rest Lebensmittelbudget)"),
            h("div",{className:"w-row"},
              h("div",{className:"w-pill"},"Auto-Plan: "+fmtEUR(Math.max(0, Number(cur.useAutoPlan ? (Math.max(0, Number(auto.monthBudget||0) - Number(groceriesWithOverride||0))) : 0)))),
              h("label",{className:"w-subtle",style:{display:"flex",alignItems:"center",gap:8}},
                h("input",{type:"checkbox",checked:!!cur.useAutoPlan,onChange:function(e){ setMonthPatch({useAutoPlan: !!e.target.checked}); }}),
                "In Netto einbeziehen"
              )
            )
          ),
          h("div",null,
            h("label",{className:"w-subtle"},"Zusätzlich eingeplant (manuell)"),
            h("input",{className:"w-input",type:"number",step:"0.01",value:plannedManual,onChange:function(e){ setMonthPatch({planned:Number(e.target.value||0)}); }})
          )
        )
      ),

      // Netto
      h("div",{className:"w-card"},
        h("h3",null,"Netto-Projektion"),
        h("div",{className:"w-kacheln"},
          h("div",{className:"w-kachel"}, h("strong",null,"Summe Einnahmen"), h("small",null, fmtEUR(effectiveIncomeSum))),
          includeTrades ? h("div",{className:"w-kachel"}, h("strong",null,"davon Trades"), h("small",null, fmtEUR(tradesIncomeMonth))) : null,
          h("div",{className:"w-kachel"}, h("strong",null,"Fixkosten"), h("small",null, "− "+fmtEUR(fixedSum))),
          h("div",{className:"w-kachel"}, h("strong",null,"Gesamt ausgegeben"), h("small",null, "− "+fmtEUR(totalSpentEff))),
          cur.useAutoPlan ? h("div",{className:"w-kachel"}, h("strong",null,"Auto-Plan (Lebensmittel)"), h("small",null, "− "+fmtEUR(autoPlanEff))) : null,
          h("div",{className:"w-kachel"}, h("strong",null,"Zusätzlich eingeplant"), h("small",null, "− "+fmtEUR(plannedManual)))
        ),
        h("div",{className:"w-row",style:{marginTop:"10px"}},
          h("div",{className:"w-pill",style:{fontWeight:700}},"≈ Netto am Monatsende: "+fmtEUR(net)),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-subtle"},"Andere Ausgaben (ohne Lebensmittel): "+fmtEUR(otherSpent))
        )
      )
    );
  }

  document.addEventListener("DOMContentLoaded", function(){
    var mount=document.getElementById("summary-app"); if(!mount) return;
    var root=ReactDOM.createRoot?ReactDOM.createRoot(mount):null;
    if(root){ root.render(h(App)); } else { ReactDOM.render(h(App), mount); }
  });
})();