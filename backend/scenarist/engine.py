"""Scénariste couche 1 (heuristiques déterministes), v0.

Entrée : MatchInfo + événements normalisés. Sortie : chunks MatchScript
continus couvrant tout le match, à l'échelle réelle (1 s sim = 1 s match).

Invariants garantis (testés) :
- les chunks se suivent sans trou ni chevauchement ;
- chaque joueur sur le terrain a une track qui couvre exactement le chunk,
  et sa position en fin de chunk = sa position en début du suivant ;
- le ballon est continu de la même façon ;
- chaque but non annulé par la VAR produit une GOAL_SEQUENCE dont le tir
  du buteur tombe à la minute de l'événement.

Limites v0 assumées : pas de changement de côté à la mi-temps, remplaçant
téléporté à son poste, corners fondus dans les phases de tir synthétiques.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .models import (
    MatchInfo,
    MatchReplayFile,
    MatchScriptChunk,
    NormalizedEvent,
    PlayerTrack,
    ReplayTeamMeta,
    TeamLineup,
    TimedAction,
    TimelineEntry,
    Waypoint,
)
from .normalize import cancel_var_goals

FIELD_X = 52.5
FIELD_Y = 34.0
GOAL_X = 52.8

FILLER_CHUNK = 20.0
GOAL_ATTACK = 16.0
CELEBRATION = 8.0
RESTART = 6.0
PENALTY_SETUP = 12.0
CARD_PAUSE = 10.0
SHOT_PHASE = 14.0

MAX_SPEED = 8.0  # m/s plafond pour tout déplacement généré


def clamp(v: float, lo: float, hi: float) -> float:
    return min(max(v, lo), hi)


def formation_bases(lineup: TeamLineup, is_home: bool) -> dict[int, tuple[float, float]]:
    """Grille tactique : positions de base par joueur depuis formation + grid.

    Lignes x (camp gauche) : GK -49, puis de -38 (défense) à -10 (attaque),
    réparties uniformément. y réparti uniformément dans la ligne.
    L'équipe extérieure est le miroir (x, y → -x, -y).
    """
    lines = [int(n) for n in lineup.formation.split("-")]
    n_lines = len(lines)
    xs = [-49.0] + [
        -38.0 + i * (28.0 / max(n_lines - 1, 1)) for i in range(n_lines)
    ]

    by_line: dict[int, list[tuple[int, int]]] = {}
    for p in lineup.start_xi:
        if p.grid:
            line_s, pos_s = p.grid.split(":")
            by_line.setdefault(int(line_s), []).append((int(pos_s), p.id))
        else:  # pas de grid (rare) : GK ou dernière ligne
            by_line.setdefault(1 if p.pos == "G" else n_lines + 1, []).append((99, p.id))

    bases: dict[int, tuple[float, float]] = {}
    for line, entries in by_line.items():
        entries.sort()
        count = len(entries)
        for idx, (_, pid) in enumerate(entries):
            x = xs[min(line - 1, len(xs) - 1)]
            y = -32.0 + (idx + 1) * (64.0 / (count + 1))
            if not is_home:
                x, y = -x, -y
            bases[pid] = (x, y)
    return bases


@dataclass
class EngineState:
    positions: dict[int, tuple[float, float]] = field(default_factory=dict)
    ball: tuple[float, float] = (0.0, 0.0)
    score: list[int] = field(default_factory=lambda: [0, 0])
    pending_commentary: list[str] = field(default_factory=list)


class Scenarist:
    def __init__(self, match: MatchInfo, events: list[NormalizedEvent], seed: int = 1234):
        self.match = match
        self.raw_events = events  # tous les événements API, avant filtrage VAR
        self.events = cancel_var_goals(events)
        self.rng = random.Random(seed)
        self.chunks: list[MatchScriptChunk] = []

        self.bases: dict[int, tuple[float, float]] = {}
        self.team_of: dict[int, int] = {}
        self.on_pitch: dict[int, list[int]] = {match.home.team_id: [], match.away.team_id: []}
        for lineup, is_home in ((match.home, True), (match.away, False)):
            bases = formation_bases(lineup, is_home)
            self.bases.update(bases)
            for p in lineup.start_xi:
                self.team_of[p.id] = lineup.team_id
                self.on_pitch[lineup.team_id].append(p.id)
            for p in lineup.substitutes:
                self.team_of[p.id] = lineup.team_id

        self.state = EngineState(positions=dict(self.bases))
        # budget de tirs synthétiques = tirs totaux − buts (répartis sur le match)
        goals = [e for e in self.events if e.type == "GOAL"]
        self.shot_budget = {
            tid: max(0, s.total_shots - sum(1 for g in goals if g.team_id == tid))
            for tid, s in match.stats.items()
        }

    # ---------- utilitaires géométrie / continuité ----------

    def _attack_dir(self, team_id: int) -> float:
        return 1.0 if team_id == self.match.home.team_id else -1.0

    def _gk(self, team_id: int) -> int:
        lineup = self.match.home if team_id == self.match.home.team_id else self.match.away
        gk = next(p.id for p in lineup.start_xi if p.pos == "G")
        return gk if gk in self.on_pitch[team_id] else self.on_pitch[team_id][0]

    def _step_toward(self, src: tuple[float, float], dst: tuple[float, float], dt: float) -> tuple[float, float]:
        """Cible atteignable en dt sans dépasser MAX_SPEED*0.85."""
        dx, dy = dst[0] - src[0], dst[1] - src[1]
        dist = (dx * dx + dy * dy) ** 0.5
        max_d = MAX_SPEED * 0.85 * dt
        if dist <= max_d or dist == 0:
            return dst
        k = max_d / dist
        return (src[0] + dx * k, src[1] + dy * k)

    def _ball_at(self, ball_wps: list[Waypoint], t: float) -> tuple[float, float]:
        prev = ball_wps[0]
        for w in ball_wps[1:]:
            if w.t >= t:
                span = w.t - prev.t
                u = (t - prev.t) / span if span > 0 else 0.0
                return (prev.x + (w.x - prev.x) * u, prev.y + (w.y - prev.y) * u)
            prev = w
        return (prev.x, prev.y)

    def _block_tracks(
        self,
        t0: float,
        t1: float,
        ball_wps: list[Waypoint],
        involved: dict[int, list[Waypoint]],
    ) -> dict[str, PlayerTrack]:
        """Tracks de tous les joueurs sur le terrain : les 'involved' ont leurs
        waypoints scriptés, les autres coulissent en bloc vers le ballon."""
        players: dict[str, PlayerTrack] = {}
        n_nodes = max(2, int((t1 - t0) / 6))
        for team_id, ids in self.on_pitch.items():
            for pid in ids:
                if pid in involved:
                    wps = involved[pid]
                else:
                    base = self.bases[pid]
                    is_gk = pid == self._gk(team_id)
                    pos = self.state.positions.get(pid, base)
                    wps = [Waypoint(t=t0, x=pos[0], y=pos[1])]
                    for k in range(1, n_nodes + 1):
                        t = t0 + k * (t1 - t0) / n_nodes
                        bx, by = self._ball_at(ball_wps, t)
                        if is_gk:
                            tx = base[0] + clamp(bx * 0.05, -3, 3)
                            ty = base[1] + clamp(by * 0.2, -3.5, 3.5)
                        else:
                            tx = base[0] + clamp(bx * 0.3, -12, 12) + self.rng.uniform(-3, 3)
                            ty = base[1] + clamp(by * 0.25, -8, 8) + self.rng.uniform(-3, 3)
                        prev = (wps[-1].x, wps[-1].y)
                        nx, ny = self._step_toward(prev, (clamp(tx, -50, 50), clamp(ty, -32, 32)), (t1 - t0) / n_nodes)
                        wps.append(Waypoint(t=t, x=nx, y=ny))
                self.state.positions[pid] = (wps[-1].x, wps[-1].y)
                players[f"p{pid}"] = PlayerTrack(
                    teamId=team_id,
                    waypoints=wps,
                    actions=[],
                    isGoalkeeper=True if pid == self._gk(team_id) else None,
                )
        return players

    def _emit(
        self,
        t0: float,
        t1: float,
        phase: str,
        ball: list[Waypoint],
        involved: dict[int, list[Waypoint]] | None = None,
        actions: dict[int, list[TimedAction]] | None = None,
        commentary: str | None = None,
    ) -> None:
        players = self._block_tracks(t0, t1, ball, involved or {})
        for pid, acts in (actions or {}).items():
            players[f"p{pid}"].actions.extend(acts)
        notes = self.state.pending_commentary
        if notes and commentary is None:
            commentary = " · ".join(notes)
        self.state.pending_commentary = []
        self.state.ball = (ball[-1].x, ball[-1].y)
        self.chunks.append(
            MatchScriptChunk(
                fixtureId=self.match.fixture_id,
                simTimeStart=t0,
                simTimeEnd=t1,
                phase=phase,  # type: ignore[arg-type]
                ball=ball,
                players=players,
                commentary=commentary,
                minute=int(t0 // 60) + 1,
                score=(self.state.score[0], self.state.score[1]),
            )
        )

    # ---------- séquences ----------

    def _kickoff(self, t0: float, team_id: int) -> None:
        d = self._attack_dir(team_id)
        mids = [p for p in self.on_pitch[team_id] if abs(self.bases[p][0]) < 32][:1]
        receiver = mids[0] if mids else self.on_pitch[team_id][1]
        striker = min(
            self.on_pitch[team_id],
            key=lambda p: abs(self.bases[p][0]) if p != self._gk(team_id) else 99,
        )
        rx, ry = self.bases[receiver]
        bx, by = self.state.ball
        t1 = t0 + RESTART + 2
        ball = [
            Waypoint(t=t0, x=bx, y=by),
            Waypoint(t=t0 + RESTART - 1, x=0, y=0),
            Waypoint(t=t0 + RESTART, x=0, y=0),
            Waypoint(t=t1, x=rx, y=ry),
        ]
        sx, sy = self.state.positions.get(striker, self.bases[striker])
        involved = {
            striker: [
                Waypoint(t=t0, x=sx, y=sy),
                Waypoint(t=t0 + RESTART - 1, x=-d * 1.0, y=0.0),
                Waypoint(t=t0 + RESTART, x=-d * 1.0, y=0.0),
                Waypoint(t=t1, x=-d * 3.0, y=1.0),
            ]
        }
        actions = {striker: [TimedAction(t=t0 + RESTART, type="PASS")]}
        self._emit(t0, t1, "RESTART", ball, involved, actions)

    def _possession(self, t0: float, dur: float) -> None:
        """Phase de possession synthétique pondérée par les stats.

        Circulation réaliste : le porteur conduit brièvement le ballon (le
        ballon suit ses pieds), puis passe — la passe est un segment RAPIDE
        (~0,4 s, donc bien plus vif qu'une course), avec parfois un léger
        rebond. Le collectif progresse vers le but adverse.
        """
        home_id = self.match.home.team_id
        away_id = self.match.away.team_id
        p_home = self.match.stats[home_id].possession_pct / 100.0
        team_id = home_id if self.rng.random() < p_home else away_id
        d = self._attack_dir(team_id)

        candidates = [p for p in self.on_pitch[team_id] if p != self._gk(team_id)]
        carriers = self.rng.sample(candidates, k=min(4, len(candidates)))

        t1 = t0 + dur
        bx, by = self.state.ball
        ball = [Waypoint(t=t0, x=bx, y=by)]
        actions: dict[int, list[TimedAction]] = {}

        PASS_TIME = 0.4  # une passe est vive : ~0,4 s quelle que soit la distance
        prev_x, prev_y = bx, by
        t = t0
        n = len(carriers)
        leg = (dur - PASS_TIME) / n
        for i, pid in enumerate(carriers):
            base = self.bases[pid]
            # position du porteur : son poste, légèrement avancé vers le but
            tx = clamp(base[0] + d * self.rng.uniform(2, 8), -50, 50)
            ty = clamp(base[1] + self.rng.uniform(-6, 6), -32, 32)

            # 1) passe RAPIDE (le porteur précédent joue le ballon)
            t_pass = t + PASS_TIME
            long_ball = abs(tx - prev_x) + abs(ty - prev_y) > 22
            if long_ball:  # ballon aérien sur les longues passes
                ball.append(Waypoint(t=(t + t_pass) / 2, x=(prev_x + tx) / 2, y=(prev_y + ty) / 2, z=1.8))
            ball.append(Waypoint(t=t_pass, x=tx, y=ty))
            if i > 0:
                # le passeur précédent déclenche l'animation au départ du ballon
                prev_pid = carriers[i - 1]
                actions.setdefault(prev_pid, []).append(TimedAction(t=t, type="PASS"))

            # 2) conduite de balle : le ballon avance vers le but avec le porteur
            drive_end = t + leg
            dx = clamp(tx + d * self.rng.uniform(3, 9), -50, 50)
            dy = clamp(ty + self.rng.uniform(-4, 4), -32, 32)
            ball.append(Waypoint(t=drive_end, x=dx, y=dy))

            prev_x, prev_y = dx, dy
            t = drive_end

        ball.append(Waypoint(t=t1, x=prev_x, y=prev_y))
        self._emit(t0, t1, "OPEN_PLAY", ball, None, actions)

    def _attack(
        self,
        team_id: int,
        t_shot: float,
        scorer_id: int,
        assist_id: int | None,
        is_goal: bool,
    ) -> None:
        """Construction offensive se terminant par un tir à t_shot exactement."""
        d = self._attack_dir(team_id)
        t0 = t_shot - GOAL_ATTACK
        gk_opp = self._gk(self.match.away.team_id if d > 0 else self.match.home.team_id)

        if assist_id is None or assist_id not in self.on_pitch[team_id]:
            others = [p for p in self.on_pitch[team_id] if p not in (scorer_id, self._gk(team_id))]
            assist_id = self.rng.choice(others)

        shot_y = self.rng.uniform(-4, 4)
        scorer_shot_pos = (d * 43.0, shot_y)
        assist_cross_pos = (d * 38.0, self.rng.choice([-1, 1]) * self.rng.uniform(20, 26))
        goal_target = (d * GOAL_X, self.rng.uniform(-2.5, 2.5) if is_goal else self.rng.uniform(4.5, 8))

        bx, by = self.state.ball
        ball = [
            Waypoint(t=t0, x=bx, y=by),
            Waypoint(t=t0 + 5, x=d * 15.0, y=assist_cross_pos[1] * 0.5),
            Waypoint(t=t0 + 10, x=assist_cross_pos[0], y=assist_cross_pos[1]),
            Waypoint(t=t0 + 13, x=(assist_cross_pos[0] + scorer_shot_pos[0]) / 2, y=(assist_cross_pos[1] + shot_y) / 2, z=3.0),
            Waypoint(t=t0 + 14.5, x=scorer_shot_pos[0], y=shot_y),
            Waypoint(t=t_shot, x=scorer_shot_pos[0], y=shot_y),
            Waypoint(t=t_shot + 0.7, x=goal_target[0], y=goal_target[1], z=0.5),
            Waypoint(t=t_shot + 2 if is_goal else t_shot + 1.5, x=goal_target[0], y=goal_target[1]),
        ]

        sx, sy = self.state.positions.get(scorer_id, self.bases[scorer_id])
        ax, ay = self.state.positions.get(assist_id, self.bases[assist_id])
        involved = {
            scorer_id: [
                Waypoint(t=t0, x=sx, y=sy),
                Waypoint(t=t0 + 10, x=d * 25.0, y=shot_y * 0.5),
                Waypoint(t=t0 + 14.5, x=scorer_shot_pos[0], y=shot_y),
                Waypoint(t=t_shot + 2, x=scorer_shot_pos[0] + d * 1.5, y=shot_y),
            ],
            assist_id: [
                Waypoint(t=t0, x=ax, y=ay),
                Waypoint(t=t0 + 10, x=assist_cross_pos[0], y=assist_cross_pos[1]),
                Waypoint(t=t0 + 11, x=assist_cross_pos[0], y=assist_cross_pos[1]),
                Waypoint(t=t_shot + 2, x=assist_cross_pos[0] - d * 6, y=assist_cross_pos[1] * 0.8),
            ],
        }
        actions = {
            assist_id: [TimedAction(t=t0 + 10.2, type="PASS")],
            scorer_id: [TimedAction(t=t_shot - 0.1, type="SHOOT")],
            gk_opp: [TimedAction(t=t_shot + 0.3, type="GK_DIVE")],
        }
        self._emit(t0, t_shot + 2, "GOAL_SEQUENCE" if is_goal else "OPEN_PLAY", ball, involved, actions)

    def _goal(self, ev: NormalizedEvent) -> None:
        t_shot = ev.sim_time
        is_pen = ev.detail == "Penalty"
        scorer = ev.player_id if ev.player_id in self.on_pitch[ev.team_id] else self.on_pitch[ev.team_id][-1]

        if is_pen:
            d = self._attack_dir(ev.team_id)
            spot = (d * (FIELD_X - 11.0), 0.0)
            t0 = t_shot - PENALTY_SETUP
            gk_opp = self._gk(self.match.away.team_id if d > 0 else self.match.home.team_id)
            bx, by = self.state.ball
            ball = [
                Waypoint(t=t0, x=bx, y=by),
                Waypoint(t=t0 + 4, x=spot[0], y=spot[1]),
                Waypoint(t=t_shot, x=spot[0], y=spot[1]),
                Waypoint(t=t_shot + 0.5, x=d * GOAL_X, y=1.8, z=0.8),
                Waypoint(t=t_shot + 2, x=d * GOAL_X, y=1.8),
            ]
            sx, sy = self.state.positions.get(scorer, self.bases[scorer])
            involved = {
                # marche d'approche calme sur toute la mise en place (jamais un
                # sprint, même si le buteur part de loin)
                scorer: [
                    Waypoint(t=t0, x=sx, y=sy),
                    Waypoint(t=t_shot - 1.5, x=spot[0] - d * 4, y=0.0),
                    Waypoint(t=t_shot, x=spot[0] - d * 0.5, y=0.0),
                    Waypoint(t=t_shot + 2, x=spot[0], y=0.0),
                ]
            }
            actions = {
                scorer: [TimedAction(t=t_shot - 0.1, type="SHOOT")],
                gk_opp: [TimedAction(t=t_shot + 0.2, type="GK_DIVE")],
            }
            self._emit(t0, t_shot + 2, "SET_PIECE", ball, involved, actions,
                       commentary=f"⚽ {ev.minute}e — Penalty pour {self._team_name(ev.team_id)}…")
        else:
            self._attack(ev.team_id, t_shot, scorer, ev.assist_player_id, is_goal=True)

        # score + célébration + engagement adverse
        idx = 0 if ev.team_id == self.match.home.team_id else 1
        self.state.score[idx] += 1
        assist_txt = f", passe décisive de {ev.assist_player_name}" if ev.assist_player_name else ""
        pen_txt = " sur penalty" if is_pen else ""
        self.chunks[-1].commentary = (
            f"⚽ {ev.minute}e — BUT{pen_txt} ! {ev.player_name} ({self._team_name(ev.team_id)}){assist_txt}"
        )
        self.chunks[-1].score = (self.state.score[0], self.state.score[1])

        t_cel0 = self.chunks[-1].simTimeEnd
        d = self._attack_dir(ev.team_id)
        cx, cy = self.state.positions[scorer]
        involved_cel = {
            scorer: [
                Waypoint(t=t_cel0, x=cx, y=cy),
                Waypoint(t=t_cel0 + 2, x=cx + d * 3, y=cy - 4),
                Waypoint(t=t_cel0 + CELEBRATION, x=cx + d * 3, y=cy - 4),
            ]
        }
        ball_cel = [Waypoint(t=t_cel0, x=self.state.ball[0], y=self.state.ball[1]),
                    Waypoint(t=t_cel0 + CELEBRATION, x=self.state.ball[0], y=self.state.ball[1])]
        self._emit(t_cel0, t_cel0 + CELEBRATION, "CELEBRATION", ball_cel, involved_cel,
                   {scorer: [TimedAction(t=t_cel0 + 0.3, type="CELEBRATE")]})

        conceding = self.match.away.team_id if ev.team_id == self.match.home.team_id else self.match.home.team_id
        self._kickoff(self.chunks[-1].simTimeEnd, conceding)

    def _card(self, ev: NormalizedEvent) -> None:
        t0 = ev.sim_time - CARD_PAUSE / 2
        t1 = ev.sim_time + CARD_PAUSE / 2
        offender = ev.player_id if ev.player_id in self.on_pitch[ev.team_id] else None
        bx, by = self.state.ball
        ball = [Waypoint(t=t0, x=bx, y=by), Waypoint(t=t1, x=bx, y=by)]
        actions = {}
        involved = {}
        if offender:
            ox, oy = self.state.positions.get(offender, self.bases[offender])
            # approche vers le ballon bornée en vitesse (le fautif peut être loin)
            ax, ay = self._step_toward((ox, oy), (bx - 1, by), 4.0)
            involved[offender] = [
                Waypoint(t=t0, x=ox, y=oy),
                Waypoint(t=t0 + 4, x=ax, y=ay),
                Waypoint(t=t1, x=ax, y=ay),
            ]
            actions[offender] = [TimedAction(t=t0 + 3.8, type="TACKLE")]
        color = "🔴 Carton rouge" if ev.detail == "Red Card" else "🟨 Carton jaune"
        self._emit(t0, t1, "SET_PIECE", ball, involved, actions,
                   commentary=f"{color} — {ev.player_name} ({self._team_name(ev.team_id)}), {ev.minute}e")
        if ev.detail == "Red Card" and offender:
            self.on_pitch[ev.team_id].remove(offender)

    def _subst(self, ev: NormalizedEvent) -> None:
        out_id, in_id = ev.player_id, ev.assist_player_id
        if out_id in self.on_pitch[ev.team_id] and in_id is not None:
            idx = self.on_pitch[ev.team_id].index(out_id)
            self.on_pitch[ev.team_id][idx] = in_id
            self.bases[in_id] = self.bases[out_id]
            self.state.positions[in_id] = self.bases[in_id]
        self.state.pending_commentary.append(
            f"🔁 {ev.minute}e — Changement ({self._team_name(ev.team_id)}) : "
            f"{ev.assist_player_name} remplace {ev.player_name}"
        )

    def _synthetic_shot(self, t0: float, team_id: int) -> None:
        """Occasion manquée (dérivée des stats de tirs) : attaque + arrêt/raté,
        puis relance du gardien adverse pour la continuité du ballon."""
        shooter = self.rng.choice(
            [p for p in self.on_pitch[team_id] if p != self._gk(team_id)][-4:]
        )
        # l'attaque dure GOAL_ATTACK : le tir tombe exactement à t0 + GOAL_ATTACK
        self._attack(team_id, t0 + GOAL_ATTACK, shooter, None, is_goal=False)
        # le gardien relance (continuité : le ballon repart de sa position)
        gk = self._gk(self.match.away.team_id if self._attack_dir(team_id) > 0 else self.match.home.team_id)
        gx, gy = self.state.positions.get(gk, self.bases[gk])
        t_end = self.chunks[-1].simTimeEnd
        ball = [
            Waypoint(t=t_end, x=self.state.ball[0], y=self.state.ball[1]),
            Waypoint(t=t_end + 3, x=gx, y=gy),
            Waypoint(t=t_end + 4, x=gx, y=gy),
        ]
        self._emit(t_end, t_end + 4, "RESTART", ball, None, {gk: [TimedAction(t=t_end + 4, type="PASS")]})

    def _team_name(self, team_id: int) -> str:
        return self.match.home.name if team_id == self.match.home.team_id else self.match.away.name

    def _build_timeline(self) -> list[TimelineEntry]:
        """Timeline des événements réels (données API brutes) pour le HUD et
        le menu de highlights. Inclut le but annulé VAR (marqué cancelled)."""
        kept_keys = {(e.minute, e.extra_minute, e.type, e.player_id) for e in self.events}
        highlight_types = {"GOAL", "CARD", "SUBST", "VAR"}
        entries: list[TimelineEntry] = []
        for ev in self.raw_events:
            key = (ev.minute, ev.extra_minute, ev.type, ev.player_id)
            cancelled = ev.type == "GOAL" and key not in kept_keys
            entries.append(
                TimelineEntry(
                    simTime=ev.sim_time,
                    minute=ev.minute,
                    extraMinute=ev.extra_minute,
                    type=ev.type,
                    teamId=ev.team_id,
                    teamName=self._team_name(ev.team_id),
                    player=ev.player_name,
                    assist=ev.assist_player_name,
                    detail=ev.detail,
                    comments=ev.comments,
                    isHighlight=ev.type in highlight_types,
                    cancelled=cancelled,
                )
            )
        return entries

    # ---------- timeline ----------

    def _fill_until(self, target: float) -> None:
        cursor = self.chunks[-1].simTimeEnd if self.chunks else 0.0
        while cursor < target - 0.5:
            remaining = target - cursor
            # tir synthétique ? probabilité ∝ budget restant
            total_budget = sum(self.shot_budget.values())
            chunks_left = max(1, int(remaining / FILLER_CHUNK))
            if (
                total_budget > 0
                and remaining > GOAL_ATTACK + 6 + RESTART + 4
                and self.rng.random() < min(0.5, total_budget / max(chunks_left, total_budget))
            ):
                team_id = self.rng.choices(
                    list(self.shot_budget.keys()), weights=[max(w, 0.01) for w in self.shot_budget.values()]
                )[0]
                if self.shot_budget[team_id] > 0:
                    self.shot_budget[team_id] -= 1
                    self._possession(cursor, 6.0)
                    self._synthetic_shot(self.chunks[-1].simTimeEnd, team_id)
                    cursor = self.chunks[-1].simTimeEnd
                    continue
            dur = min(FILLER_CHUNK, remaining)
            if dur < 4:
                dur = remaining
            self._possession(cursor, dur)
            cursor = self.chunks[-1].simTimeEnd

    def run(self) -> MatchReplayFile:
        end_time = self.match.elapsed_minutes * 60.0
        halftime = 45 * 60.0

        self._kickoff(0.0, self.match.home.team_id)
        second_half_done = False

        for ev in self.events:
            if ev.type == "VAR":
                continue  # buts annulés déjà retirés ; autres VAR ignorés v0
            seq_lead = {
                "GOAL": PENALTY_SETUP if ev.detail == "Penalty" else GOAL_ATTACK,
                "CARD": CARD_PAUSE / 2,
                "SUBST": 0.0,
            }[ev.type]
            t_seq_start = ev.sim_time - seq_lead

            if not second_half_done and t_seq_start >= halftime:
                self._fill_until(halftime)
                self._kickoff(halftime, self.match.away.team_id)
                second_half_done = True

            if ev.type == "SUBST":
                self._subst(ev)
                continue

            cursor = self.chunks[-1].simTimeEnd
            if t_seq_start > cursor:
                self._fill_until(t_seq_start)
            if ev.type == "GOAL":
                self._goal(ev)
            elif ev.type == "CARD":
                self._card(ev)

        if not second_half_done:
            self._fill_until(halftime)
            self._kickoff(halftime, self.match.away.team_id)
        self._fill_until(end_time)

        return MatchReplayFile(
            fixtureId=self.match.fixture_id,
            teams=[
                ReplayTeamMeta(id=self.match.home.team_id, name=self.match.home.name, isHome=True),
                ReplayTeamMeta(id=self.match.away.team_id, name=self.match.away.name, isHome=False),
            ],
            duration=self.chunks[-1].simTimeEnd,
            timeline=self._build_timeline(),
            chunks=self.chunks,
        )
