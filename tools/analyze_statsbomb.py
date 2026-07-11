"""Analyse des freeze-frames StatsBomb 360 pour extraire des paramètres de
positionnement réalistes, injectés ensuite dans le scénariste.

StatsBomb : terrain 120x80, l'équipe en possession (actor) attaque vers x=120.
On mesure, ballon (actor) ramené à l'origine et normalisé "vers l'avant = +dx" :
- compacité du bloc (étendue x des joueurs d'une équipe)
- où se tiennent attaquants (teammate) et défenseurs (adversaires) vs ballon
- distance du défenseur le plus proche du ballon (pressing)

Usage : python tools/analyze_statsbomb.py --dir dataheatmap/data/three-sixty
"""

from __future__ import annotations

import argparse
import json
import math
import statistics as st
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--limit", type=int, default=400)
    args = ap.parse_args()

    files = sorted(Path(args.dir).glob("*.json"))[: args.limit]

    mate_dx, mate_dy = [], []       # attaquants relatifs au ballon
    opp_dx, opp_dy = [], []         # defenseurs relatifs au ballon
    att_xspread, def_xspread = [], []   # compacite (etendue x) par frame
    att_yspread, def_yspread = [], []
    nearest_opp = []                # pressing : distance defenseur le + proche
    n_frames = 0

    for fp in files:
        try:
            frames = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        for fr in frames:
            ff = fr.get("freeze_frame") or []
            actor = next((p for p in ff if p.get("actor")), None)
            if not actor:
                continue
            ax, ay = actor["location"]
            mates = [p for p in ff if p.get("teammate") and not p.get("actor")]
            opps = [p for p in ff if not p.get("teammate")]
            if len(mates) < 3 or len(opps) < 3:
                continue
            n_frames += 1

            for p in mates:
                mate_dx.append(p["location"][0] - ax)
                mate_dy.append(p["location"][1] - ay)
            for p in opps:
                opp_dx.append(p["location"][0] - ax)
                opp_dy.append(p["location"][1] - ay)

            mx = [p["location"][0] for p in mates]
            my = [p["location"][1] for p in mates]
            ox = [p["location"][0] for p in opps]
            oy = [p["location"][1] for p in opps]
            att_xspread.append(max(mx) - min(mx))
            att_yspread.append(max(my) - min(my))
            def_xspread.append(max(ox) - min(ox))
            def_yspread.append(max(oy) - min(oy))
            nearest_opp.append(min(math.hypot(p["location"][0] - ax, p["location"][1] - ay) for p in opps))

    def s(label, xs):
        xs = [v for v in xs if v is not None]
        print(f"  {label:34s} moy={st.mean(xs):6.1f}  med={st.median(xs):6.1f}  "
              f"p10={sorted(xs)[len(xs)//10]:6.1f}  p90={sorted(xs)[len(xs)*9//10]:6.1f}")

    U = 105 / 120  # 1 unite StatsBomb -> metres (terrain 105 m)
    print(f"\n{n_frames} freeze-frames exploitables · 1 u StatsBomb = {U:.3f} m\n")
    print("COMPACITE (etendue, unites StatsBomb ~= 0.875 m):")
    s("bloc attaquant - longueur (x)", att_xspread)
    s("bloc attaquant - largeur (y)", att_yspread)
    s("bloc defensif - longueur (x)", def_xspread)
    s("bloc defensif - largeur (y)", def_yspread)
    print("\nPOSITION vs BALLON (dx>0 = vers l'avant/but adverse):")
    s("attaquants dx", mate_dx)
    s("attaquants dy (lateral)", mate_dy)
    s("defenseurs dx", opp_dx)
    s("defenseurs dy (lateral)", opp_dy)
    print("\nPRESSING:")
    s("distance defenseur le + proche", nearest_opp)


if __name__ == "__main__":
    main()
