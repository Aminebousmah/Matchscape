from pathlib import Path

from scenarist.normalize import cancel_var_goals, load_match

FIXTURE = Path(__file__).parent / "fixtures" / "fixture_1234567"


def test_load_match_basics():
    info, events = load_match(FIXTURE)
    assert info.fixture_id == 1234567
    assert info.home.name == "Paris Saint Germain"
    assert info.away.formation == "4-2-3-1"
    assert len(info.home.start_xi) == 11
    assert len(info.away.start_xi) == 11
    assert info.final_score == (3, 1)
    assert info.stats[85].possession_pct == 62.0
    assert info.stats[81].total_shots == 9


def test_events_normalized_and_sorted():
    _, events = load_match(FIXTURE)
    assert len(events) == 11
    assert [e.type for e in events[:3]] == ["GOAL", "CARD", "GOAL"]
    times = [e.sim_time for e in events]
    assert times == sorted(times)
    # temps additionnel : 45+1 après 45
    vitinha = next(e for e in events if e.player_name == "Vitinha")
    assert vitinha.extra_minute == 1
    assert vitinha.sim_time == 46 * 60 - 30


def test_var_cancels_goal():
    _, events = load_match(FIXTURE)
    kept = cancel_var_goals(events)
    # le but de Barcola (61') et l'événement VAR (63') disparaissent
    assert len(kept) == len(events) - 2
    goals = [e for e in kept if e.type == "GOAL"]
    assert len(goals) == 4  # 12' 38' 74' 88'
    assert all(not (e.minute == 61 and e.type == "GOAL") for e in kept)
    assert all(e.type != "VAR" for e in kept)


def test_goal_scorers_and_details():
    _, events = load_match(FIXTURE)
    kept = cancel_var_goals(events)
    pen = next(e for e in kept if e.detail == "Penalty")
    assert pen.player_name == "G. Ramos"
    assert pen.minute == 74
    red = next(e for e in kept if e.detail == "Red Card")
    assert red.team_id == 81
