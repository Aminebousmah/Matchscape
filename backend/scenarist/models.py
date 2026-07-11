"""Modèles pydantic du scénariste — miroir strict des types TS du renderer
(frontend/lib/types.ts et matchScript.ts). Le repère terrain est identique :
origine au centre, x ∈ [-52.5, 52.5], y ∈ [-34, 34], z = hauteur ballon.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=False)


EventType = Literal["GOAL", "CARD", "SUBST", "VAR"]
ActionType = Literal["PASS", "SHOOT", "TACKLE", "CELEBRATE", "GK_DIVE"]
MatchPhase = Literal["OPEN_PLAY", "SET_PIECE", "GOAL_SEQUENCE", "RESTART", "CELEBRATION"]


class NormalizedEvent(StrictModel):
    fixture_id: int
    minute: int
    extra_minute: int | None = None
    type: EventType
    team_id: int
    player_id: int | None = None
    player_name: str | None = None
    assist_player_id: int | None = None
    assist_player_name: str | None = None
    detail: str | None = None
    comments: str | None = None

    @property
    def sim_time(self) -> float:
        """Seconde de match simulé correspondant à la minute de l'événement."""
        extra = self.extra_minute or 0
        return (self.minute + extra) * 60.0 - 30.0


class LineupPlayer(StrictModel):
    id: int
    name: str
    number: int
    pos: Literal["G", "D", "M", "F"]
    grid: str | None = None  # "ligne:position", ex "2:3"


class TeamLineup(StrictModel):
    team_id: int
    name: str
    formation: str  # ex "4-3-3"
    start_xi: list[LineupPlayer]
    substitutes: list[LineupPlayer]


class TeamStats(StrictModel):
    team_id: int
    possession_pct: float
    total_shots: int
    shots_on_goal: int
    corners: int


class MatchInfo(StrictModel):
    fixture_id: int
    home: TeamLineup
    away: TeamLineup
    stats: dict[int, TeamStats]  # par team_id
    final_score: tuple[int, int]
    elapsed_minutes: int


# --- Sortie : MatchScript (miroir de frontend/lib/matchScript.ts) ---


class Waypoint(StrictModel):
    t: float
    x: float
    y: float
    z: float | None = None


class TimedAction(StrictModel):
    t: float
    type: ActionType


class PlayerTrack(StrictModel):
    teamId: int
    waypoints: list[Waypoint]
    actions: list[TimedAction]
    isGoalkeeper: bool | None = None


class MatchScriptChunk(StrictModel):
    fixtureId: int
    simTimeStart: float
    simTimeEnd: float
    phase: MatchPhase
    ball: list[Waypoint]
    players: dict[str, PlayerTrack]
    commentary: str | None = None
    # Extensions renderer (HUD) — absentes du schéma CLAUDE.md initial
    minute: int | None = None
    score: tuple[int, int] | None = None


class ReplayTeamMeta(StrictModel):
    id: int
    name: str
    isHome: bool


class MatchReplayFile(StrictModel):
    """Format du fichier consommé par le renderer (public/demo/match.json)."""

    fixtureId: int
    teams: list[ReplayTeamMeta]
    duration: float
    chunks: list[MatchScriptChunk]
