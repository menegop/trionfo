(function (root, factory) {
  const core = typeof module === "object" && module.exports ? require("./game.js") : root.TrionfoCore;
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrionfoAI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  const { SUITS, RANKS, teamOf, partnerOf, pointThirds } = C;

  class HeuristicAI {
    constructor(name = "IA") { this.name = name; }

    chooseTrump(game, player) {
      const hand = game.hands[player];
      let bestSuit = SUITS[0];
      let bestScore = -Infinity;

      for (const suit of SUITS) {
        const cards = hand.filter(c => c.suit === suit);
        const ranks = new Set(cards.map(c => c.rank));
        let score = cards.length * 2.25;
        if (ranks.has("tre")) score += 6.2;
        if (ranks.has("due")) score += 4.8;
        if (ranks.has("asso")) score += 3.7;
        if (ranks.has("re")) score += 1.1;
        if (ranks.has("cavallo")) score += 0.7;
        if (["tre", "due", "asso"].every(r => ranks.has(r))) score += 11;
        if (cards.length === 0) score -= 20;
        if (score > bestScore) {
          bestScore = score;
          bestSuit = suit;
        }
      }
      return { suit: bestSuit, score: bestScore };
    }

    chooseMove(game, player) {
      const legal = game.legalCards(player);
      if (!legal.length) throw new Error(`${this.name}: nessuna carta legale.`);
      const partner = partnerOf(player);
      const isLeader = game.currentTrick.length === 0;

      let card;
      let reason;

      if (isLeader) {
        card = this.bestLead(game, player, legal);
        reason = "sceglie l'apertura più promettente";
      } else {
        const currentWinner = game.determineTrickWinner(game.currentTrick);
        const partnerWinning = currentWinner === partner;
        const position = game.currentTrick.length;

        if (partnerWinning) {
          if (position === 3) {
            const safe = legal.filter(c => game.previewWinner(player, c) === partner);
            if (safe.length) {
              card = safe.slice().sort((a, b) => this.feedValue(game, player, b) - this.feedValue(game, player, a))[0];
              reason = "carica punti sulla presa già sicura del compagno";
            }
          }
          if (!card) {
            card = this.cheapestDiscard(game, player, legal);
            reason = "non supera il compagno e conserva le carte importanti";
          }
        } else {
          const winners = legal.filter(c => game.previewWinner(player, c) === player);
          if (winners.length) {
            const trickValue = game.currentTrick.reduce((s, p) => s + pointThirds(p.card), 0);
            card = winners.slice().sort((a, b) => this.captureCost(game, player, a, trickValue) - this.captureCost(game, player, b, trickValue))[0];
            reason = "prova a prendere con la carta meno costosa";
          } else {
            card = this.cheapestDiscard(game, player, legal);
            reason = "non può prendere e scarica la carta meno preziosa";
          }
        }
      }

      return { card, reason };
    }

    bestLead(game, player, cards) {
      let best = cards[0];
      let bestScore = -Infinity;
      const partner = partnerOf(player);
      const opponents = [0, 1, 2, 3].filter(p => teamOf(p) !== teamOf(player));

      for (const card of cards) {
        let score = 0;
        const suitCount = game.getHandCount(player, card.suit);
        const master = game.cardIsMasterFor(player, card);
        const rankIndex = RANKS.indexOf(card.rank);

        if (master) score += 17;
        score += Math.max(0, 5 - rankIndex) * 1.5;
        score += Math.min(suitCount, 5) * 1.1;

        if (card.rank === "asso" && !master) score -= 8;
        if (card.rank === "due" && !master) score -= 3;
        if (card.suit === game.trump) {
          const trumps = game.getHandCount(player, game.trump);
          const topControl = game.hands[player].some(c => c.suit === game.trump && ["tre", "due"].includes(c.rank));
          score += trumps >= 4 && topControl ? 6 : -2.5;
        } else {
          if (game.voidSuits[partner].has(card.suit) && !game.voidSuits[partner].has(game.trump)) score += 5;
          for (const opp of opponents) if (game.voidSuits[opp].has(card.suit)) score -= 4.5;
        }

        score -= this.strategicCost(game, player, card) * 0.22;

        if (score > bestScore) {
          bestScore = score;
          best = card;
        }
      }
      return best;
    }

    strategicCost(game, player, card) {
      let cost = pointThirds(card) * 2.5;
      const rankWeight = { tre: 8, due: 6.3, asso: 5.2, re: 2.3, cavallo: 1.8, fante: 1.4, sette: .8, sei: .5, cinque: .3, quattro: .1 };
      cost += rankWeight[card.rank] || 0;
      if (card.suit === game.trump) cost += 3.1;
      if (game.cardIsMasterFor(player, card)) cost += 4.5;
      return cost;
    }

    captureCost(game, player, card, trickValue) {
      let cost = this.strategicCost(game, player, card);
      cost -= trickValue * 1.9;
      if (game.currentTrick.length === 3) cost -= 1.2;
      return cost;
    }

    feedValue(game, player, card) {
      return pointThirds(card) * 8 - this.strategicCost(game, player, card) * 0.35;
    }

    cheapestDiscard(game, player, cards) {
      return cards.slice().sort((a, b) => this.strategicCost(game, player, a) - this.strategicCost(game, player, b))[0];
    }
  }

  return { HeuristicAI };
});
