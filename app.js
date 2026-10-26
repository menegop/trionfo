(async function () {
  "use strict";

  const C = window.TrionfoCore;
  const { HeuristicAI } = window.TrionfoAI;
  const { TutorEngine } = window.TrionfoTutor;

  const game = new C.Game({ cricca: true, rainDeclaration: true });
  const ai = {
    1: new HeuristicAI("Tonino"),
    2: new HeuristicAI("Ginetto"),
    3: new HeuristicAI("Mario"),
  };
  const tutor = new TutorEngine({ significantRegretPoints: 0.75, partnerReactionPoints: 0.66 });

  let busy = false;
  let visualTrick = null;
  let toastTimer = null;
  let lastTutorResult = null;
  let debugDecisions = [null, null, null, null];
  let debugFallbackWarned = false;

  const $ = id => document.getElementById(id);
  const els = {
    humanHand: $("humanHand"), inlineTutor: $("inlineTutor"),
    northBacks: $("northBacks"), eastBacks: $("eastBacks"), westBacks: $("westBacks"),
    northCount: $("northCount"), eastCount: $("eastCount"), westCount: $("westCount"),
    score0: $("scoreTeam0"), score1: $("scoreTeam1"),
    handNumber: $("handNumber"), trumpBadge: $("trumpBadge"), turnLabel: $("turnLabel"),
    trickNumber: $("trickNumber"), chooserLabel: $("chooserLabel"), humanHint: $("humanHint"),
    partnerSpeech: $("partnerSpeech"), overlay: $("modalOverlay"), modalBox: $("modalBox"), toast: $("toast"),
    aiSpeed: $("aiSpeed"), tutorEnabled: $("tutorEnabled"), debugEnabled: $("debugEnabled"),
    profanityEnabled: $("profanityEnabled"), callOutBtn: $("callOutBtn"), modelStatus: $("modelStatus"),
  };

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function aiDelay() { return Number(els.aiSpeed.value || 1450); }
  function postCardDelay() { return Math.max(560, Math.round(aiDelay() * 0.42)); }
  function trickSuspenseDelay() { return Math.max(1300, Math.round(aiDelay() * 0.98)); }
  function waitForPlayedCardAnimation(player, cardId) {
    const slot = $(`slot${player}`);
    const img = slot ? slot.querySelector(`.played-card[data-card-id="${cardId}"]`) : null;
    if (!img || !img.classList.contains("card-enter")) return sleep(30);
    return new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 700);
      img.addEventListener("animationend", done, { once: true });
    });
  }
  function playerName(player) { return C.PLAYER_NAMES[player]; }
  function teamName(team) { return C.TEAM_NAMES[team]; }
  function decimal(value) { return Number(value).toFixed(1).replace(".", ","); }
  function signedDecimal(value) {
    const number = Number(value);
    if (Math.abs(number) < 0.05) return "0,0";
    return `${number > 0 ? "+" : ""}${decimal(number)}`;
  }

  function toast(message, duration = 2200) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add("hidden"), duration);
  }

  function hidePartnerSpeech() {
    els.partnerSpeech.textContent = "";
    els.partnerSpeech.classList.add("hidden");
  }

  function partnerSays(result) {
    if (!result || !result.partnerReaction) return;
    const regret = `${decimal(result.regretPoints)} pt`;
    const best = C.cardLabel(result.bestCard);
    const phrases = els.profanityEnabled.checked ? [
      `Porco Dio! ${best}. Ci costa circa ${regret}.`,
      `Dio cane, dovevi giocare ${best}! Circa ${regret}.`,
      `Porco Dio... ${best}, non quella. ${regret} buttati.`,
      `Dio cane! ${best}. Hai lasciato circa ${regret}.`,
    ] : [
      `Dovevi giocare ${best}! Circa ${regret} persi.`,
      `Accidenti! ${best} era meglio di circa ${regret}.`,
      `Peccato, con ${best} potevamo fare meglio: ${regret}.`,
    ];
    els.partnerSpeech.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    els.partnerSpeech.classList.remove("hidden");
  }

  function showModal(html, mode = "solid") {
    els.modalBox.innerHTML = html;
    els.overlay.className = `modal-overlay ${mode}`;
  }

  function closeModal() {
    els.overlay.className = "modal-overlay hidden";
    els.modalBox.innerHTML = "";
  }

  function decisionScoreMap(result) {
    const map = new Map();
    if (!result) return map;
    for (const item of (result.scores || [])) {
      map.set(item.card.id, Number(item.q) - Number(result.chosenQ));
    }
    return map;
  }

  function humanScoresVisible() {
    return Boolean(els.tutorEnabled.checked || els.debugEnabled.checked);
  }

  function setDeltaBadge(container, value, className = "card-q-delta", visible = true) {
    let badge = container.querySelector(`.${className}`);
    if (value === null || value === undefined || !visible) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = className;
      container.appendChild(badge);
    }
    badge.textContent = signedDecimal(value);
    badge.classList.toggle("positive", value > 0.05);
    badge.classList.toggle("negative", value < -0.05);
    badge.classList.toggle("neutral", Math.abs(value) <= 0.05);
  }

  function renderBacks(container, count, vertical) {
    container.classList.remove("debug-hand");
    const signature = `backs:${count}:${vertical ? "v" : "h"}`;
    if (container.dataset.signature !== signature) {
      container.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const img = document.createElement("img");
        img.src = "assets/cards/retro_castello_ferrara.png";
        img.alt = "Carta coperta";
        img.className = "back-card";
        container.appendChild(img);
      }
      container.dataset.signature = signature;
    }

    const cards = Array.from(container.children);
    const visible = cards.length;
    cards.forEach((img, i) => {
      if (vertical) {
        const step = Math.min(15, 135 / Math.max(1, visible - 1));
        img.style.top = `${i * step}px`;
        img.style.left = "0";
        img.style.transform = `rotate(${(i - visible / 2) * 1.1}deg)`;
      } else {
        const step = Math.min(23, 205 / Math.max(1, visible - 1));
        img.style.left = `${i * step}px`;
        img.style.top = "0";
        img.style.transform = `rotate(${(i - visible / 2) * .9}deg)`;
      }
    });
  }

  function renderDebugHand(container, player) {
    container.classList.add("debug-hand");
    const cards = C.sortCards(game.hands[player]);
    const scores = decisionScoreMap(debugDecisions[player]);
    const scoreSignature = cards.map(card => `${card.id}:${scores.has(card.id) ? signedDecimal(scores.get(card.id)) : ""}`).join("|");
    const signature = `debug:${scoreSignature}`;
    if (container.dataset.signature === signature) return;

    container.innerHTML = "";
    container.dataset.signature = signature;
    for (const card of cards) {
      const wrap = document.createElement("div");
      wrap.className = "debug-card";
      wrap.title = C.cardLabel(card);
      wrap.dataset.cardId = card.id;

      const img = document.createElement("img");
      img.src = C.cardImage(card);
      img.alt = C.cardLabel(card);
      wrap.appendChild(img);

      setDeltaBadge(wrap, scores.has(card.id) ? scores.get(card.id) : null, "debug-q-delta", true);
      container.appendChild(wrap);
    }
  }

  function renderOpponentHands() {
    if (els.debugEnabled.checked) {
      renderDebugHand(els.northBacks, 2);
      renderDebugHand(els.eastBacks, 1);
      renderDebugHand(els.westBacks, 3);
    } else {
      renderBacks(els.northBacks, game.hands[2].length, false);
      renderBacks(els.eastBacks, game.hands[1].length, true);
      renderBacks(els.westBacks, game.hands[3].length, true);
    }
    els.northCount.textContent = game.hands[2].length;
    els.eastCount.textContent = game.hands[1].length;
    els.westCount.textContent = game.hands[3].length;
  }

  function renderHumanHand() {
    const desired = C.sortCards(game.hands[0]);
    const currentLegal = new Set(game.legalCards(0).map(card => card.id));
    const isHumanTurn = game.phase === "play" && game.currentPlayer === 0 && !busy;
    const scoreMap = decisionScoreMap(lastTutorResult);

    const currentIds = Array.from(els.humanHand.children).map(node => node.dataset.cardId);
    const desiredIds = desired.map(card => card.id);
    if (currentIds.join("|") !== desiredIds.join("|")) {
      els.humanHand.innerHTML = "";
      for (const card of desired) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hand-card";
        button.dataset.cardId = card.id;
        button.title = C.cardLabel(card);
        button.setAttribute("aria-label", C.cardLabel(card));
        const img = document.createElement("img");
        img.src = C.cardImage(card);
        img.alt = C.cardLabel(card);
        button.appendChild(img);
        button.addEventListener("click", () => humanPlay(card));
        els.humanHand.appendChild(button);
      }
    }

    Array.from(els.humanHand.children).forEach(button => {
      const cardId = button.dataset.cardId;
      const isLegalNow = currentLegal.has(cardId);
      button.classList.toggle("legal", isLegalNow);
      button.classList.toggle("illegal", game.phase === "play" && isHumanTurn && !isLegalNow);
      button.disabled = !isHumanTurn || !isLegalNow;
      setDeltaBadge(button, scoreMap.has(cardId) ? scoreMap.get(cardId) : null, "card-q-delta", humanScoresVisible());
    });
  }

  function renderTrick() {
    const trick = visualTrick || game.currentTrick;
    for (let player = 0; player < 4; player++) {
      const slot = $(`slot${player}`);
      const play = trick.find(item => item.player === player);
      let existing = slot.querySelector(".played-card");

      if (!play) {
        if (existing) existing.remove();
        setDeltaBadge(slot, null, "played-q-delta", true);
        continue;
      }

      if (!existing || existing.dataset.cardId !== play.card.id) {
        if (existing) existing.remove();
        const img = document.createElement("img");
        img.src = C.cardImage(play.card);
        img.alt = C.cardLabel(play.card);
        img.dataset.cardId = play.card.id;
        const direction = ["south", "east", "north", "west"][player];
        img.className = `played-card card-enter from-${direction}`;
        img.addEventListener("animationend", () => img.classList.remove("card-enter"), { once: true });
        slot.appendChild(img);
        existing = img;
      }

      const decision = player === 0 ? lastTutorResult : debugDecisions[player];
      const scoreMap = decisionScoreMap(decision);
      const chosen = decision && play.card.id === decision.chosenCard.id;
      const visible = player === 0 ? humanScoresVisible() : els.debugEnabled.checked;
      setDeltaBadge(slot, chosen && scoreMap.has(play.card.id) ? scoreMap.get(play.card.id) : null, "played-q-delta", visible);
    }
  }

  function renderInlineTutor() {
    if (!els.tutorEnabled.checked || !lastTutorResult) {
      els.inlineTutor.className = "inline-tutor hidden";
      els.inlineTutor.textContent = "";
      return;
    }
    els.inlineTutor.className = `inline-tutor ${lastTutorResult.significant ? "warning" : "ok"}`;
    els.inlineTutor.textContent = lastTutorResult.significant
      ? `Meglio ${C.cardLabel(lastTutorResult.bestCard)}  +${decimal(lastTutorResult.regretPoints)}`
      : "OK";
  }

  function render() {
    els.score0.textContent = game.matchPoints[0];
    els.score1.textContent = game.matchPoints[1];
    els.handNumber.textContent = `Mano ${game.handNumber + 1}`;
    els.modelStatus.textContent = tutor.status;
    els.modelStatus.classList.toggle("model-active", tutor.mode === "onnx");
    els.callOutBtn.classList.toggle("hidden", !game.canDeclareOut() || busy);
    if (game.trump) {
      els.trumpBadge.innerHTML = `<span>Briscola: ${C.SUIT_LABELS[game.trump]}</span><img class="trump-card-icon" src="assets/cards/${game.trump}_asso.png" alt="Asso di ${C.SUIT_LABELS[game.trump]}">`;
    } else {
      els.trumpBadge.innerHTML = `<span>Briscola: —</span>`;
    }
    els.trickNumber.textContent = `Mano ${Math.min(game.trickIndex + 1, 10)}/10`;

    const trick = visualTrick || game.currentTrick;
    const trickLeader = trick.length ? trick[0].player : game.leader;
    els.chooserLabel.textContent = `Mette: ${trickLeader === null || trickLeader === undefined ? "—" : playerName(trickLeader)}`;

    if (game.phase === "trump") els.turnLabel.textContent = `${playerName(game.chooser)} sceglie la briscola`;
    else if (game.phase === "play") els.turnLabel.textContent = `Turno: ${playerName(game.currentPlayer)}`;
    else els.turnLabel.textContent = "";

    document.body.classList.toggle("debug-mode", els.debugEnabled.checked);
    document.querySelectorAll(".player-zone").forEach(zone => {
      zone.classList.toggle("active-turn", game.phase === "play" && Number(zone.dataset.player) === game.currentPlayer);
    });

    renderOpponentHands();

    const humanTurn = game.phase === "play" && game.currentPlayer === 0 && !busy;
    if (game.phase === "trump" && game.chooser === 0) els.humanHint.textContent = "Scegli la briscola";
    else if (humanTurn) els.humanHint.textContent = "Tocca una carta";
    else els.humanHint.textContent = "";

    renderHumanHand();
    renderTrick();
    renderInlineTutor();
  }

  function clearTutor() {
    lastTutorResult = null;
    renderInlineTutor();
  }

  function clearDebugDecisions() {
    debugDecisions = [null, null, null, null];
  }

  function clearTrickFeedback() {
    clearTutor();
    clearDebugDecisions();
    hidePartnerSpeech();
  }

  function showTrumpChoice() {
    if (game.phase !== "trump" || game.chooser !== 0) return;
    const buttons = C.SUITS.map(suit => `
      <button type="button" class="trump-option" data-suit="${suit}" aria-label="${C.SUIT_LABELS[suit]}">
        <img src="assets/cards/${suit}_asso.png" alt="${C.SUIT_LABELS[suit]}">
        <strong>${C.SUIT_LABELS[suit]}</strong>
      </button>`).join("");

    showModal(`<h2>Scegli la briscola</h2><div class="trump-options">${buttons}</div>`, "peek trump-peek");

    els.modalBox.querySelectorAll(".trump-option").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const suit = button.dataset.suit;
        if (!suit || game.phase !== "trump" || game.chooser !== 0) return;

        els.modalBox.querySelectorAll(".trump-option").forEach(item => { item.disabled = true; });
        try {
          applyTrump(0, suit);
          closeModal();
          busy = false;
          render();
          await advanceAI();
        } catch (error) {
          console.error(error);
          els.modalBox.querySelectorAll(".trump-option").forEach(item => { item.disabled = false; });
          toast(error.message);
        }
      });
    });
  }

  function applyTrump(player, suit) {
    const info = game.chooseTrump(player, suit);
    if (info.cricca) toast(`Cricca di ${playerName(player)}: +3`);
    render();
    return info;
  }

  function showTrickSummary(result) {
    return new Promise(resolve => {
      const number = Math.max(1, Math.min(10, game.trickIndex));
      const leader = result.trick && result.trick.length ? result.trick[0].player : game.leader;
      showModal(`
        <div class="trick-summary">
          <div class="big">Mano ${number}/10</div>
          <div class="line">Ha messo <b>${playerName(leader)}</b></div>
          <div class="line">Prende <b>${playerName(result.winner)}</b></div>
          ${number === 10 ? `<div class="last-trick-bonus">Ultima: +1 a ${teamName(C.teamOf(result.winner))}</div>` : ""}
          <div class="modal-actions"><button id="trickOk" type="button" class="primary-btn">OK</button></div>
        </div>`, "peek trick-peek");
      $("trickOk").addEventListener("click", () => {
        clearTrickFeedback();
        closeModal();
        resolve();
      }, { once: true });
    });
  }

  function scoringCardsHtml(summary, team) {
    const cards = summary.scoringCards?.[team] || [];
    if (!cards.length) return `<div class="taken-cards empty">—</div>`;
    return `<div class="taken-cards">${cards.map(card => `<img src="${C.cardImage(card)}" alt="${C.cardLabel(card)}" title="${C.cardLabel(card)}">`).join("")}</div>`;
  }

  function handSummaryHtml(summary, matchEnded) {
    const winnerTeam = game.matchWinner ?? (game.matchPoints[0] > game.matchPoints[1] ? 0 : 1);
    const ultima0 = summary.lastBonusThirds?.[0] ? "+1" : "—";
    const ultima1 = summary.lastBonusThirds?.[1] ? "+1" : "—";
    const cricca0 = summary.criccaBonusThirds?.[0] ? "+3" : "—";
    const cricca1 = summary.criccaBonusThirds?.[1] ? "+3" : "—";

    return `
      <div class="hand-summary detailed-summary">
        <h2>${matchEnded ? `${teamName(winnerTeam)} vincono` : `Fine mano ${summary.handNumber + 1}`}</h2>
        <div class="summary-briscola"><span>Briscola: <b>${C.SUIT_LABELS[summary.trump]}</b></span><img class="summary-trump-card" src="assets/cards/${summary.trump}_asso.png" alt="Asso di ${C.SUIT_LABELS[summary.trump]}"></div>
        <div class="score-table-wrap">
          <table class="score-table score-table-transposed">
            <thead>
              <tr><th></th><th>Tu + Ginetto</th><th>Tonino + Mario</th></tr>
            </thead>
            <tbody>
              <tr><th>Carte</th><td>${C.formatThirds(summary.cardThirds?.[0] || 0)}</td><td>${C.formatThirds(summary.cardThirds?.[1] || 0)}</td></tr>
              <tr><th>Ultima</th><td>${ultima0}</td><td>${ultima1}</td></tr>
              <tr><th>Cricca</th><td>${cricca0}</td><td>${cricca1}</td></tr>
              <tr class="score-hand-total-row"><th>Totale mano</th><td><b>+${summary.handPoints[0]}</b></td><td><b>+${summary.handPoints[1]}</b></td></tr>
              <tr class="score-match-total-row"><th>Totale partita</th><td><b>${summary.matchPoints[0]}</b></td><td><b>${summary.matchPoints[1]}</b></td></tr>
            </tbody>
          </table>
        </div>
        <div class="captured-grid captured-grid-large">
          <div class="captured-team"><strong>Tu + Ginetto</strong>${scoringCardsHtml(summary, 0)}</div>
          <div class="captured-team"><strong>Tonino + Mario</strong>${scoringCardsHtml(summary, 1)}</div>
        </div>
        <div class="modal-actions">
          ${matchEnded
            ? `<button id="modalNewMatch" type="button" class="primary-btn">Nuova partita</button>`
            : `<button id="modalNextHand" type="button" class="primary-btn">OK</button>`}
        </div>
      </div>`;
  }

  function showHandSummary() {
    if (game.calledOut) {
      showCallOutSummary(game.calledOut);
      return;
    }
    const summary = game.lastHandSummary;
    const matchEnded = game.phase === "match_end";
    showModal(handSummaryHtml(summary, matchEnded), "solid score-modal");

    if (matchEnded) {
      $("modalNewMatch").addEventListener("click", () => { closeModal(); newMatch(); }, { once: true });
      return;
    }

    $("modalNextHand").addEventListener("click", () => {
      closeModal();
      clearTrickFeedback();
      game.nextHand();
      render();
      advanceAI();
    }, { once: true });
  }

  function showCallOutSummary(declaration) {
    const name = playerName(declaration.player);
    const outcome = declaration.correct ? "Chiamata corretta" : "Chiamata sbagliata";
    const score = declaration.declaredPoints;
    showModal(`
      <div class="hand-summary">
        <h2>${teamName(declaration.winnerTeam)} vincono!</h2>
        <p><b>${name}</b> si è chiamato fuori. ${outcome}.</p>
        <p>${teamName(declaration.team)}: <b>${score}</b> punti confermati.</p>
        <p>${teamName(1 - declaration.team)}: <b>${declaration.opponentPoints}</b> punti confermati.</p>
        <div class="modal-actions"><button id="modalNewMatch" type="button" class="primary-btn">Nuova partita</button></div>
      </div>`, "solid score-modal");
    $("modalNewMatch").addEventListener("click", () => {closeModal();newMatch();}, {once:true});
  }

  function finishClaim(declaration) {
    clearTrickFeedback();
    visualTrick = null;
    busy = false;
    render();
    showCallOutSummary(declaration);
  }

  function checkAICallOut() {
    if (!game.canDeclareOut()) return false;
    if (game.shouldAIClaim(1)) {
      finishClaim(game.declareOut(1));
      return true;
    }
    return false;
  }

  async function handleResolvedTrick(result) {
    if (!result.trickResolved) return false;
    visualTrick = result.trick;
    render();
    await sleep(trickSuspenseDelay());
    await showTrickSummary(result);
    visualTrick = null;
    render();
    if (result.handEnded) {
      showHandSummary();
      return true;
    }
    if (checkAICallOut()) return true;
    return false;
  }

  async function evaluateAtPlayTime(player, card) {
    const result = await tutor.evaluateDecision(game, player, card);
    if (els.debugEnabled.checked && !result && !debugFallbackWarned) {
      debugFallbackWarned = true;
      toast("Tutor V14 ONNX non attivo: nessun regret calcolato", 3200);
    }
    return result;
  }

  async function humanPlay(card) {
    if (busy || game.phase !== "play" || game.currentPlayer !== 0) return;
    busy = true;
    render();

    try {
      // Important: Q values are captured BEFORE mutating the game state.
      const tutorResult = await evaluateAtPlayTime(0, card);
      lastTutorResult = tutorResult || null;
      if (els.debugEnabled.checked) debugDecisions[0] = tutorResult || null;

      const result = game.playCard(0, card.id);
      if (result.trickResolved) visualTrick = result.trick;
      game.assertIntegrity();

      render();
      partnerSays(tutorResult);

      await sleep(tutorResult && tutorResult.significant ? Math.max(1050, postCardDelay()) : postCardDelay());
      const stopped = await handleResolvedTrick(result);
      if (stopped) {
        busy = false;
        return;
      }
    } catch (error) {
      console.error(error);
      toast(error.message);
      busy = false;
      render();
      return;
    }

    busy = false;
    render();
    await advanceAI();
  }

  async function advanceAI() {
    if (busy) return;
    busy = true;
    try {
      while (true) {
        render();

        if (game.phase === "trump") {
          if (game.chooser === 0) {
            busy = false;
            render();
            showTrumpChoice();
            return;
          }
          await sleep(aiDelay());
          const chooser = game.chooser;
          const decision = await tutor.chooseTrump(game, chooser, ai[chooser]);
          applyTrump(chooser, decision.suit);
          await sleep(postCardDelay());
          continue;
        }

        if (game.phase !== "play") {
          busy = false;
          render();
          if (game.phase === "hand_end" || game.phase === "match_end") showHandSummary();
          return;
        }

        if (game.currentPlayer === 0) {
          busy = false;
          render();
          return;
        }

        const player = game.currentPlayer;
        await sleep(aiDelay());
        const decision = await tutor.chooseMove(game, player, ai[player]);

        // Debug Q is evaluated on the exact pre-play state, before game.playCard().
        if (els.debugEnabled.checked) {
          debugDecisions[player] = await evaluateAtPlayTime(player, decision.card);
        }

        const result = game.playCard(player, decision.card.id);
        if (result.trickResolved) visualTrick = result.trick;
        game.assertIntegrity();
        render();

        // The next human action is unlocked only after the previous player's
        // card has visibly reached the table. We then stop the AI loop so the
        // later opponents cannot play before the human.
        await waitForPlayedCardAnimation(player, decision.card.id);
        if (!result.trickResolved && game.phase === "play" && game.currentPlayer === 0) {
          busy = false;
          render();
          return;
        }

        const remainingPause = Math.max(0, postCardDelay() - 520);
        if (remainingPause) await sleep(remainingPause);

        const stopped = await handleResolvedTrick(result);
        if (stopped) {
          busy = false;
          return;
        }
      }
    } catch (error) {
      console.error(error);
      busy = false;
      toast(error.message);
      render();
    }
  }

  function newMatch() {
    closeModal();
    visualTrick = null;
    hidePartnerSpeech();
    clearTutor();
    clearDebugDecisions();
    debugFallbackWarned = false;
    game.startMatch();
    render();
    advanceAI();
  }

  els.tutorEnabled.addEventListener("change", () => {
    if (!els.tutorEnabled.checked && !els.debugEnabled.checked) clearTutor();
    render();
  });

  els.profanityEnabled.addEventListener("change", () => {
    // Persist setting in this browser only, safe to disable at any moment.
    try { localStorage.setItem("trionfo-profanity-v8", els.profanityEnabled.checked ? "1" : "0"); } catch (_) {}
    if (!els.profanityEnabled.checked && !els.partnerSpeech.classList.contains("hidden")) hidePartnerSpeech();
  });

  els.callOutBtn.addEventListener("click", () => {
    if (busy || !game.canDeclareOut()) return;
    const confirmed = game.declaredTotal(0);
    const risky = confirmed < 41;
    showModal(`
      <h2>Mi chiamo fuori!</h2>
      <p>${risky ? "Attenzione: la tua squadra non ha ancora 41 punti confermati. Una chiamata sbagliata fa perdere immediatamente." : `Hai almeno ${confirmed} punti confermati. Vuoi dichiarare la vittoria?`}</p>
      <div class="modal-actions">
        <button id="cancelClaim" type="button" class="secondary-btn">Annulla</button>
        <button id="confirmClaim" type="button" class="primary-btn">Mi chiamo fuori</button>
      </div>`, "peek confirm-peek");
    $("cancelClaim").addEventListener("click", closeModal, {once:true});
    $("confirmClaim").addEventListener("click", () => {
      const declaration = game.declareOut(0);
      finishClaim(declaration);
    }, {once:true});
  });

  els.debugEnabled.addEventListener("change", () => {
    clearDebugDecisions();
    debugFallbackWarned = false;
    if (!els.debugEnabled.checked && !els.tutorEnabled.checked) clearTutor();
    render();
  });

  $("newMatchBtn").addEventListener("click", () => {
    showModal(`
      <h2>Nuova partita?</h2>
      <div class="modal-actions">
        <button id="cancelNew" type="button" class="secondary-btn">No</button>
        <button id="confirmNew" type="button" class="primary-btn">Sì</button>
      </div>`, "peek confirm-peek");
    $("cancelNew").addEventListener("click", closeModal, { once: true });
    $("confirmNew").addEventListener("click", newMatch, { once: true });
  });

  try {
    const saved = localStorage.getItem("trionfo-profanity-v8");
    if (saved !== null) els.profanityEnabled.checked = saved === "1";
  } catch (_) {}
  await tutor.init();
  clearTutor();
  clearDebugDecisions();
  render();
  advanceAI();
})();
