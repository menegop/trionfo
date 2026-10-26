"""Export a frozen V14 belief-conditioned policy + Q network for the browser.

Run from the Trionfo project root. No network training and no checkpoint mutation.
  python export_v14_onnx.py --checkpoint checkpoints_v14_epsilon_v3/best.pt \
      --out trionfo_github_pages_pwa/models/trionfo_v14.onnx
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import torch
from torch import nn

from trionfo.models.belief_v14 import BeliefPolicyNetV14

OPSET = 17
OUTPUTS = [
    "card_logits", "trump_logits", "value", "card_q", "trump_q",
    "belief_card_probs", "belief_suit_count_probs", "belief_void_probs",
]


class BrowserV14(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, observation):
        result = self.model(observation)
        belief = result["belief"]
        return (
            result["card_logits"], result["trump_logits"], result["value"],
            result["q_values"][:, :40], result["q_values"][:, 40:44],
            belief["card_probs"], belief["suit_count_probs"], belief["void_probs"],
        )


def sha256_file(path):
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for part in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(part)
    return sha.hexdigest()


def load_model(checkpoint):
    # Checkpoints come from local trusted training, not arbitrary downloads.
    payload = torch.load(str(checkpoint), map_location="cpu", weights_only=False)
    if not isinstance(payload, dict) or "model" not in payload:
        raise RuntimeError("Il checkpoint V14 non contiene 'model'.")
    fmt = payload.get("format_version", -1)
    if fmt not in (1403, 1404):
        raise RuntimeError(f"Formato checkpoint inatteso: {fmt}, previsti 1403 o 1404")
    cfg = payload.get("model_config", {})
    model = BeliefPolicyNetV14(
        input_size=int(cfg.get("input_size", 398)),
        width=int(cfg.get("width", 256)),
        blocks=int(cfg.get("blocks", 4)),
        belief_width=int(cfg.get("belief_width", 64)),
    ).cpu().eval()
    model.load_state_dict(payload["model"], strict=True)
    return BrowserV14(model).eval(), payload


def verify(path, wrapper):
    import onnx
    graph = onnx.load(str(path))
    onnx.checker.check_model(graph)
    import onnxruntime as ort
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    if session.get_inputs()[0].name != "observation":
        raise RuntimeError("Nome input ONNX scorretto")
    actual_names = [x.name for x in session.get_outputs()]
    if actual_names != OUTPUTS:
        raise RuntimeError(f"Nomi output ONNX inattesi: {actual_names}")
    rng = np.random.default_rng(987)
    # Use a valid 398-long float32 input, including nontrivial network branches.
    obs = rng.normal(0, 0.15, size=(1, 398)).astype("float32")
    obs[:, 360:364] = 0
    obs[:, 360] = 1
    obs[:, 364:368] = 0
    obs[:, 364] = 1
    obs[:, 368:372] = 0
    obs[:, 368] = 1
    obs[:, 372:376] = 0
    obs[:, 372] = 1
    obs[:, 376:379] = 0
    obs[:, 377] = 1
    obs[:, :360] = 0
    with torch.no_grad():
        expected = wrapper(torch.from_numpy(obs))
    actual = session.run(None, {"observation": obs})
    errors = {name: float(np.max(np.abs(got - ref.detach().numpy())))
              for name, got, ref in zip(OUTPUTS, actual, expected)}
    worst = max(errors.values())
    print("ONNX checker OK; errore massimo PyTorch/ONNX Runtime:", f"{worst:.7g}")
    if not np.isfinite(worst) or worst > 2e-4:
        raise RuntimeError(f"Export non equivalente a PyTorch: errore {worst}")
    return errors


def main():
    parser = argparse.ArgumentParser(description="Export ONNX Player+Tutor V14")
    parser.add_argument("--checkpoint", default="checkpoints_v14_epsilon_v3/best.pt")
    parser.add_argument("--out", default="trionfo_browser_game_v8_v14/models/trionfo_v14.onnx")
    args = parser.parse_args()
    for pkg in ("onnx", "onnxruntime"):
        try:
            __import__(pkg)
        except ImportError as exc:
            raise RuntimeError(f"Manca {pkg}: .venv\\Scripts\\python.exe -m pip install onnx onnxruntime") from exc
    ckpt = Path(args.checkpoint).resolve()
    if not ckpt.is_file():
        raise FileNotFoundError(f"Checkpoint non trovato: {ckpt}")
    output = Path(args.out).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    wrapper, payload = load_model(ckpt)
    dummy = torch.zeros(1, 398, dtype=torch.float32)
    print("Checkpoint:", ckpt)
    print("Ciclo V14:", payload.get("local_cycle", payload.get("cycle", "?")))
    print("Export:", output)
    with torch.no_grad():
        torch.onnx.export(
            wrapper, dummy, str(output), export_params=True, opset_version=OPSET,
            input_names=["observation"], output_names=OUTPUTS,
            # Static batch=1: V14 model uses int(observation.shape[0]) in
            # its belief path, so declaring symbolic batch axes would be unsafe.
            do_constant_folding=True, dynamo=False,
        )
    errors = verify(output, wrapper)
    metadata = {
        "model": "BeliefPolicyNetV14", "checkpoint": str(ckpt),
        "checkpoint_sha256": sha256_file(ckpt), "onnx_sha256": sha256_file(output),
        "format_version": payload.get("format_version"),
        "v3_cycle": payload.get("local_cycle", payload.get("cycle")),
        "global_cycle": payload.get("global_cycle"),
        "model_config": payload.get("model_config"),
        "opset": OPSET, "input": "observation[1,398]", "outputs": OUTPUTS,
        "suit_encoding": "BEFORE trump use a stable priority permutation; AFTER trump model suit 0 is trump and other suits follow stable priority order",
        "card_encoding": "model_card_id = model_suit_index*10 + rank; rank=3,2,Asso,Re,Cavallo,Fante,7,6,5,4",
        "q_scale": "Q is normalized final HAND score differential; expected team-points regret = (maxQ - chosenQ)*14/2",
        "max_abs_error": errors,
    }
    meta_path = output.with_suffix(".json")
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print("OK:", output)
    print("Metadata:", meta_path)
    print("Dimensione MB:", round(output.stat().st_size / 1024**2, 2))
    print("Nota: per funzionare nel browser serve anche ONNX Runtime Web (installer incluso).")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERRORE:", e, file=sys.stderr)
        raise
