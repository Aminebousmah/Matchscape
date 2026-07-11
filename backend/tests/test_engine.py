import math
from pathlib import Path

import pytest

from scenarist.engine import Scenarist
from scenarist.normalize import load_match

FIXTURE = Path(__file__).parent / "fixtures" / "fixture_1234567"


@pytest.fixture(scope="module")
def replay():
    info, events = load_match(FIXTURE)
    return Scenarist(info, events, seed=1234).run()


def test_deterministic():
    info, events = load_match(FIXTURE)
    a = Scenarist(info, events, seed=1234).run()
    b = Scenarist(info, events, seed=1234).run()
    assert a.model_dump() == b.model_dump()


def test_chunks_contiguous(replay):
    assert replay.chunks[0].simTimeStart == 0.0
    for prev, cur in zip(replay.chunks, replay.chunks[1:]):
        assert math.isclose(prev.simTimeEnd, cur.simTimeStart, abs_tol=1e-6), (
            f"trou/chevauchement entre {prev.simTimeEnd} et {cur.simTimeStart}"
        )
    assert replay.duration >= 90 * 60


def test_tracks_cover_chunk_and_are_continuous(replay):
    last_pos: dict[str, tuple[float, float]] = {}
    for chunk in replay.chunks:
        for pid, track in chunk.players.items():
            wps = track.waypoints
            assert len(wps) >= 2
            assert math.isclose(wps[0].t, chunk.simTimeStart, abs_tol=1e-6)
            assert math.isclose(wps[-1].t, chunk.simTimeEnd, abs_tol=1e-6)
            for a, b in zip(wps, wps[1:]):
                assert b.t > a.t, f"{pid}: waypoints non croissants"
            if pid in last_pos:
                px, py = last_pos[pid]
                assert math.isclose(wps[0].x, px, abs_tol=1e-6), f"{pid} téléporté en x"
                assert math.isclose(wps[0].y, py, abs_tol=1e-6), f"{pid} téléporté en y"
            last_pos[pid] = (wps[-1].x, wps[-1].y)


def test_ball_continuous(replay):
    prev_end = None
    for chunk in replay.chunks:
        ball = chunk.ball
        assert len(ball) >= 2
        assert math.isclose(ball[0].t, chunk.simTimeStart, abs_tol=1e-6)
        assert ball[-1].t <= chunk.simTimeEnd + 1e-6
        if prev_end is not None:
            assert math.isclose(ball[0].x, prev_end[0], abs_tol=1e-6)
            assert math.isclose(ball[0].y, prev_end[1], abs_tol=1e-6)
        prev_end = (ball[-1].x, ball[-1].y)


def test_positions_within_bounds(replay):
    for chunk in replay.chunks:
        for pid, track in chunk.players.items():
            for w in track.waypoints:
                assert abs(w.x) <= 53.5, f"{pid} hors terrain x={w.x}"
                assert abs(w.y) <= 34.5, f"{pid} hors terrain y={w.y}"


def test_player_speeds_plausible(replay):
    for chunk in replay.chunks:
        for pid, track in chunk.players.items():
            wps = track.waypoints
            for a, b in zip(wps, wps[1:]):
                dt = b.t - a.t
                if dt <= 0:
                    continue
                speed = math.hypot(b.x - a.x, b.y - a.y) / dt
                assert speed < 11.0, f"{pid} à {speed:.1f} m/s dans chunk {chunk.simTimeStart}"


def test_goals_produce_sequences_at_right_time(replay):
    goal_chunks = [c for c in replay.chunks if c.phase == "GOAL_SEQUENCE"]
    pen_chunks = [
        c for c in replay.chunks if c.phase == "SET_PIECE" and c.commentary and "BUT" in c.commentary
    ]
    # 3 buts normaux (12', 38', 88') + 1 penalty (74') ; le 61' annulé n'existe pas
    assert len(goal_chunks) == 3
    assert len(pen_chunks) == 1
    minutes = sorted(c.minute for c in goal_chunks + pen_chunks)
    assert minutes == [12, 38, 74, 88]  # le chunk du but démarre dans la minute de l'événement
    for c in goal_chunks:
        shoots = [a for tr in c.players.values() for a in tr.actions if a.type == "SHOOT"]
        assert len(shoots) == 1
        dives = [a for tr in c.players.values() for a in tr.actions if a.type == "GK_DIVE"]
        assert len(dives) == 1


def test_score_progression(replay):
    assert replay.chunks[0].score == (0, 0)
    assert replay.chunks[-1].score == (3, 1)
    scores = [c.score for c in replay.chunks]
    for a, b in zip(scores, scores[1:]):
        assert b[0] >= a[0] and b[1] >= a[1]


def test_red_card_removes_player(replay):
    after_red = [c for c in replay.chunks if c.simTimeStart > 83 * 60]
    assert after_red, "pas de chunk après le rouge de la 82e"
    for chunk in after_red:
        assert "p20003" not in chunk.players, "Balerdi devrait être expulsé"
        om_players = [p for p in chunk.players.values() if p.teamId == 81]
        assert len(om_players) == 10


def test_substitution_swaps_player(replay):
    late = [c for c in replay.chunks if c.simTimeStart > 60 * 60]
    for chunk in late:
        assert "p20007" not in chunk.players, "Rongier remplacé à la 58e"
        assert "p20014" in chunk.players, "Nadir devrait être entré"


def test_timeline_mirrors_api_events(replay):
    # 11 événements bruts API (dont le but annulé + l'événement VAR)
    assert len(replay.timeline) == 11
    goals = [e for e in replay.timeline if e.type == "GOAL"]
    assert len(goals) == 5  # 12' 38' 61'(annulé) 74' 88' — tous listés, brut API
    cancelled = [e for e in replay.timeline if e.cancelled]
    assert len(cancelled) == 1
    assert cancelled[0].minute == 61
    # données brutes conservées telles quelles
    ramos = next(e for e in replay.timeline if e.player == "G. Ramos" and e.detail == "Penalty")
    assert ramos.teamName == "Paris Saint Germain"
    assert ramos.minute == 74
    # ordre chronologique + temps de saut dans les bornes du replay
    times = [e.simTime for e in replay.timeline]
    assert times == sorted(times)
    assert all(0 <= e.simTime <= replay.duration for e in replay.timeline)


def test_timeline_highlights_flagged(replay):
    highlights = [e for e in replay.timeline if e.isHighlight]
    # buts, cartons, remplacements, VAR sont tous des highlights
    assert len(highlights) == len(replay.timeline)
    types = {e.type for e in highlights}
    assert types == {"GOAL", "CARD", "SUBST", "VAR"}


def test_commentaries_present(replay):
    comments = [c.commentary for c in replay.chunks if c.commentary]
    assert any("BUT" in c for c in comments)
    assert any("Carton jaune" in c for c in comments)
    assert any("Carton rouge" in c for c in comments)
    assert any("remplace" in c for c in comments)
