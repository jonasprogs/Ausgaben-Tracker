(function(){
  console.log("Wealth.js wird geladen...");

  // Prüfen, ob React & ReactDOM verfügbar sind
  if (!window.React || !window.ReactDOM) {
    document.body.insertAdjacentHTML("beforeend", "<p style='color:red'>React/ReactDOM nicht geladen!</p>");
    console.error("React oder ReactDOM fehlt!");
    return;
  }
  if (!window.Chart) {
    document.body.insertAdjacentHTML("beforeend", "<p style='color:red'>Chart.js nicht geladen!</p>");
    console.error("Chart.js fehlt!");
    return;
  }

  const { useState, useEffect } = React;

  function WealthApp(){
    console.log("WealthApp wird gerendert...");
    return (
      <div style={{padding: "20px"}}>
        <h1>💰 Vermögensseite funktioniert</h1>
        <p>Wenn du das siehst, ist React-Rendering aktiv.</p>
      </div>
    );
  }

  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("wealth-app");
    if (container) {
      console.log("Container gefunden:", container);
      ReactDOM.render(<WealthApp />, container);
    } else {
      console.error("Kein wealth-app Container gefunden!");
      document.body.insertAdjacentHTML("beforeend", "<p style='color:red'>Kein wealth-app Container gefunden!</p>");
    }
  });
})();