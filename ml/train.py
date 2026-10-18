"""Trains the Tressette bot's network on self-play data from `npm run selfplay`.

The network looks at one seat's view (src/engine/ml/encode.ts) and predicts, for every card, the score the Stats
bot gave it (the thirds our team ends the hand with minus theirs) relative to the average legal card. The bot then
plays the legal card it scores highest. Learning scores rather than only the chosen card tells the network how much better one card is than
another, which teaches it far more per position.

Usage (from ml/):  .venv/bin/python train.py --data 'data/2p-hard-*' --out ../src/engine/ml/weights-2p.json
"""

import argparse
import base64
import glob
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

Q_SCALE = 10.0  # scores are in thirds (about -35..35); the network predicts them divided by this


def load(pattern: str):
    """Every run matching `pattern`, split into train and validation by run so their hands never overlap."""
    runs = sorted(Path(p) for p in glob.glob(pattern) if (Path(p) / "meta.json").exists())
    if not runs:
        raise SystemExit(f"No runs match {pattern!r}")
    parts = []
    for run in runs:
        meta = json.loads((run / "meta.json").read_text())
        n, f, a = meta["rows"], meta["features"], meta["actions"]
        # A run still being written may have more rows on disk than meta.json reports: keep only the counted ones.
        x = np.fromfile(run / "x.f32", dtype=np.float32, count=n * f).reshape(n, f)
        mask = np.fromfile(run / "mask.u8", dtype=np.uint8, count=n * a).reshape(n, a).astype(bool)
        q = np.fromfile(run / "q.f32", dtype=np.float32, count=n * a).reshape(n, a)
        # Only how the cards compare matters for choosing one, so learn each card's score relative to the average
        # legal card: the rest ("how good is this hand") is noise for this purpose.
        q = np.where(mask, q - (q * mask).sum(1, keepdims=True) / mask.sum(1, keepdims=True), 0).astype(np.float32)
        parts.append((x, mask, q))
        print(f"  {run}: {n} rows")
    val = parts[-1] if len(parts) > 1 else tuple(p[-len(p) // 10 :] for p in parts[0])
    train = parts[:-1] if len(parts) > 1 else [tuple(p[: -len(p) // 10] for p in parts[0])]
    cat = lambda ps: tuple(np.concatenate([p[i] for p in ps]) for i in range(3))
    return cat(train), val, meta


class QNet(nn.Module):
    def __init__(self, features: int, actions: int, hidden: int, layers: int):
        super().__init__()
        sizes = [features] + [hidden] * layers
        blocks = []
        for i, o in zip(sizes, sizes[1:]):
            blocks += [nn.Linear(i, o), nn.ReLU()]
        self.body = nn.Sequential(*blocks, nn.Linear(sizes[-1], actions))

    def forward(self, x):
        return self.body(x)


def evaluate(net, x, mask, q, device):
    """Loss, how often the network picks the Stats bot's card, and how much score its picks give up on average."""
    net.eval()
    with torch.no_grad():
        x, mask, q = (torch.from_numpy(a).to(device) for a in (x, mask, q))
        pred = net(x) * Q_SCALE
        loss = (((pred - q) ** 2) * mask).sum() / mask.sum()
        neg = torch.tensor(-1e9, device=device)
        pick = torch.where(mask, pred, neg).argmax(1)
        best = torch.where(mask, q, neg)
        agree = (pick == best.argmax(1)).float().mean()
        regret = (best.max(1).values - q.gather(1, pick[:, None])[:, 0]).mean()
    net.train()
    return loss.item(), agree.item(), regret.item()


def b64(a) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode()


def export(net: QNet, meta: dict, sample: np.ndarray, path: Path):
    """Weights as base64 float32 for src/engine/ml/mlp.ts: each layer's weight row-major as [out][in], then bias.

    Also stores one input and the scores PyTorch gives it, so the TypeScript side can check it computes the same.
    """
    net.eval()
    with torch.no_grad():
        expected = (net(torch.from_numpy(sample[None]).to(next(net.parameters()).device)) * Q_SCALE)[0].cpu().numpy()
    layers = []
    for m in net.body:
        if isinstance(m, nn.Linear):
            w = m.weight.detach().cpu().numpy()
            layers.append({"in": w.shape[1], "out": w.shape[0], "w": b64(w), "b": b64(m.bias.detach().cpu().numpy())})
    check = {"x": b64(sample), "y": b64(expected)}
    weights = {"players": meta["players"], "features": meta["features"], "scale": Q_SCALE, "layers": layers, "check": check}
    path.write_text(json.dumps(weights))
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data/2p-hard-*")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--hidden", type=int, default=256)
    p.add_argument("--layers", type=int, default=2)
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=512)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()

    torch.manual_seed(args.seed)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print("loading")
    (x, mask, q), val, meta = load(args.data)
    print(f"{len(x)} training rows, {len(val[0])} validation rows, {x.shape[1]} features, on {device}")

    net = QNet(x.shape[1], mask.shape[1], args.hidden, args.layers).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)
    tx, tmask, tq = (torch.from_numpy(a).to(device) for a in (x, mask, q / Q_SCALE))

    best_regret, best_state = float("inf"), None
    for epoch in range(args.epochs):
        started = time.time()
        order = torch.randperm(len(tx), device=device)
        total = 0.0
        for i in range(0, len(order), args.batch):
            idx = order[i : i + args.batch]
            m = tmask[idx]
            # Only legal cards have a score to learn.
            loss = (((net(tx[idx]) - tq[idx]) ** 2) * m).sum() / m.sum()
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        sched.step()
        vloss, agree, regret = evaluate(net, *val, device)
        print(
            f"epoch {epoch + 1:2d}  train {total / len(tx) * Q_SCALE**2:6.2f}  val {vloss:6.2f}  "
            f"same card {agree:.1%}  regret {regret:.2f} thirds  ({time.time() - started:.1f}s)"
        )
        if regret < best_regret:
            best_regret, best_state = regret, {k: v.clone() for k, v in net.state_dict().items()}

    net.load_state_dict(best_state)
    print(f"best validation regret {best_regret:.2f} thirds")
    export(net, meta, val[0][0], args.out)


if __name__ == "__main__":
    main()
