"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const tutor = fs.readFileSync(path.join(root, "onnx_tutor.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const bat = fs.readFileSync(path.join(root, "start_server.bat"), "utf8");

for (const forbidden of ["Segnali disattivati", "Registro", "Situazione", "Regole usate", "Trionfa:", "Trionfa da scegliere"]) {
  assert(!html.includes(forbidden), `UI still contains: ${forbidden}`);
}

assert(html.includes('id="inlineTutor"'), "Tutor summary must live near the cards");
assert(html.includes('id="debugEnabled" type="checkbox"'), "Debug toggle must exist");
assert(!html.includes('id="debugEnabled" type="checkbox" checked'), "Debug must be disabled by default");

assert(app.includes("Scegli la briscola"));
assert(app.includes("Briscola:"));
assert(app.includes('els.modalBox.querySelectorAll(".trump-option")'), "Briscola buttons must be bound inside the current modal");
assert(app.includes("applyTrump(0, suit);"), "Human briscola click must apply the selected suit");
assert(app.indexOf("applyTrump(0, suit);") < app.indexOf("closeModal();", app.indexOf("applyTrump(0, suit);") - 250), "Briscola must be applied before the modal is discarded");

assert(app.includes("Mano ${number}/10"));
assert(app.includes("Ha messo"));
assert(app.includes("Prende"));
assert(app.includes("clearTrickFeedback();"), "Tutor/debug/speech must be cleared on trick confirmation");
assert(!app.includes("speechTimer"), "Ginetto speech must not auto-hide on a timer");

assert(app.includes("card-q-delta"), "Relative Q scores must be rendered under human cards");
assert(app.includes("debug-q-delta"), "Debug Q scores must be rendered under opponent cards");
assert(app.includes("debugDecisions"), "Debug must retain per-player pre-play decisions");
assert(app.includes("renderDebugHand"), "Debug must reveal all opponent hands");

const humanEval = app.indexOf("const tutorResult = await evaluateAtPlayTime(0, card);");
const humanPlay = app.indexOf("const result = game.playCard(0, card.id);");
assert(humanEval >= 0 && humanPlay > humanEval, "Human Q must be evaluated before game.playCard");
const aiEval = app.indexOf("debugDecisions[player] = await evaluateAtPlayTime(player, decision.card);");
const aiPlay = app.indexOf("const result = game.playCard(player, decision.card.id);");
assert(aiEval >= 0 && aiPlay > aiEval, "AI debug Q must be evaluated before game.playCard");

assert(app.includes("score-table-transposed"), "Score table must use teams as columns");
assert(app.includes("<tr><th>Carte</th>"));
assert(app.includes("<tr><th>Ultima</th>"));
assert(app.includes("<tr><th>Cricca</th>"));
assert(app.includes('class="score-match-total-row"'), "Score summary needs a clear total row");
assert(!app.includes("<th>Valore</th>"), "Old Valore column must be removed");
assert(!app.includes("<th>Mano</th>"), "Old Mano column must be removed");
assert(app.includes("scoringCardsHtml"), "Hand summary must show captured scoring cards");
assert(app.includes("lastBonusThirds"), "Last-trick point must be visible in score summary");

assert(game.includes("if (this.trickIndex === 9) trickThirds += 3;"), "Last trick must still award 3 thirds = 1 point");
assert(game.includes("if (this.currentTrick.length === 0) return hand.slice();"), "Leader must be free to open with any suit; no forced briscola lead");
assert(tutor.includes("partnerReactionPoints: .66"), "Partner reaction threshold must be 0.66 points");
assert(css.includes("overflow: hidden"), "Page must not require scrolling");
assert(css.includes("modal-overlay.peek"), "Choice/confirmation overlays must leave the table visible");
assert(css.includes("captured-grid-large"), "Captured scoring cards must have the enlarged layout");
assert(css.includes("font-size: clamp(15px, 1.45vw, 20px)"), "Ginetto speech must be larger");
assert(bat.includes("--bind 0.0.0.0"), "Server must bind to 0.0.0.0");

console.log("OK: v5 briscola binding, persistent Ginetto speech, transposed scoring, pre-play Q capture, debug hands/Q, clean next trick, last-trick bonus, free opening lead and 0.0.0.0 server.");
