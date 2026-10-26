(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrionfoCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // UI order is intentionally independent from the ONNX card-index order.
  const SUITS = ["denari", "spade", "bastoni", "coppe"];
  const SUIT_LABELS = { denari: "Denari", spade: "Spade", bastoni: "Bastoni", coppe: "Coppe" };
  const ONNX_SUITS = ["coppe", "bastoni", "spade", "denari"];
  const RANKS = ["tre", "due", "asso", "re", "cavallo", "fante", "sette", "sei", "cinque", "quattro"];
  const RANK_LABELS = { tre: "3", due: "2", asso: "Asso", re: "Re", cavallo: "Cavallo", fante: "Fante", sette: "7", sei: "6", cinque: "5", quattro: "4" };
  const PLAYER_NAMES = ["Tu", "Tonino", "Ginetto", "Mario"];
  const TEAM_NAMES = ["Tu + Ginetto", "Tonino + Mario"];
  const TARGET_POINTS = 41;
  const MAX_HAND_SCORE_THIRDS = 44;
  const MAX_HAND_SCORE_POINTS = 14;

  function teamOf(player) { return player % 2; }
  function partnerOf(player) { return (player + 2) % 4; }
  function nextPlayer(player) { return (player + 1) % 4; }
  function cardId(suit, rank) { return `${suit}_${rank}`; }
  function cardImage(card) { return `assets/cards/${card.id}.png`; }
  function cardLabel(card) { return `${RANK_LABELS[card.rank]} di ${SUIT_LABELS[card.suit]}`; }
  function strength(card) { return RANKS.length - RANKS.indexOf(card.rank); }
  function pointThirds(card) {
    if (card.rank === "asso") return 3;
    if (["tre", "due", "re", "cavallo", "fante"].includes(card.rank)) return 1;
    return 0;
  }
  function formatThirds(thirds) {
    const sign = thirds < 0 ? "-" : "";
    const value = Math.abs(thirds);
    const whole = Math.floor(value / 3);
    const rem = value % 3;
    if (!rem) return `${sign}${whole}`;
    if (rem === 1) return `${sign}${whole}⅓`;
    return `${sign}${whole}⅔`;
  }
  function roundedHandPoints(thirds) { return Math.floor(Number(thirds) / 3); }

  function onnxCardIndex(card) {
    return ONNX_SUITS.indexOf(card.suit) * 10 + RANKS.indexOf(card.rank);
  }
  function cardFromOnnxIndex(index) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= 40) return null;
    return { suit: ONNX_SUITS[Math.floor(i / 10)], rank: RANKS[i % 10], id: cardId(ONNX_SUITS[Math.floor(i / 10)], RANKS[i % 10]) };
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) deck.push({ suit, rank, id: cardId(suit, rank) });
    }
    return deck;
  }
  function shuffle(deck, randomFn = Math.random) {
    const out = deck.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function sortCards(cards) {
    return cards.slice().sort((a, b) => {
      const s = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      if (s) return s;
      return RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
    });
  }

  class Game {
    constructor(options = {}) {
      this.options = {
        targetPoints: options.targetPoints || TARGET_POINTS,
        cricca: options.cricca !== false,
        rainDeclaration: options.rainDeclaration !== false,
        randomFn: options.randomFn || Math.random,
      };
      this.startMatch();
    }

    startMatch() {
      this.matchPoints = [0, 0];
      this.handNumber = 0;
      this.previousChooser = null;
      this.lastHandSummary = null;
      this.lastWinner = null;
      this.calledOut = null;
      this.matchWinner = null;
      this.startHand();
    }

    startHand() {
      const deck = shuffle(createDeck(), this.options.randomFn);
      this.hands = [[], [], [], []];
      for (let i = 0; i < 40; i++) this.hands[i % 4].push(deck[i]);
      this.hands = this.hands.map(sortCards);
      // Stable random priority for V12/V14 canonical ONNX suit mapping,
      // fixed for the whole hand (including before trump selection).
      this.suitPriority = shuffle(SUITS, this.options.randomFn);

      if (this.handNumber === 0 || this.previousChooser === null) {
        this.chooser = this.hands.findIndex(hand => hand.some(card => card.id === "denari_quattro"));
      } else {
        this.chooser = nextPlayer(this.previousChooser);
      }

      this.phase = "trump";
      this.trump = null;
      this.currentPlayer = this.chooser;
      this.leader = null;
      this.currentTrick = [];
      this.trickHistory = [];
      this.playedCards = [];
      this.playedByPlayer = [[], [], [], []];
      this.voidSuits = [new Set(), new Set(), new Set(), new Set()];
      this.handThirds = [0, 0];
      this.trickIndex = 0;
      this.cricca = null;
      this.isRain = false;
      this.lastWinner = null;
      this.calledOut = null;
    }

    nextHand() {
      if (!["hand_end", "match_end"].includes(this.phase)) throw new Error("La mano non è terminata.");
      if (this.phase === "match_end") throw new Error("La partita è terminata.");
      this.previousChooser = this.chooser;
      this.handNumber += 1;
      this.startHand();
    }

    chooseTrump(player, suit) {
      if (this.phase !== "trump") throw new Error("Non è il momento di scegliere la briscola.");
      if (player !== this.chooser) throw new Error("Solo chi mette può scegliere la briscola.");
      if (!SUITS.includes(suit)) throw new Error("Seme di briscola non valido.");

      this.trump = suit;
      const hand = this.hands[player];
      const top = ["tre", "due", "asso"];
      const hasTop = top.some(rank => hand.some(card => card.suit === suit && card.rank === rank));
      this.isRain = this.options.rainDeclaration && !hasTop;

      if (this.options.cricca && top.every(rank => hand.some(card => card.suit === suit && card.rank === rank))) {
        const team = teamOf(player);
        this.handThirds[team] += 9;
        this.cricca = { player, team, suit, bonusThirds: 9 };
      }

      this.phase = "play";
      this.currentPlayer = this.chooser;
      this.leader = this.chooser;

      return { suit, player, cricca: this.cricca, rain: this.isRain };
    }

    legalCards(player) {
      if (this.phase !== "play" || player !== this.currentPlayer) return [];
      const hand = this.hands[player];
      if (!hand.length) return [];
      if (this.currentTrick.length === 0) return hand.slice();

      const leadSuit = this.currentTrick[0].card.suit;
      const following = hand.filter(card => card.suit === leadSuit);
      return following.length ? following : hand.slice();
    }

    playCard(player, cardIdValue) {
      if (this.phase !== "play") throw new Error("Non è possibile giocare una carta adesso.");
      if (player !== this.currentPlayer) throw new Error("Non è il turno di questo giocatore.");

      const card = this.hands[player].find(c => c.id === cardIdValue);
      if (!card) throw new Error("Carta non presente nella mano.");
      const legal = this.legalCards(player);
      if (!legal.some(c => c.id === card.id)) throw new Error("Devi rispondere al seme della prima carta, se lo possiedi.");

      if (this.currentTrick.length > 0) {
        const leadSuit = this.currentTrick[0].card.suit;
        if (card.suit !== leadSuit) this.voidSuits[player].add(leadSuit);
      }

      const index = this.hands[player].findIndex(c => c.id === card.id);
      this.hands[player].splice(index, 1);
      const play = { player, card };
      this.currentTrick.push(play);
      this.playedCards.push(card);
      this.playedByPlayer[player].push(card);

      const result = {
        player,
        card,
        trickResolved: false,
        trick: null,
        winner: null,
        trickThirds: 0,
        handEnded: false,
        matchEnded: false,
      };

      if (this.currentTrick.length < 4) {
        this.currentPlayer = nextPlayer(player);
        return result;
      }

      const trick = this.currentTrick.slice();
      const winner = this.determineTrickWinner(trick);
      let trickThirds = trick.reduce((sum, item) => sum + pointThirds(item.card), 0);
      if (this.trickIndex === 9) trickThirds += 3;
      this.handThirds[teamOf(winner)] += trickThirds;
      this.lastWinner = winner;
      this.trickHistory.push({ trickIndex: this.trickIndex, plays: trick, winner, thirds: trickThirds });

      result.trickResolved = true;
      result.trick = trick;
      result.winner = winner;
      result.trickThirds = trickThirds;

      this.trickIndex += 1;
      this.currentTrick = [];
      this.leader = winner;
      this.currentPlayer = winner;

      if (this.trickIndex >= 10) {
        this.finishHand();
        result.handEnded = true;
        result.matchEnded = this.phase === "match_end";
      }

      return result;
    }

    finishHand() {
      const baseThirds = this.handThirds[0] + this.handThirds[1] - (this.cricca ? 9 : 0);
      if (baseThirds !== 35) throw new Error(`Errore di punteggio interno: ${baseThirds} terzi invece di 35.`);

      const handPoints = [roundedHandPoints(this.handThirds[0]), roundedHandPoints(this.handThirds[1])];
      this.matchPoints[0] += handPoints[0];
      this.matchPoints[1] += handPoints[1];
      this.previousChooser = this.chooser;

      const capturedCards = [[], []];
      for (const trick of this.trickHistory) {
        const team = teamOf(trick.winner);
        capturedCards[team].push(...trick.plays.map(play => play.card));
      }
      const scoringCards = capturedCards.map(cards => cards.filter(card => pointThirds(card) > 0));
      const cardThirds = capturedCards.map(cards => cards.reduce((sum, card) => sum + pointThirds(card), 0));
      const lastTrickTeam = this.trickHistory.length ? teamOf(this.trickHistory[this.trickHistory.length - 1].winner) : null;
      const lastBonusThirds = [0, 0];
      if (lastTrickTeam !== null) lastBonusThirds[lastTrickTeam] = 3;
      const criccaBonusThirds = [0, 0];
      if (this.cricca) criccaBonusThirds[this.cricca.team] = this.cricca.bonusThirds;

      this.lastHandSummary = {
        handNumber: this.handNumber,
        chooser: this.chooser,
        trump: this.trump,
        handThirds: this.handThirds.slice(),
        handPoints,
        matchPoints: this.matchPoints.slice(),
        cricca: this.cricca,
        capturedCards,
        scoringCards,
        cardThirds,
        lastTrickTeam,
        lastBonusThirds,
        criccaBonusThirds,
      };

      const reached = Math.max(...this.matchPoints) >= this.options.targetPoints;
      if (reached && this.matchPoints[0] !== this.matchPoints[1]) {
        this.matchWinner = this.matchPoints[0] > this.matchPoints[1] ? 0 : 1;
        this.phase = "match_end";
      } else this.phase = "hand_end";
    }

    // A declaration is made BETWEEN completed tricks. The score of the
    // declaring partnership includes completed tricks, cricca and the match
    // points carried from previous hands. The unfinished hand is rounded down
    // for a conservative, provably correct declaration.
    declaredTotal(team) {
      if (team !== 0 && team !== 1) throw new Error("Squadra non valida");
      return this.matchPoints[team] + roundedHandPoints(this.handThirds[team]);
    }

    canDeclareOut() {
      return this.phase === "play" && this.currentTrick.length === 0 && this.trickIndex > 0;
    }

    shouldAIClaim(team) {
      // Never make a risky declaration. A successful claim ends the game
      // immediately; a premature claim loses, so it is only made with proof.
      return this.canDeclareOut() && this.declaredTotal(team) >= this.options.targetPoints;
    }

    declareOut(player) {
      if (!this.canDeclareOut()) throw new Error("Puoi chiamarti fuori solo fra due prese complete.");
      const team = teamOf(player);
      const reached = this.declaredTotal(team) >= this.options.targetPoints;
      const winnerTeam = reached ? team : 1 - team;
      this.calledOut = {
        player, team, winnerTeam, correct: reached,
        declaredPoints: this.declaredTotal(team),
        opponentPoints: this.declaredTotal(1 - team),
        trickIndex: this.trickIndex,
      };
      this.phase = "match_end";
      this.matchWinner = winnerTeam;
      return this.calledOut;
    }

    determineTrickWinner(trick) {
      if (!trick.length) return null;
      const leadSuit = trick[0].card.suit;
      let best = trick[0];
      for (const candidate of trick.slice(1)) {
        if (this.cardBeats(candidate.card, best.card, leadSuit)) best = candidate;
      }
      return best.player;
    }

    cardBeats(challenger, incumbent, leadSuit) {
      if (challenger.suit === incumbent.suit) return strength(challenger) > strength(incumbent);
      if (challenger.suit === this.trump && incumbent.suit !== this.trump) return true;
      if (incumbent.suit === this.trump && challenger.suit !== this.trump) return false;
      if (challenger.suit === leadSuit && incumbent.suit !== leadSuit) return true;
      return false;
    }

    previewWinner(player, card) {
      return this.determineTrickWinner(this.currentTrick.concat([{ player, card }]));
    }

    cardIsMasterFor(player, card) {
      const higherRanks = RANKS.slice(0, RANKS.indexOf(card.rank));
      if (!higherRanks.length) return true;
      const ownIds = new Set(this.hands[player].map(c => c.id));
      const playedIds = new Set(this.playedCards.map(c => c.id));
      return higherRanks.every(rank => {
        const id = cardId(card.suit, rank);
        return ownIds.has(id) || playedIds.has(id);
      });
    }

    getPublicUnplayedCards() {
      const played = new Set(this.playedCards.map(c => c.id));
      return createDeck().filter(card => !played.has(card.id));
    }

    getHandCount(player, suit) {
      return this.hands[player].filter(card => card.suit === suit).length;
    }

    assertIntegrity() {
      const handIds = this.hands.flat().map(c => c.id);
      const tableIds = this.playedCards.map(c => c.id);
      const all = handIds.concat(tableIds);
      if (all.length !== 40) throw new Error(`Integrità mazzo fallita: ${all.length} carte.`);
      if (new Set(all).size !== 40) throw new Error("Integrità mazzo fallita: carta duplicata.");
      return true;
    }
  }

  return {
    SUITS, SUIT_LABELS, ONNX_SUITS, RANKS, RANK_LABELS, PLAYER_NAMES, TEAM_NAMES,
    TARGET_POINTS, MAX_HAND_SCORE_THIRDS, MAX_HAND_SCORE_POINTS,
    Game, teamOf, partnerOf, nextPlayer, cardId, cardImage, cardLabel,
    strength, pointThirds, formatThirds, roundedHandPoints, createDeck, sortCards,
    onnxCardIndex, cardFromOnnxIndex,
  };
});
