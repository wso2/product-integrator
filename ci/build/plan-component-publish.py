#!/usr/bin/env python3
"""Work out which line a components-only publish replaces, and what to name the new document.

A components-only publish ships a component fix without re-releasing the app. It does that by
publishing a NEW source document and repointing one index line at it, which means it must start from
the document that line serves today: that document names the app version the components require, the
app entries to carry forward, and the sequence to advance past.

Two phases, because the document to read is named by the index:

  resolve  --index index.json [--selector 5.1.x]                  -> selector=, current_doc=
  plan     --index index.json --current current.json --stamp 2608201130
                                                                  -> current_sequence=, doc=, app_version=

Output is KEY=value lines meant to be sourced by the caller, so values are shell-quoted: a range
selector ('>=5.1.0 <5.2.0') read from the index would otherwise redirect when sourced.
"""
import argparse
import json
import re
import shlex
import sys

# Matches the update server's isSourceFile() guard: a name it refuses to serve would be named by the
# index and fail every check.
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$")


def load(path):
    with open(path) as f:
        return json.load(f)


def resolve_selector(index, selector):
    """The line to publish to, and the document serving it."""
    entries = index.get("entries", [])
    if not entries:
        sys.exit("error: this channel's index.json has no entries. A components-only publish "
                 "replaces the document serving a line, so the line must already be served — "
                 "publish an app release to this channel first.")
    if not selector:
        # Guessing would repoint clients that were not meant to receive this build.
        if len(entries) > 1:
            listed = ", ".join(f"{e.get('match')} -> {e.get('manifest')}" for e in entries)
            sys.exit(f"error: this channel serves {len(entries)} lines, so --selector is required. "
                     f"Lines: {listed}")
        selector = entries[0].get("match", "")
    current = next((e.get("manifest") for e in entries if e.get("match") == selector), None)
    if not current:
        listed = ", ".join(str(e.get("match")) for e in entries)
        sys.exit(f"error: no index entry matches selector '{selector}'. This publish would create a "
                 f"line with no app entries to carry, so clients on it would never be offered an app "
                 f"update. Publish an app release for '{selector}' first, or pick one of: {listed}")
    return selector, current


def emit(**values):
    for key, value in values.items():
        print(f"{key}={shlex.quote(str(value))}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["resolve", "plan"])
    ap.add_argument("--index", required=True)
    ap.add_argument("--selector", default="")
    ap.add_argument("--current", help="the source document this line serves today (plan phase)")
    ap.add_argument("--stamp", default="", help="UTC stamp that makes this revision's file name unique")
    args = ap.parse_args()

    index = load(args.index)
    selector, current_doc = resolve_selector(index, args.selector)

    if args.phase == "resolve":
        emit(selector=selector, current_doc=current_doc)
        return

    if not args.current:
        sys.exit("error: plan needs --current, the document the line serves today.")
    document = load(args.current)

    # Reported so the caller can refuse a publish that would move the line backwards. The new
    # sequence is a UTC clock read taken by the caller — the only scheme both publishers share.
    current_sequence = int(document.get("sequence", 0))

    apps = document.get("apps", [])
    app_version = apps[0]["version"] if len(apps) == 1 else ""

    # Named after the app line it serves, so the bucket shows which release a revision belongs to.
    label = app_version or selector
    if args.stamp:
        label = f"{label}-c{args.stamp}"
    if not SAFE_SEGMENT.match(label):
        sys.exit(f"error: cannot derive a document name from '{label}'. The update server only "
                 f"serves source-<segment>.json where <segment> is [A-Za-z0-9._+-]. Give a "
                 f"--selector that is an exact version or a .x wildcard.")

    emit(current_sequence=current_sequence, doc=f"source-{label}.json", app_version=app_version)


if __name__ == "__main__":
    sys.exit(main())
