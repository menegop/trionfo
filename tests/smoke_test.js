"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const C = require("../game.js");
const { HeuristicAI } = require("../ai.js");
const { TutorEngine, encodeObservation } = require("../onnx_tutor.js");

function runMatch(seedValue) {
  let seed = seedValue >>> 0;
  const randomFn = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const game = new C.Game({ randomFn, cricca: true, rainDeclaration: true });
  const bots = [0, 1, 2, 3].map(i => new HeuristicAI(`Bot${i}`));
  let safety = 0;
  let completedHands = 0;
  let previousMatch = [0, 0];

  while (game.phase !== "match_end") {
    if (++safety > 20000) throw new Error("Safety limit exceeded");
    if (game.phase === "trump") {
      const d = bots[game.chooser].chooseTrump(game, game.chooser);
      game.chooseTrump(game.chooser, d.suit);
      continue;
    }
    if (game.phase === "play") {
      const p = game.currentPlayer;
      const legalBefore = new Set(game.legalCards(p).map(c => c.id));
      const d = bots[p].chooseMove(game, p);
      assert(legalBefore.has(d.card.id), "AI selected an illegal card");
      game.playCard(p, d.card.id);
      game.assertIntegrity();
      continue;
    }
    if (game.phase === "hand_end") {
      const s = game.lastHandSummary;
      const bonus = s.cricca ? 9 : 0;
      assert.strictEqual(s.handThirds[0] + s.handThirds[1], 35 + bonus, "Invalid hand thirds");
      assert.strictEqual(s.cardThirds[0] + s.cardThirds[1], 32, "Card thirds must total 32");
      assert.strictEqual(s.lastBonusThirds[0] + s.lastBonusThirds[1], 3, "Last trick must award exactly 3 thirds = 1 point");
      assert.strictEqual(s.scoringCards[0].length + s.scoringCards[1].length, 24, "There must be 24 point-bearing cards in the deck");
      assert.deepStrictEqual(s.handPoints, s.handThirds.map(v => Math.floor(v / 3)), "Per-hand floor rule broken");
      assert.strictEqual(game.matchPoints[0] - previousMatch[0], s.handPoints[0], "Team 0 carried fractional thirds");
      assert.strictEqual(game.matchPoints[1] - previousMatch[1], s.handPoints[1], "Team 1 carried fractional thirds");
      previousMatch = game.matchPoints.slice();
      completedHands += 1;
      game.nextHand();
    }
  }

  assert(Math.max(...game.matchPoints) >= C.TARGET_POINTS);
  assert.notStrictEqual(game.matchPoints[0], game.matchPoints[1]);
  return completedHands + 1;
}

// Canonical V12/V14 browser encoder contract.
{
  const game = new C.Game({ randomFn: () => 0.314159, cricca: true });
  const bot = new HeuristicAI("Test");
  game.chooseTrump(game.chooser, bot.chooseTrump(game, game.chooser).suit);
  const player = game.currentPlayer;
  const obs = encodeObservation(game, player);
  assert.strictEqual(obs.length, 398, "ONNX observation must have 398 values");
  const handSum = Array.from(obs.slice(0, 40)).reduce((a, b) => a + b, 0);
  assert.strictEqual(handSum, 10, "ONNX own-hand encoding must contain 10 cards");
}

// The encoder must never leak hidden hands into the V14 input.
{
  const game = new C.Game({ randomFn: () => 0.271828, cricca: true });
  const bot = new HeuristicAI("Test");
  game.chooseTrump(game.chooser, bot.chooseTrump(game, game.chooser).suit);
  while (game.currentPlayer !== 0) {
    const p = game.currentPlayer;
    const d = bot.chooseMove(game, p);
    game.playCard(p, d.card.id);
  }
  const before = Array.from(encodeObservation(game, 0));
  if (game.hands[1].length && game.hands[3].length) {
    const temp = game.hands[1][0];
    game.hands[1][0] = game.hands[3][0];
    game.hands[3][0] = temp;
  }
  const after = Array.from(encodeObservation(game, 0));
  assert.deepStrictEqual(after, before, "V14 observation leaked opponents' hidden cards");
}

for (let i = 1; i <= 30; i++) runMatch(i * 991);

// All new uniform card faces + retained Ferrara back must exist.
for (const card of C.createDeck()) {
  const p = path.join(__dirname, "..", C.cardImage(card));
  assert(fs.existsSync(p), `Missing card image: ${card.id}`);
}
assert(fs.existsSync(path.join(__dirname, "..", "assets", "cards", "retro_castello_ferrara.png")));

console.log("OK: 30 complete matches, per-hand floor scoring, no signals, V14 encoder and 40 card assets verified.");
