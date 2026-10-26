# Modello V14 per il sito

Il browser usa un SOLO modello per la Policy degli avversari e il Tutor:
`models/trionfo_v14.onnx`.

Esportalo dal checkpoint con `EXPORT_V14_ONNX.bat`, posizionando sia lo script
che la cartella `trionfo_browser_game_v8_v14` nella radice del progetto Trionfo.

L'ONNX deve esporre input `observation` float32 [N,398] e output:
`card_logits`, `trump_logits`, `value`, `card_q`, `trump_q`,
`belief_card_probs`, `belief_suit_count_probs`, `belief_void_probs`.

REGOLA FONDAMENTALE: il modello V14 usa la codifica canonica V12. La permutazione
dei semi cambia tra mani, ma resta stabile nell'intera mano. Dopo la scelta,
lo slot 0 e' SEMPRE la briscola; prima della scelta i 4 slot seguono la
permutazione iniziale. Indici carte = slot_seme*10 + rango.

Il Q e' il differenziale atteso, normalizzato /14. Il regret in punti per la
squadra del giocatore e' `(max_legal_Q - Q_scelta) * 14 / 2`.

ATTENZIONE: `vendor/ort.wasm.min.js` incluso inizialmente e' un segnaposto.
Esegui `INSTALL_ONNX_WEB.bat` per installare i binari ufficiali di
ONNX Runtime Web 1.20.1. La barra di stato nel sito deve dire
`V14 ONNX attiva · Policy + Tutor`.

Se il sito mostra `V14 non attiva`, le IA ricadono sulle euristiche ma il
Tutor NON inventa Q/regret: quei valori rimangono assenti.
