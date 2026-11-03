#!/usr/bin/env python3
"""Train a separate image classifier on Voxel51 ASL-MNIST.

The Hugging Face Parquet `label` column is not authoritative: it reflects generated
folder IDs. This script joins each image path to `samples.json`'s FiftyOne
`ground_truth.label` and `train`/`test` tags. It writes a PyTorch checkpoint,
ONNX model, class metadata, and test metrics under public/model/.

Install dependencies with: python3 -m pip install -r requirements-aslmnist.txt
Run: python3 scripts/train-aslmnist.py
"""
from __future__ import annotations

import argparse
import io
import json
import random
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "raw" / "asl-mnist"
DEFAULT_OUT = ROOT / "public" / "model"
FILES = {
    "train.parquet": "https://huggingface.co/datasets/Voxel51/American-Sign-Language-MNIST/resolve/main/train.parquet",
    "test.parquet": "https://huggingface.co/datasets/Voxel51/American-Sign-Language-MNIST/resolve/main/test.parquet",
    "samples.json": "https://huggingface.co/datasets/Voxel51/American-Sign-Language-MNIST/resolve/main/samples.json",
}
CLASSES = list("ABCDEFGHI") + list("KLMNOPQRSTUVWXY")


class AslMnistNet(nn.Module):
    """Small 28x28 grayscale CNN suitable for a compact browser model."""
    def __init__(self, n_classes: int = len(CLASSES)):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=3, padding=1), nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(16, 32, kernel_size=3, padding=1), nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 32, kernel_size=3, padding=1), nn.ReLU(inplace=True),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(32 * 7 * 7, 128), nn.ReLU(inplace=True), nn.Dropout(0.20),
            nn.Linear(128, n_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x))


def fetch_missing(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        path = data_dir / name
        if not path.exists():
            print(f"Downloading {name} from Voxel51/Hugging Face…", flush=True)
            urllib.request.urlretrieve(url, path)


def label_index(data_dir: Path) -> dict[tuple[str, str], int]:
    annotations = json.loads((data_dir / "samples.json").read_text())["samples"]
    mapping: dict[tuple[str, str], int] = {}
    for sample in annotations:
        split = next((tag for tag in sample.get("tags", []) if tag in ("train", "test")), None)
        label = sample.get("ground_truth", {}).get("label")
        filename = Path(sample.get("filepath", "")).name
        if split and label in CLASSES and filename:
            key = (split, filename)
            if key in mapping:
                raise ValueError(f"Duplicate FiftyOne annotation for {key}")
            mapping[key] = CLASSES.index(label)
    return mapping


def load_split(data_dir: Path, split: str, mapping: dict[tuple[str, str], int]):
    table = pq.read_table(data_dir / f"{split}.parquet")
    images = table["image"].to_pylist()
    xs = np.empty((len(images), 1, 28, 28), dtype=np.float32)
    ys = np.empty(len(images), dtype=np.int64)
    missed = []
    for i, row in enumerate(images):
        path = row["path"]
        key = (split, Path(path).name)
        if key not in mapping:
            missed.append(path)
            continue
        image = Image.open(io.BytesIO(row["bytes"])).convert("L")
        if image.size != (28, 28):
            raise ValueError(f"Expected 28x28 image, got {image.size} for {path}")
        xs[i, 0] = np.asarray(image, dtype=np.float32) / 255.0
        ys[i] = mapping[key]
    if missed:
        raise ValueError(f"{split}: {len(missed)} Parquet images lack FiftyOne labels; e.g. {missed[:3]}")
    return xs, ys


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device):
    model.eval()
    total_loss = 0.0
    total = 0
    correct = 0
    conf = np.zeros((len(CLASSES), len(CLASSES)), dtype=np.int64)
    loss_fn = nn.CrossEntropyLoss()
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            total_loss += loss_fn(logits, y).item() * len(y)
            pred = logits.argmax(1)
            total += len(y)
            correct += int((pred == y).sum().item())
            for true, guess in zip(y.cpu().numpy(), pred.cpu().numpy()):
                conf[int(true), int(guess)] += 1
    per_class = {
        letter: float(conf[i, i] / max(1, conf[i].sum()))
        for i, letter in enumerate(CLASSES)
    }
    return total_loss / total, correct / total, conf, per_class


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1:
        raise ValueError("epochs and batch-size must be positive")

    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    torch.set_num_threads(args.threads)
    fetch_missing(args.data_dir)
    mapping = label_index(args.data_dir)
    print(f"FiftyOne annotations: {len(mapping)} labeled image paths; classes={CLASSES}", flush=True)
    x_train, y_train = load_split(args.data_dir, "train", mapping)
    x_test, y_test = load_split(args.data_dir, "test", mapping)
    print(f"train={len(y_train)} test={len(y_test)}", flush=True)
    print("train labels:", dict(sorted(Counter(CLASSES[i] for i in y_train).items())), flush=True)

    # A stratified 10% validation subset is drawn only from the official training split.
    rng = np.random.default_rng(42)
    train_idx, val_idx = [], []
    for cls in range(len(CLASSES)):
        idx = np.flatnonzero(y_train == cls)
        rng.shuffle(idx)
        n_val = max(1, round(len(idx) * 0.1))
        val_idx.extend(idx[:n_val])
        train_idx.extend(idx[n_val:])
    rng.shuffle(train_idx)
    rng.shuffle(val_idx)
    tensor = lambda a: torch.from_numpy(a)
    train_ds = TensorDataset(tensor(x_train[train_idx]), tensor(y_train[train_idx]))
    val_ds = TensorDataset(tensor(x_train[val_idx]), tensor(y_train[val_idx]))
    test_ds = TensorDataset(tensor(x_test), tensor(y_test))
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    device = torch.device("cpu")
    model = AslMnistNet().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=2)
    loss_fn = nn.CrossEntropyLoss()
    best_val = -1.0
    best_state = None
    for epoch in range(1, args.epochs + 1):
        model.train()
        loss_sum, seen = 0.0, 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = loss_fn(logits, y)
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * len(y)
            seen += len(y)
        val_loss, val_acc, _, _ = evaluate(model, val_loader, device)
        scheduler.step(val_loss)
        print(f"epoch {epoch:02d}/{args.epochs}: train_loss={loss_sum/seen:.4f} val_loss={val_loss:.4f} val_top1={val_acc*100:.2f}%", flush=True)
        if val_acc > best_val:
            best_val = val_acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    if best_state is None:
        raise RuntimeError("Training did not produce a checkpoint")
    model.load_state_dict(best_state)
    test_loss, test_acc, confusion, per_class = evaluate(model, test_loader, device)
    top3_hits = 0
    model.eval()
    with torch.no_grad():
        for x, y in test_loader:
            top3_hits += int((model(x).topk(3, dim=1).indices == y[:, None]).any(dim=1).sum().item())
    top3 = top3_hits / len(test_ds)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "asl-mnist.pt"
    torch.save({"state_dict": model.state_dict(), "classes": CLASSES}, checkpoint_path)
    onnx_path = args.output_dir / "asl-mnist.onnx"
    torch.onnx.export(
        model, torch.zeros(1, 1, 28, 28), onnx_path,
        input_names=["image"], output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    metrics = {
        "dataset": "Voxel51/American-Sign-Language-MNIST",
        "labels_source": "FiftyOne samples.json ground_truth.label joined to Parquet image path and train/test tag",
        "classes": CLASSES,
        "train_samples": int(len(y_train)), "official_test_samples": int(len(y_test)),
        "validation_samples": int(len(val_idx)), "test_loss": test_loss,
        "test_top1": test_acc, "test_top3": top3, "best_validation_top1": best_val,
        "per_class_test_accuracy": per_class,
        "confusion_matrix": confusion.tolist(), "onnx_file": onnx_path.name,
    }
    (args.output_dir / "asl-mnist-metrics.json").write_text(json.dumps(metrics, indent=2))
    (args.output_dir / "asl-mnist-labels.json").write_text(json.dumps({"classes": CLASSES, "input": "float32 grayscale [N,1,28,28], pixel values 0..1"}, indent=2))
    print(f"official test: top-1 {test_acc*100:.2f}%, top-3 {top3*100:.2f}% on {len(y_test)} images", flush=True)
    print("weakest classes:", ", ".join(f"{k} {v*100:.1f}%" for k, v in sorted(per_class.items(), key=lambda item: item[1])[:6]), flush=True)
    print(f"wrote {checkpoint_path}, {onnx_path}, and asl-mnist-metrics.json", flush=True)


if __name__ == "__main__":
    main()
