// Atualiza o ano automaticamente no rodapé
document.addEventListener("DOMContentLoaded", () => {
    const yearSpan = document.getElementById("year");
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }

    // Read more / less toggles for long descriptions
    document.querySelectorAll("[data-read-more]").forEach((btn) => {
      const card = btn.closest(".app-card");
      if (!card) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const expanded = card.classList.toggle("expanded");
        btn.textContent = expanded ? "Read less" : "Read more";
      });
    });

    // Force a deterministic order of cards by data-order
    const grid = document.querySelector(".app-grid");
    if (grid) {
      const cards = Array.from(grid.querySelectorAll(".app-card"));
      cards
        .sort((a, b) => {
          const oa = Number(a.getAttribute("data-order") || 9999);
          const ob = Number(b.getAttribute("data-order") || 9999);
          return oa - ob;
        })
        .forEach((card) => grid.appendChild(card));
    }
  });
  