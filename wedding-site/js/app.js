(function () {
  "use strict";
  var CONFIG = window.WEDDING_CONFIG || {};

  // ============================================================
  // Porte d'entrée (mot de passe)
  // ============================================================
  var gate = document.getElementById("gate");
  var site = document.getElementById("site");
  var gateForm = document.getElementById("gate-form");
  var gateInput = document.getElementById("gate-password");
  var gateError = document.getElementById("gate-error");
  var GATE_KEY = "sj-rome-2027-ok";

  function openSite(instant) {
    site.hidden = false;
    if (instant) {
      gate.remove();
    } else {
      gate.classList.add("gate-out");
      setTimeout(function () { gate.remove(); }, 750);
    }
    startCountdown();
  }

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  function checkPassword(value) {
    var normalized = value.trim().toLowerCase();
    // crypto.subtle n'existe qu'en contexte sécurisé (https / localhost)
    if (!window.crypto || !crypto.subtle) {
      return Promise.resolve(normalized === "rome2027");
    }
    return sha256Hex(normalized).then(function (hex) {
      return hex === CONFIG.passwordHash;
    });
  }

  try {
    if (sessionStorage.getItem(GATE_KEY) === "1") openSite(true);
  } catch (e) { /* stockage indisponible : la porte reste affichée */ }

  gateForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    checkPassword(gateInput.value).then(function (ok) {
      if (ok) {
        try { sessionStorage.setItem(GATE_KEY, "1"); } catch (e) {}
        openSite(false);
      } else {
        gateError.hidden = false;
        gateInput.select();
      }
    });
  });

  // ============================================================
  // Compte à rebours
  // ============================================================
  var countdownStarted = false;
  function startCountdown() {
    if (countdownStarted) return;
    countdownStarted = true;
    var target = new Date(CONFIG.weddingDate).getTime();
    var els = {
      days: document.getElementById("cd-days"),
      hours: document.getElementById("cd-hours"),
      mins: document.getElementById("cd-mins"),
      secs: document.getElementById("cd-secs"),
    };
    function tick() {
      var diff = Math.max(0, target - Date.now());
      var s = Math.floor(diff / 1000);
      els.days.textContent = String(Math.floor(s / 86400));
      els.hours.textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
      els.mins.textContent = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      els.secs.textContent = String(s % 60).padStart(2, "0");
    }
    tick();
    setInterval(tick, 1000);
  }

  // ============================================================
  // RSVP → Google Sheet (via Google Apps Script)
  // ============================================================
  var rsvpForm = document.getElementById("rsvp-form");
  var rsvpStatus = document.getElementById("rsvp-status");
  var rsvpButton = rsvpForm.querySelector(".rsvp-submit");

  function showStatus(message, isError) {
    rsvpStatus.textContent = message;
    rsvpStatus.classList.toggle("ok", !isError);
    rsvpStatus.classList.toggle("err", !!isError);
    rsvpStatus.hidden = false;
  }

  rsvpForm.addEventListener("submit", function (ev) {
    ev.preventDefault();

    if (!rsvpForm.reportValidity()) return;

    if (!CONFIG.rsvpEndpoint) {
      showStatus("Le formulaire ouvrira très bientôt — revenez dans quelques jours !", true);
      return;
    }

    var data = new URLSearchParams(new FormData(rsvpForm));
    rsvpButton.disabled = true;
    showStatus("Envoi en cours…", false);

    fetch(CONFIG.rsvpEndpoint, { method: "POST", mode: "no-cors", body: data })
      .then(function () {
        rsvpForm.reset();
        showStatus("Grazie mille ! Votre réponse a bien été envoyée. À très vite à Rome 🍋", false);
      })
      .catch(function () {
        showStatus("Impossible d'envoyer votre réponse. Vérifiez votre connexion et réessayez.", true);
      })
      .finally(function () { rsvpButton.disabled = false; });
  });

  // ============================================================
  // Galerie : masquer les photos manquantes
  // ============================================================
  var gallery = document.querySelector(".gallery");
  var items = gallery.querySelectorAll(".gallery-item img");
  var visible = items.length;
  items.forEach(function (img) {
    img.addEventListener("error", function () {
      img.closest(".gallery-item").remove();
      visible -= 1;
      if (visible === 0) {
        var note = document.createElement("p");
        note.className = "section-sub";
        note.style.textAlign = "center";
        note.textContent = "Les photos arrivent bientôt…";
        gallery.replaceWith(note);
      }
    });
  });
})();
