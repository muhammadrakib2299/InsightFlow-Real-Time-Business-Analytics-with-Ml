"""Filesystem-backed model registry.

Models are persisted as `joblib` artifacts at:

    {artifacts_dir}/{workspace_id}/{metric}/{model_kind}__{fitted_at}.pkl

Alongside each artifact we write a `.manifest.json` with a SHA-256 of the
artifact bytes plus training metadata. Loaders refuse to deserialise an
artifact whose hash does not match the manifest — this prevents tampered
models being loaded into the process.

The registry is intentionally simple: nightly retrain writes a new
artifact, /forecast reads the latest. Old artifacts are pruned by a
retention sweep (kept: last 5 per metric).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import structlog

from ..settings import get_settings

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class ArtifactRef:
    workspace_id: str
    metric: str
    model_kind: str
    fitted_at: str
    artifact_path: Path
    manifest_path: Path
    sha256: str
    mape: float | None
    training_window_days: int


def _root() -> Path:
    return Path(get_settings().artifacts_dir)


def _dir_for(workspace_id: str, metric: str) -> Path:
    return _root() / workspace_id / metric


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65_536), b""):
            h.update(chunk)
    return h.hexdigest()


def save(
    workspace_id: str,
    metric: str,
    model_kind: str,
    model: Any,
    training_window_days: int,
    mape: float | None = None,
    extras: dict[str, Any] | None = None,
) -> ArtifactRef:
    target_dir = _dir_for(workspace_id, metric)
    target_dir.mkdir(parents=True, exist_ok=True)
    fitted_at = datetime.now(timezone.utc).isoformat()
    safe_ts = fitted_at.replace(":", "").replace(".", "")
    artifact_path = target_dir / f"{model_kind}__{safe_ts}.pkl"
    manifest_path = artifact_path.with_suffix(".manifest.json")

    joblib.dump(model, artifact_path, compress=3)
    sha = _sha256_of(artifact_path)
    manifest = {
        "workspace_id": workspace_id,
        "metric": metric,
        "model_kind": model_kind,
        "fitted_at": fitted_at,
        "training_window_days": training_window_days,
        "mape": mape,
        "sha256": sha,
        **(extras or {}),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info(
        "registry.saved",
        workspace_id=workspace_id,
        metric=metric,
        model_kind=model_kind,
        path=str(artifact_path),
    )
    return ArtifactRef(
        workspace_id=workspace_id,
        metric=metric,
        model_kind=model_kind,
        fitted_at=fitted_at,
        artifact_path=artifact_path,
        manifest_path=manifest_path,
        sha256=sha,
        mape=mape,
        training_window_days=training_window_days,
    )


def latest(workspace_id: str, metric: str, model_kind: str | None = None) -> ArtifactRef | None:
    d = _dir_for(workspace_id, metric)
    if not d.exists():
        return None
    candidates = sorted(d.glob("*.manifest.json"), reverse=True)
    for m_path in candidates:
        try:
            meta = json.loads(m_path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if model_kind and meta.get("model_kind") != model_kind:
            continue
        art_path = m_path.with_suffix("").with_suffix(".pkl")
        if not art_path.exists():
            continue
        return ArtifactRef(
            workspace_id=meta["workspace_id"],
            metric=meta["metric"],
            model_kind=meta["model_kind"],
            fitted_at=meta["fitted_at"],
            artifact_path=art_path,
            manifest_path=m_path,
            sha256=meta["sha256"],
            mape=meta.get("mape"),
            training_window_days=meta.get("training_window_days", 0),
        )
    return None


def load(ref: ArtifactRef) -> Any:
    actual = _sha256_of(ref.artifact_path)
    if actual != ref.sha256:
        raise RuntimeError(
            f"refusing to load tampered artifact: {ref.artifact_path} "
            f"(manifest sha {ref.sha256[:12]}, actual {actual[:12]})"
        )
    return joblib.load(ref.artifact_path)


def list_models() -> list[ArtifactRef]:
    root = _root()
    if not root.exists():
        return []
    out: list[ArtifactRef] = []
    for m_path in root.rglob("*.manifest.json"):
        try:
            meta = json.loads(m_path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        art_path = m_path.with_suffix("").with_suffix(".pkl")
        if not art_path.exists():
            continue
        out.append(
            ArtifactRef(
                workspace_id=meta["workspace_id"],
                metric=meta["metric"],
                model_kind=meta["model_kind"],
                fitted_at=meta["fitted_at"],
                artifact_path=art_path,
                manifest_path=m_path,
                sha256=meta["sha256"],
                mape=meta.get("mape"),
                training_window_days=meta.get("training_window_days", 0),
            )
        )
    return out
