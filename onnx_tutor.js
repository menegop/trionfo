(function (root, factory) {
  const core = typeof module === "object" && module.exports ? require("./game.js") : root.TrionfoCore;
  const api = factory(core, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrionfoTutor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C, root) {
  "use strict";

  const MODEL_PRIORITY_SUITS = Object.freeze(["coppe", "bastoni", "spade", "denari"]);
  const DEFAULT_CONFIG = {
    modelPath: "models/trionfo_v14.onnx",
    maxHandScorePoints: C.MAX_HAND_SCORE_POINTS || 14,
    significantRegretPoints: .75,
    partnerReactionPoints: .66,
  };

  // V12/V14 canonical mapping: trump is ALWAYS model suit 0 after selection;
  // before selection, use a stable suit priority, reused throughout the hand.
  // The original Python trainer randomizes the priority per hand. Any valid
  // priority is compatible with the contract, but this browser uses a stable one.
  function modelSuitOrder(game) {
    const priority = Array.isArray(game.suitPriority) && game.suitPriority.length === 4
      ? game.suitPriority : MODEL_PRIORITY_SUITS;
    if (!game.trump) return priority.slice();
    return [game.trump, ...priority.filter(s => s !== game.trump)];
  }
  function modelCardIndex(game, card) {
    const suit = modelSuitOrder(game).indexOf(card.suit);
    const rank = C.RANKS.indexOf(card.rank);
    if (suit < 0 || rank < 0) throw new Error("Carta non riconosciuta dall'encoder V14");
    return suit * 10 + rank;
  }
  function modelTrumpIndex(game, suit) {
    return modelSuitOrder(game).indexOf(suit);
  }

  function encodeObservation(game, player) {
    const out = new Float32Array(398);
    const suits = modelSuitOrder(game);
    const cardSlot = card => modelCardIndex(game, card);
    let offset = 0;

    for (const card of game.hands[player]) out[offset + cardSlot(card)] = 1;
    offset += 40;
    for (let p = 0; p < 4; p++) {
      for (const card of game.playedByPlayer[p]) out[offset + p * 40 + cardSlot(card)] = 1;
    }
    offset += 160;
    for (const play of game.currentTrick) out[offset + play.player * 40 + cardSlot(play.card)] = 1;
    offset += 160;
    if (game.trump) out[offset + modelTrumpIndex(game, game.trump)] = 1;
    offset += 4;
    out[offset + player] = 1;
    offset += 4;
    if (game.leader !== null && game.leader !== undefined) out[offset + game.leader] = 1;
    offset += 4;
    out[offset + game.chooser] = 1;
    offset += 4;
    out[offset + (game.phase === "trump" ? 0 : game.phase === "play" ? 1 : 2)] = 1;
    offset += 3;
    out[offset] = Number(game.trickIndex) / 10;
    offset += 1;
    out[offset] = Number(game.handThirds[0]) / (C.MAX_HAND_SCORE_THIRDS || 44);
    out[offset + 1] = Number(game.handThirds[1]) / (C.MAX_HAND_SCORE_THIRDS || 44);
    offset += 2;
    for (let p = 0; p < 4; p++) {
      for (let s = 0; s < 4; s++) {
        out[offset + p * 4 + s] = game.voidSuits[p].has(suits[s]) ? 1 : 0;
      }
    }
    offset += 16;
    if (offset !== 398) throw new Error("Encoder V14: dimensione observation non valida");
    return out;
  }

  class TutorEngine {
    constructor(config = {}) {
      this.config = Object.assign({}, DEFAULT_CONFIG, config);
      this.session = null;
      this.status = "V14 non caricata";
      this.mode = "heuristic";
      this.lastError = null;
    }
    async init() {
      if (!root.ort || !root.ort.InferenceSession) {
        this.status = "V14 non attiva: installa ONNX Runtime Web";
        return false;
      }
      try {
        root.ort.env.wasm.numThreads = 1;
        // An absolute URL is required because ONNX Runtime dynamically imports
        // the WebAssembly JavaScript loader (.mjs). A bare "vendor/" prefix
        // is not a valid module specifier in Firefox or Chromium.
        const baseURI = root.document?.baseURI || root.location?.href;
        if (!baseURI) throw new Error("URL del sito non disponibile");
        const vendorURL = new URL("./vendor/", baseURI);
        if (vendorURL.protocol === "file:") {
          throw new Error("Apri il sito con start_server.bat (HTTP), non come file locale");
        }
        root.ort.env.wasm.wasmPaths = vendorURL.href;
        this.session = await root.ort.InferenceSession.create(this.config.modelPath, {
          executionProviders: ["wasm"]
        });
        const required = ["card_logits", "trump_logits", "card_q", "trump_q"];
        for (const name of required) {
          if (!this.session.outputNames.includes(name)) throw new Error(`Output ONNX mancante: ${name}`);
        }
        this.mode = "onnx";
        this.status = "V14 ONNX attiva · Policy + Tutor";
        this.lastError = null;
        return true;
      } catch (error) {
        this.lastError = error;
        this.status = `V14 non attiva: ${error.message}`;
        this.session = null;
        this.mode = "heuristic";
        return false;
      }
    }
    async infer(game, player) {
      if (!this.session) return null;
      const obs = encodeObservation(game, player);
      const inputName = this.session.inputNames.includes("observation") ? "observation" : this.session.inputNames[0];
      const output = await this.session.run({[inputName]: new root.ort.Tensor("float32", obs, [1, 398])});
      return output;
    }
    async chooseMove(game, player, heuristicAI) {
      if (!this.session) return heuristicAI.chooseMove(game, player);
      try {
        const out = await this.infer(game, player);
        const logits = out.card_logits?.data;
        if (!logits || logits.length < 40) throw new Error("Policy V14 senza card_logits");
        const legal = game.legalCards(player);
        let card = legal[0];
        for (const alternative of legal.slice(1)) {
          if (logits[modelCardIndex(game, alternative)] > logits[modelCardIndex(game, card)]) card = alternative;
        }
        return {card, reason: "Policy V14"};
      } catch (error) {
        this.lastError = error;
        this.status = `V14 errore inferenza: ${error.message}`;
        this.session = null;
        this.mode = "heuristic";
        return heuristicAI.chooseMove(game, player);
      }
    }
    async chooseTrump(game, player, heuristicAI) {
      if (!this.session) return heuristicAI.chooseTrump(game, player);
      try {
        const out = await this.infer(game, player);
        const logits = out.trump_logits?.data;
        if (!logits || logits.length < 4) throw new Error("Policy V14 senza trump_logits");
        let suit = C.SUITS[0];
        for (const candidate of C.SUITS.slice(1)) {
          if (logits[modelTrumpIndex(game, candidate)] > logits[modelTrumpIndex(game, suit)]) suit = candidate;
        }
        return {suit, reason: "Policy V14"};
      } catch (error) {
        this.lastError = error;
        this.status = `V14 errore inferenza: ${error.message}`;
        this.session = null;
        this.mode = "heuristic";
        return heuristicAI.chooseTrump(game, player);
      }
    }
    async evaluateDecision(game, player, chosenCard) {
      const legal = game.legalCards(player);
      if (!legal.some(card => card.id === chosenCard.id)) throw new Error("Tutor: scelta non legale");
      if (!this.session) return null; // No fictional Q/regret: no numerical fallback.
      try {
        const output = await this.infer(game, player);
        const values = output.card_q?.data;
        if (!values || values.length < 40) throw new Error("Il modello V14 non espone card_q");
        // Q predicts team-vs-opponents final DIFFERENTIAL. One team's expected
        // score changes by HALF the difference, holding the hand total fixed.
        const scale = Number(this.config.maxHandScorePoints) / 2;
        const scores = legal.map(card => ({card, q: Number(values[modelCardIndex(game, card)]) * scale}))
          .sort((a, b) => b.q - a.q);
        const best = scores[0];
        const chosen = scores.find(x => x.card.id === chosenCard.id);
        const regret = Math.max(0, best.q - chosen.q);
        return {
          source: "onnx", bestCard: best.card, chosenCard,
          chosenQ: chosen.q, bestQ: best.q,
          regretPoints: regret,
          significant: regret >= Number(this.config.significantRegretPoints),
          partnerReaction: regret >= Number(this.config.partnerReactionPoints),
          scores
        };
      } catch (error) {
        this.lastError = error;
        this.status = `Tutor V14 non disponibile: ${error.message}`;
        return null;
      }
    }
  }

  return { TutorEngine, encodeObservation, modelSuitOrder, modelCardIndex, modelTrumpIndex, DEFAULT_CONFIG };
});
