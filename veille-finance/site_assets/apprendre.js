/* Quiz des cours et recherche dans le lexique. */
(function () {
  "use strict";
  // Quiz
  const quiz = document.querySelectorAll(".quiz");
  let bons = 0, faits = 0;
  quiz.forEach((q) => {
    const bonne = +q.dataset.bonne;
    q.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
      if (q.dataset.repondu) return;
      q.dataset.repondu = "1"; faits++;
      const i = +b.dataset.i;
      if (i === bonne) bons++;
      q.querySelectorAll("[data-i]").forEach((x) => { x.disabled = true; if (+x.dataset.i === bonne) x.classList.add("bon"); });
      if (i !== bonne) b.classList.add("faux");
      q.querySelector(".quiz-expl").hidden = false;
      const s = document.getElementById("quiz-score");
      if (s) s.textContent = `Score : ${bons}/${faits}` + (faits === quiz.length ? (bons === faits ? " — parfait." : " — relis les explications ci-dessus.") : "");
    }));
  });
  // Lexique
  const champ = document.getElementById("lex-q");
  if (!champ) return;
  const termes = [...document.querySelectorAll(".lex-t")], lettres = [...document.querySelectorAll(".lex-l")];
  const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let cat = "";
  const filtrer = () => {
    const q = norm(champ.value.trim());
    let n = 0;
    termes.forEach((t) => { const ok = (!cat || t.dataset.cat === cat) && (!q || norm(t.textContent).includes(q)); t.hidden = !ok; if (ok) n++; });
    lettres.forEach((l) => { let s = l.nextElementSibling, vis = false; while (s && !s.classList.contains("lex-l")) { if (!s.hidden) vis = true; s = s.nextElementSibling; } l.hidden = !vis; });
    document.getElementById("lex-vide").hidden = n > 0;
  };
  champ.addEventListener("input", filtrer);
  document.querySelectorAll("#lex-cat [data-cat]").forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.cat;
    document.querySelectorAll("#lex-cat [data-cat]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    filtrer();
  }));
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t && t.classList.contains("lex-t")) t.classList.add("cible"); }
})();
