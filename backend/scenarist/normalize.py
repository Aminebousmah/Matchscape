"""Normalisation des payloads API-Football v3 vers les modèles internes.

Entrées : les JSON bruts des endpoints /fixtures, /fixtures/events,
/fixtures/lineups, /fixtures/statistics (enregistrés tels quels dans
tests/fixtures/). Ne jamais retravailler ces fichiers : toute adaptation
se fait ici.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import (
    LineupPlayer,
    MatchInfo,
    NormalizedEvent,
    TeamLineup,
    TeamStats,
)

_EVENT_TYPES = {"Goal": "GOAL", "Card": "CARD", "subst": "SUBST", "Var": "VAR"}


def _load(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("errors"):
        raise ValueError(f"{path.name}: API errors {payload['errors']}")
    return payload["response"]


def normalize_events(events_payload: list[dict[str, Any]], fixture_id: int) -> list[NormalizedEvent]:
    out: list[NormalizedEvent] = []
    for raw in events_payload:
        api_type = raw["type"]
        if api_type not in _EVENT_TYPES:
            continue  # types inconnus ignorés (l'API en ajoute parfois)
        out.append(
            NormalizedEvent(
                fixture_id=fixture_id,
                minute=raw["time"]["elapsed"],
                extra_minute=raw["time"]["extra"],
                type=_EVENT_TYPES[api_type],  # type: ignore[arg-type]
                team_id=raw["team"]["id"],
                player_id=raw["player"]["id"],
                player_name=raw["player"]["name"],
                assist_player_id=raw["assist"]["id"],
                assist_player_name=raw["assist"]["name"],
                detail=raw.get("detail"),
                comments=raw.get("comments"),
            )
        )
    out.sort(key=lambda e: e.sim_time)
    return out


def cancel_var_goals(events: list[NormalizedEvent]) -> list[NormalizedEvent]:
    """Supprime les buts annulés par la VAR (et l'événement VAR associé).

    En live (phase 2), ceci deviendra un rollback de chunks ; en replay on
    peut simplement ne jamais jouer le but annulé.
    """
    cancelled: set[int] = set()
    for i, ev in enumerate(events):
        if ev.type == "VAR" and ev.detail == "Goal cancelled":
            for j in range(i - 1, -1, -1):
                prev = events[j]
                if (
                    prev.type == "GOAL"
                    and prev.team_id == ev.team_id
                    and (prev.player_id == ev.player_id or ev.player_id is None)
                    and ev.sim_time - prev.sim_time < 6 * 60
                ):
                    cancelled.add(j)
                    cancelled.add(i)
                    break
    return [e for i, e in enumerate(events) if i not in cancelled]


def normalize_lineup(raw: dict[str, Any]) -> TeamLineup:
    def player(entry: dict[str, Any]) -> LineupPlayer:
        p = entry["player"]
        return LineupPlayer(id=p["id"], name=p["name"], number=p["number"], pos=p["pos"], grid=p["grid"])

    return TeamLineup(
        team_id=raw["team"]["id"],
        name=raw["team"]["name"],
        formation=raw["formation"],
        start_xi=[player(e) for e in raw["startXI"]],
        substitutes=[player(e) for e in raw["substitutes"]],
    )


def normalize_stats(raw: dict[str, Any]) -> TeamStats:
    values: dict[str, Any] = {s["type"]: s["value"] for s in raw["statistics"]}

    def pct(v: Any) -> float:
        return float(str(v).rstrip("%")) if v is not None else 50.0

    def num(v: Any) -> int:
        return int(v) if v is not None else 0

    return TeamStats(
        team_id=raw["team"]["id"],
        possession_pct=pct(values.get("Ball Possession")),
        total_shots=num(values.get("Total Shots")),
        shots_on_goal=num(values.get("Shots on Goal")),
        corners=num(values.get("Corner Kicks")),
    )


def load_match(fixture_dir: Path) -> tuple[MatchInfo, list[NormalizedEvent]]:
    """Charge un dossier de fixtures enregistrées → (MatchInfo, événements)."""
    fixture = _load(fixture_dir / "fixture.json")[0]
    fixture_id = fixture["fixture"]["id"]
    home_id = fixture["teams"]["home"]["id"]

    lineups = [normalize_lineup(r) for r in _load(fixture_dir / "lineups.json")]
    home = next(l for l in lineups if l.team_id == home_id)
    away = next(l for l in lineups if l.team_id != home_id)

    stats = {s.team_id: s for s in (normalize_stats(r) for r in _load(fixture_dir / "statistics.json"))}

    events = normalize_events(_load(fixture_dir / "events.json"), fixture_id)

    info = MatchInfo(
        fixture_id=fixture_id,
        home=home,
        away=away,
        stats=stats,
        final_score=(fixture["goals"]["home"], fixture["goals"]["away"]),
        elapsed_minutes=fixture["fixture"]["status"]["elapsed"],
    )
    return info, events
