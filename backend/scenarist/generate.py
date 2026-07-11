"""Génère le fichier de rejeu consommé par le renderer.

Usage (depuis backend/) :
    python -m scenarist.generate --fixture tests/fixtures/fixture_1234567 \
        --out ../frontend/public/demo/match.json
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .engine import Scenarist
from .normalize import load_match


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True, help="dossier de payloads API-Football")
    parser.add_argument("--out", required=True, help="chemin du match.json de sortie")
    parser.add_argument("--seed", type=int, default=1234)
    args = parser.parse_args()

    info, events = load_match(Path(args.fixture))
    replay = Scenarist(info, events, seed=args.seed).run()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(replay.model_dump_json(exclude_none=True), encoding="utf-8")

    goals = sum(1 for c in replay.chunks if c.phase == "GOAL_SEQUENCE")
    print(
        f"{out} : {len(replay.chunks)} chunks, {replay.duration:.0f}s, "
        f"{goals} séquences de but, score final {replay.chunks[-1].score}"
    )


if __name__ == "__main__":
    main()
