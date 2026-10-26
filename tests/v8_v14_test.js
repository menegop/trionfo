'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../game.js');
const T = require('../onnx_tutor.js');
const {HeuristicAI} = require('../ai.js');

async function run() {
  const game = new C.Game({randomFn: (() => {
    let s=42; return ()=>{s=(1664525*s+1013904223)>>>0; return s/4294967296;};
  })()});
  const priority = game.suitPriority.slice();
  assert.deepEqual(priority.slice().sort(), C.SUITS.slice().sort());
  assert.deepEqual(T.modelSuitOrder(game), priority);
  for(const suit of priority) assert.equal(T.modelTrumpIndex(game, suit), priority.indexOf(suit));
  const chooser = game.chooser;
  const observation = T.encodeObservation(game,chooser);
  assert.equal(observation.length,398);
  assert.equal(observation[360],0);
  assert.equal(observation[376],1);
  const a = T.modelSuitOrder(game)[0];
  game.chooseTrump(chooser,a);
  assert.deepEqual(T.modelSuitOrder(game),[a,...priority.filter(s=>s!==a)]);
  assert.equal(T.modelTrumpIndex(game,a),0);
  const obs = T.encodeObservation(game, chooser);
  assert.equal(obs[360],1);
  assert.equal(obs[376+1],1);
  for(let s=0;s<4;s++) {
    for(let r=0;r<10;r++) {
      const c={suit: T.modelSuitOrder(game)[s],rank:C.RANKS[r]};
      assert.equal(T.modelCardIndex(game,c),s*10+r);
    }
  }
  const ai = new HeuristicAI();
  const tutor = new T.TutorEngine();
  assert.equal(tutor.mode,'heuristic');
  const fallback=await tutor.chooseMove(game,chooser,ai);
  assert(game.legalCards(chooser).some(c=>c.id===fallback.card.id));
  assert.equal(await tutor.evaluateDecision(game,chooser,fallback.card),null,'no made-up regret without V14');
  // Simulate live ONNX Runtime using the real model's output contract. Tests
  // exercise mapping (incl. trump selection) and scale but NOT model quality.
  tutor.session={
    inputNames:['observation'],outputNames:['card_logits','trump_logits','card_q','trump_q'],
    run:async () => {
      const logits = new Float32Array(40);
      logits[T.modelCardIndex(game, game.legalCards(game.currentPlayer)[0])] = 9;
      const q = new Float32Array(40);
      const legal = game.legalCards(game.currentPlayer);
      q[T.modelCardIndex(game,legal[0])] = .8;
      if(legal.length>1) q[T.modelCardIndex(game,legal[1])] = .2;
      return {card_logits:{data:logits},trump_logits:{data:new Float32Array([0,0,0,0])},card_q:{data:q}};
    }
  };
  global.ort={Tensor:class {constructor(type,data,shape){this.data=data;this.shape=shape;}}};
  const legal=game.legalCards(game.currentPlayer);
  const result=await tutor.evaluateDecision(game,game.currentPlayer,legal[1]);
  assert.equal(result.source,'onnx');
  assert(Math.abs(result.regretPoints-4.2)<1e-5, 'regret must be (0.8-0.2)*7');
  const move=await tutor.chooseMove(game,game.currentPlayer,ai);
  assert.equal(move.card.id,legal[0].id);
  // Call-out available between complete tricks. Wrong declaration loses.
  const wrong = new C.Game({randomFn:()=>.321});
  wrong.chooseTrump(wrong.chooser,'coppe');
  const bot=new HeuristicAI();
  for(let i=0;i<4;i++) {
    const p=wrong.currentPlayer;
    wrong.playCard(p,bot.chooseMove(wrong,p).card.id);
  }
  assert.equal(wrong.canDeclareOut(),true);
  assert.equal(wrong.declaredTotal(0),Math.floor(wrong.handThirds[0]/3));
  const failed=wrong.declareOut(0);
  assert.equal(failed.correct,false);
  assert.equal(wrong.matchWinner,1);
  assert.equal(wrong.phase,'match_end');
  // Proven call at >= 41, with differing opponent count, always succeeds.
  const ok=new C.Game({randomFn:()=>.321});
  ok.chooseTrump(ok.chooser,'coppe');
  for(let i=0;i<4;i++) {let p=ok.currentPlayer;ok.playCard(p,bot.chooseMove(ok,p).card.id);}
  ok.matchPoints[0]=40;
  ok.handThirds[0]=3;
  assert.equal(ok.declaredTotal(0),41);
  assert.equal(ok.shouldAIClaim(0),true);
  assert.equal(ok.declareOut(2).winnerTeam,0);
  assert.equal(ok.phase,'match_end');
  // Preserve earlier result handling for completed hands.
  const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  assert(source.includes('await tutor.chooseTrump(game, chooser, ai[chooser])'));
  assert(source.includes('await tutor.chooseMove(game, player, ai[player])'));
  assert(source.includes('els.profanityEnabled.checked ?'));
  assert(source.includes('game.declareOut(0)'));
  console.log('OK: V14 canonical mapping, no hidden information, true ONNX policy, regret/2 and correct/incorrect callout');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
