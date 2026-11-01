#!/usr/bin/env python3
"""One-time, read-only Steward export. No services, RCON, secrets, or world writes.
Python >=3.11 is used only here to read the existing TOML configuration faithfully.
The dashboard consumes the resulting JSON natively. Output must be a NEW file.
"""
import argparse
import json
import os
from pathlib import Path
import tomllib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--state", required=True, type=Path)
parser.add_argument("--ranks", required=True, type=Path)
parser.add_argument("--settings", action="append", default=[], type=Path,
                    help="Existing env files, in precedence order; only named automation settings are exported")
parser.add_argument("--maintenance", type=Path, help="Existing lifecycle maintenance.json, if present")
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--identity-mode", choices=["offline-authme", "online"], required=True)
a = parser.parse_args()
settings = {}
for filename in a.settings:
    for line in filename.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        settings[key.strip()] = value.strip().strip("\"'")
settings.update({key: value for key, value in os.environ.items() if key in {
    "MC_ADMINS", "INVITE_ONLY", "DIGEST_HOUR", "TZ", "SERVER_NAME", "NOTIFY_GAME_EVENTS",
    "TPS_ALERT", "ALERT_COOLDOWN_MIN", "RESTART_HOUR", "WORLD_BORDER_RADIUS", "WORLD_BORDER_CENTER_X", "WORLD_BORDER_CENTER_Z"}})
truth = lambda key, default: settings.get(key, default).lower() == "true"
state = json.loads(a.state.read_text())
# No old map secret, cookies, codes, or bearer approval signatures are exported.
state.pop("map_players", None)
if a.maintenance:
    state["legacy_maintenance"] = json.loads(a.maintenance.read_text())
ranks_bytes = a.ranks.read_bytes()
rules = {"version": 1, "identityMode": a.identity_mode,
         "admins": list(dict.fromkeys(n.strip() for n in settings.get("MC_ADMINS", "").split(",") if n.strip())),
         "ranks": tomllib.loads(ranks_bytes.decode()), "inviteOnly": truth("INVITE_ONLY", "true"),
         "notifications": True, "digestHour": int(settings.get("DIGEST_HOUR", "9")),
         "timezone": settings.get("TZ", "UTC"), "serverName": settings.get("SERVER_NAME", "Minecraft"),
         "chatStats": True, "personalSkins": True, "welcomeMessages": True,
         "notifyGameEvents": truth("NOTIFY_GAME_EVENTS", "true"),
         "tpsAlert": float(settings.get("TPS_ALERT", "18")),
         "alertCooldownMinutes": int(settings.get("ALERT_COOLDOWN_MIN", "30"))}
# Preserve infrastructure intent for review; the web app never executes nightly power actions.
state["infrastructure_intent"] = {key: settings[key] for key in (
    "RESTART_HOUR", "WORLD_BORDER_RADIUS", "WORLD_BORDER_CENTER_X", "WORLD_BORDER_CENTER_Z") if key in settings}
with a.output.open("x", encoding="utf-8") as out:
    os.chmod(a.output, 0o600)
    json.dump({"version": 1, "rules": rules, "state": state}, out, ensure_ascii=False, indent=2)
    out.write("\n")
