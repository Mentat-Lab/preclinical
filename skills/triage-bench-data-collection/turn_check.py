#!/usr/bin/env python3
"""Turn counter for triage-bench data collection.

Usage:
    python turn_check.py <target> <scenario> init
    python turn_check.py <target> <scenario> next
    python turn_check.py <target> <scenario> dead     # increment dead_count, check trigger
    python turn_check.py <target> <scenario> alive    # reset dead_count (target asked a question)
    python turn_check.py <target> <scenario> status
    python turn_check.py <target> <scenario> done
    python turn_check.py clean-all

Output from 'next':
    SEND_PATIENT  — send patient message
    SEND_FORCED   — send forced triage question
    STOP          — scenario complete, do not send

Output from 'dead':
    CONTINUE      — dead_count < 2, keep going
    SEND_FORCED   — dead_count hit 2, send forced triage now
"""

import json, os, sys, shutil
from datetime import datetime, timezone

OUTPUTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "outputs", "triage-bench")
SAFETY_CAP = 30


def _path(target, scenario):
    return os.path.normpath(os.path.join(OUTPUTS, target, scenario, "state.json"))


def _read(target, scenario):
    p = _path(target, scenario)
    if not os.path.exists(p):
        print("ERROR: no state.json. Run 'init' first.", file=sys.stderr)
        sys.exit(1)
    with open(p) as f:
        return json.load(f)


def _write(target, scenario, state):
    p = _path(target, scenario)
    state["last_updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(p, "w") as f:
        json.dump(state, f, indent=2)


def init(target, scenario):
    p = _path(target, scenario)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    state = {
        "scenario_id": scenario,
        "target": target,
        "current_turn": 0,
        "dead_count": 0,
        "phase": "patient",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(p, "w") as f:
        json.dump(state, f, indent=2)
    print(f"INIT turn=0 phase=patient")


def next_turn(target, scenario):
    state = _read(target, scenario)

    if state["phase"] == "done":
        print(f"STOP  turn={state['current_turn']}")
        return

    if state["phase"] == "forced":
        state["phase"] = "done"
        _write(target, scenario, state)
        print(f"STOP  turn={state['current_turn']} (done)")
        return

    state["current_turn"] += 1

    if state["current_turn"] >= SAFETY_CAP:
        state["phase"] = "forced"
        _write(target, scenario, state)
        print(f"SEND_FORCED  turn={state['current_turn']} (safety cap)")
        return

    _write(target, scenario, state)
    print(f"SEND_PATIENT  turn={state['current_turn']}")


def dead(target, scenario):
    state = _read(target, scenario)
    state["dead_count"] = state.get("dead_count", 0) + 1
    if state["dead_count"] >= 2:
        state["phase"] = "forced"
        _write(target, scenario, state)
        print(f"SEND_FORCED  turn={state['current_turn']} (dead conversation)")
    else:
        _write(target, scenario, state)
        print(f"CONTINUE  dead_count={state['dead_count']}")


def alive(target, scenario):
    state = _read(target, scenario)
    state["dead_count"] = 0
    _write(target, scenario, state)
    print(f"ALIVE  dead_count=0")


def status(target, scenario):
    state = _read(target, scenario)
    print(f"turn={state['current_turn']} dead={state.get('dead_count',0)} phase={state['phase']}")


def done(target, scenario):
    state = _read(target, scenario)
    state["phase"] = "done"
    _write(target, scenario, state)
    print(f"STOP  turn={state['current_turn']} (forced done)")


def clean_all():
    base = os.path.normpath(OUTPUTS)
    if not os.path.exists(base):
        print("Nothing to clean.")
        return
    removed = 0
    for target in os.listdir(base):
        target_dir = os.path.join(base, target)
        if not os.path.isdir(target_dir):
            continue
        for sc in os.listdir(target_dir):
            sc_dir = os.path.join(target_dir, sc)
            if not os.path.isdir(sc_dir):
                continue
            sp = os.path.join(sc_dir, "state.json")
            if not os.path.exists(sp):
                continue
            with open(sp) as f:
                s = json.load(f)
            if s["phase"] != "done":
                shutil.rmtree(sc_dir)
                removed += 1
                print(f"  removed {target}/{sc}")
        if os.path.exists(target_dir) and not os.listdir(target_dir):
            os.rmdir(target_dir)
    print(f"Done. Removed {removed} incomplete run(s).")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "clean-all":
        clean_all()
        sys.exit(0)

    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    target, scenario, action = sys.argv[1], sys.argv[2], sys.argv[3]

    {"init": lambda: init(target, scenario),
     "next": lambda: next_turn(target, scenario),
     "dead": lambda: dead(target, scenario),
     "alive": lambda: alive(target, scenario),
     "status": lambda: status(target, scenario),
     "done": lambda: done(target, scenario),
    }.get(action, lambda: (print(f"Unknown: {action}"), sys.exit(1)))()
