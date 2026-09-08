#!/usr/bin/env python3
"""Point a release line at a source document in a channel's index.json.

The index maps a client-version SELECTOR to the source document that serves it, and the server takes
the FIRST match. This script upserts one line and refuses two mistakes that are otherwise invisible
until users stop receiving updates:

  * an entry no client can ever reach, because a broader entry above it already matches
  * a sequence that would move the line backwards

The index is small, unsigned and hand-editable by design, so a read-modify-write is safe here in a
way that rewriting a signed document is not: the worst outcome is a stale pointer to a document that
was already verified.

Usage: upsert-source-index.py --index index.json --selector 5.1.x --manifest source-5.1.5.json
                              [--sequence 7] [--current-sequence 6]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_index_common import find_unreachable  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", required=True, help="index.json to read and rewrite in place")
    ap.add_argument("--selector", required=True, help="client-version selector for this line")
    ap.add_argument("--manifest", required=True, help="source document file name this line serves")
    ap.add_argument("--sequence", type=int, help="sequence of the document being published")
    ap.add_argument("--current-sequence", type=int,
                    help="sequence of the document this line serves today")
    args = ap.parse_args()

    # Moving a line backwards silently un-ships whatever the newer document carried.
    if args.sequence is not None and args.current_sequence is not None:
        if args.sequence <= args.current_sequence:
            sys.exit(f"error: sequence {args.sequence} is not newer than the {args.current_sequence} "
                     f"that line '{args.selector}' serves today; publishing it would regress the line.")

    with open(args.index) as f:
        index = json.load(f)
    entries = index.get("entries", [])

    for position, entry in enumerate(entries):
        if entry.get("match") == args.selector:
            entry["manifest"] = args.manifest      # same line, newer document
            break
    else:
        # Appended, not prepended: first match wins, so inserting at the front would let this line
        # shadow a more specific entry (a pinned hotfix) placed above it on purpose.
        entries.append({"match": args.selector, "manifest": args.manifest})
        position = len(entries) - 1

    # An unreachable entry looks published and never arrives, so fail and let the operator reorder.
    # Matching mirrors the update server's semantics (shared module), ranges included.
    for _, sel, shadow in find_unreachable(entries):
        if sel == args.selector:
            sys.exit(
                f"error: index entry '{sel}' -> {args.manifest} is unreachable: entry '{shadow}' "
                f"above it already matches the clients it serves, and the first match wins. "
                f"Move the more specific entry above it in index.json."
            )

    index["entries"] = entries
    with open(args.index, "w") as f:
        json.dump(index, f, indent=2)
    print(json.dumps(index, indent=2))


if __name__ == "__main__":
    sys.exit(main())
