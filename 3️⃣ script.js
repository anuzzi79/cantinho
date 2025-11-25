// Atualiza o ano automaticamente no rodapé
document.addEventListener("DOMContentLoaded", () => {
    const yearSpan = document.getElementById("year");
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }

    // Carica contenuti salvati da localStorage
    loadSavedContent();

    // Listener per 5 click sull'immagine dell'header per aprire Settings
    let clickCount = 0;
    let clickTimer = null;
    const chefAvatar = document.getElementById("chef-avatar-img");
    
    if (chefAvatar) {
      chefAvatar.style.cursor = "pointer";
      chefAvatar.addEventListener("click", () => {
        clickCount++;
        
        // Reset timer dopo 2 secondi
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 2000);
        
        if (clickCount === 5) {
          window.location.href = "settings.html";
          clickCount = 0;
        }
      });
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

    // Secondary link inside cards (open without triggering parent anchor)
    document.querySelectorAll(".secondary-link").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = el.getAttribute("data-url");
        if (url) window.open(url, "_blank");
      });
    });

    // Funzione per caricare contenuti salvati
    function loadSavedContent() {
      // Carica testo "O que tem de novo"
      const whatsNewContent = localStorage.getItem("whatsNewContent");
      const whatsNewElement = document.getElementById("whats-new-content");
      if (whatsNewContent && whatsNewElement) {
        whatsNewElement.textContent = whatsNewContent;
      }

      // Carica Image 1
      const image1Data = localStorage.getItem("image1Data");
      const image1Element = document.getElementById("image-1");
      if (image1Data && image1Element) {
        image1Element.src = image1Data;
      }

      // Carica Image 2
      const image2Data = localStorage.getItem("image2Data");
      const image2Element = document.getElementById("image-2");
      if (image2Data && image2Element) {
        image2Element.src = image2Data;
      }
    }
  });
  