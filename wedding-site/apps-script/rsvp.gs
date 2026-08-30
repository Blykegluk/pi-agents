/**
 * RSVP — Mariage Sara & John (27-28 juin 2027, Rome)
 *
 * Ce script reçoit les réponses du formulaire RSVP du site et les écrit
 * dans le Google Sheet auquel il est lié :
 *   - onglet "Réponses" : une ligne par réponse
 *   - onglet "Récap"    : totaux qui s'incrémentent automatiquement
 *
 * Mise en place : voir README-RSVP.md (5 minutes).
 */

var SHEET_REPONSES = "Réponses";
var SHEET_RECAP = "Récap";

var HEADERS = [
  "Date de réponse",
  "Prénom",
  "Nom",
  "Nb personnes",
  "Welcome Party (27/06)",
  "Houppa & Soirée (28/06)",
  "Mairie & After",
  "Message",
];

/** À exécuter UNE FOIS à la main pour créer les onglets et le récap. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var reponses = ss.getSheetByName(SHEET_REPONSES) || ss.insertSheet(SHEET_REPONSES);
  reponses.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight("bold").setBackground("#21381c").setFontColor("#ffffff");
  reponses.setFrozenRows(1);
  reponses.autoResizeColumns(1, HEADERS.length);

  var recap = ss.getSheetByName(SHEET_RECAP) || ss.insertSheet(SHEET_RECAP);
  recap.clear();
  var rows = [
    ["RÉCAP RSVP — SARA & JOHN", ""],
    ["", ""],
    ["Foyers ayant répondu", '=COUNTA(Réponses!B2:B)'],
    ["Nombre total de personnes", '=SUM(Réponses!D2:D)'],
    ["", ""],
    ["WELCOME PARTY — 27 juin", ""],
    ["Foyers présents", '=COUNTIF(Réponses!E2:E,"Oui")'],
    ["Personnes présentes", '=SUMIF(Réponses!E2:E,"Oui",Réponses!D2:D)'],
    ["", ""],
    ["HOUPPA & SOIRÉE — 28 juin", ""],
    ["Foyers présents", '=COUNTIF(Réponses!F2:F,"Oui")'],
    ["Personnes présentes", '=SUMIF(Réponses!F2:F,"Oui",Réponses!D2:D)'],
    ["", ""],
    ["MAIRIE & AFTER", ""],
    ["Foyers présents", '=COUNTIF(Réponses!G2:G,"Oui")'],
    ["Personnes présentes", '=SUMIF(Réponses!G2:G,"Oui",Réponses!D2:D)'],
  ];
  recap.getRange(1, 1, rows.length, 2).setValues(rows);
  recap.getRange("A1").setFontWeight("bold").setFontSize(14).setFontColor("#a91e22");
  recap.getRangeList(["A6", "A10", "A14"]).setFontWeight("bold").setBackground("#fbf6ec");
  recap.getRange("B3:B16").setFontWeight("bold");
  recap.setColumnWidth(1, 260);
}

/** Reçoit les réponses envoyées par le site (POST). */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_REPONSES);
    if (!sheet) { setup(); sheet = ss.getSheetByName(SHEET_REPONSES); }

    var p = (e && e.parameter) || {};
    sheet.appendRow([
      new Date(),
      String(p.prenom || "").trim(),
      String(p.nom || "").trim(),
      Number(p.nbPersonnes) || "",
      p.welcomeParty === "Oui" ? "Oui" : "Non",
      p.houppa === "Oui" ? "Oui" : "Non",
      p.mairie === "Oui" ? "Oui" : "Non",
      String(p.message || "").trim(),
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/** Permet de vérifier que le déploiement répond (ouvrir l'URL dans le navigateur). */
function doGet() {
  return ContentService.createTextOutput("RSVP Sara & John : le service est en ligne ✔");
}
