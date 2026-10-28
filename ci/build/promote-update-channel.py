#!/usr/bin/env python3
"""Promotes the source documents a channel serves down the channel ladder.

A channel is no longer one source.json: each release publishes source-<version>.json and claims a
line in index.json. So promotion copies the DOCUMENTS the source channel currently serves and
upserts the matching index entries in the target — per line, so a line the target serves and the
source does not (an older maintenance line, say) is left alone rather than silently dropped.

Documents and their detached signatures are copied verbatim, so the CI signature stays valid and
nothing is re-signed. The client resolves by channel path and never reads the document's own
`channel` field, so a copied document is correct where it lands.

`--version` is REQUIRED and names the release to promote, or the literal `all` for every line the
source channel serves. There is no default on purpose: a channel used to qualify releases holds
several candidates at once, and "promote everything" is the destructive reading of an operator
forgetting to fill the field in. The value is normalised to the document name an index entry
carries, so `5.1.0-alpha5`, `v5.1.0-alpha5` and `source-5.1.0-alpha5.json` all select
source-5.1.0-alpha5.json, and `source.json` selects the legacy single document a channel may
still serve.

Nothing in the target is written until every selected line has passed its guards and the complete
target index has validated. Copying as each line is checked would, on a later refusal, leave the
earlier lines' documents in the target with no index entry naming them — the "exists but not
served" state this script otherwise only warns about.

Usage: promote-update-channel.py <bucket> <from-channel> <to-channel> --version=<app-version>|all
"""
import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_index_common import find_unreachable, insert_position  # noqa: E402

# What the update server agrees to serve; an index naming anything else is already broken.
MANIFEST_SHAPE = re.compile(r"^(source|source-[A-Za-z0-9][A-Za-z0-9._+-]{0,63})\.json$")


def aws(*args: str) -> subprocess.CompletedProcess:
    """Runs one aws CLI command and returns it, output captured, for the caller to judge."""
    return subprocess.run(["aws", *args], capture_output=True, text=True)


def read_json_key(bucket: str, key: str):
    """Returns the parsed object, or None when the key does not exist.

    Any other failure (auth, throttling, network) aborts the promotion. Treating those as "missing"
    would rebuild the target index from only the promoted lines and silently drop every line the
    target serves that the source does not -- the exact state this script promises to preserve.
    """
    head = aws("s3api", "head-object", "--bucket", bucket, "--key", key)
    if head.returncode != 0:
        if "404" in head.stderr or "Not Found" in head.stderr:
            return None
        sys.exit(f"error: cannot determine whether s3://{bucket}/{key} exists: {head.stderr.strip()}")
    got = aws("s3", "cp", f"s3://{bucket}/{key}", "-")
    if got.returncode != 0:
        sys.exit(f"error: reading s3://{bucket}/{key} failed: {got.stderr.strip()}")
    try:
        return json.loads(got.stdout)
    except json.JSONDecodeError as err:
        sys.exit(f"error: s3://{bucket}/{key} is not valid JSON: {err}")


def wanted_manifest(version: str) -> str:
    """The index document name a `--version` value selects.

    Tolerates the spellings an operator is likely to paste from a release page or a bucket listing:
    a leading `v`, the `source-` prefix and the `.json` suffix are all stripped, and the bare legacy
    name `source.json` (or `source`) is kept as-is. The result is matched against the document each
    index entry NAMES, never used to build an S3 key.
    """
    name = version.strip()
    if name.endswith(".json"):
        name = name[:-len(".json")]
    if name == "source":
        return "source.json"
    if name.startswith("source-"):
        name = name[len("source-"):]
    if re.match(r"^[vV][0-9]", name):
        name = name[1:]
    return f"source-{name}.json"


def main() -> int:
    """Parses the arguments, plans the promotion against a copy of the target index, and only then
    copies the documents and writes the index. Returns the process exit code."""
    ap = argparse.ArgumentParser(
        description="Promote source documents down the channel ladder.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("bucket")
    ap.add_argument("from_channel")
    ap.add_argument("to_channel")
    ap.add_argument("--version", required=True, metavar="VERSION|all", help=(
        "the release to promote: the line served by source-<version>.json, or the literal 'all' "
        "to promote every line the source channel serves"))
    args = ap.parse_args()
    bucket, source, target = args.bucket, args.from_channel, args.to_channel
    # An empty string reaches here when a caller passes the flag with an unset variable, which is
    # precisely the "forgot to fill it in" case the required flag exists to catch.
    wanted_version = args.version.strip()
    if not wanted_version:
        print("error: --version is empty. Name a release (e.g. 5.1.0-alpha5), or pass 'all' to "
              "promote every line the source channel serves.", file=sys.stderr)
        return 2
    # 'all' is reserved: a document literally named source-all.json cannot be singled out. Nothing
    # names releases that way, and the alternative — a separate --all flag — reintroduces the
    # "neither given" case this is meant to remove.
    promote_all = wanted_version.lower() == "all"
    wanted = None if promote_all else wanted_manifest(wanted_version)
    if wanted and not MANIFEST_SHAPE.match(wanted):
        print(f"error: '{wanted_version}' is not a version a source document can be named after "
              "(letters, digits and . _ + - only, e.g. 5.1.0-alpha5). Pass 'all' to promote every "
              "line the source channel serves.", file=sys.stderr)
        return 2

    documents = {}

    def document(channel: str, manifest: str):
        """Reads manifests/<channel>/<manifest> once per run; the second ask is served from memory."""
        key = f"manifests/{channel}/{manifest}"
        if key not in documents:
            documents[key] = read_json_key(bucket, key)
        return documents[key]

    src_index = read_json_key(bucket, f"manifests/{source}/index.json")
    if not src_index or not src_index.get("entries"):
        print(f"error: {source} has no index.json with entries; nothing to promote", file=sys.stderr)
        return 1

    promoting = src_index["entries"]
    if wanted:
        # Matched against the document each entry NAMES, not built into a key: every S3 path below
        # still comes from the index, so a bogus --version selects nothing rather than reaching for
        # an arbitrary object.
        promoting = [e for e in src_index["entries"] if e.get("manifest") == wanted]
        if not promoting:
            available = ", ".join(
                sorted({e.get("manifest", "?") for e in src_index["entries"]})) or "(none)"
            print(f"error: {source} serves no line from {wanted}. Documents it currently serves: "
                  f"{available}", file=sys.stderr)
            print("note: a document can exist in the bucket without being served — only lines named "
                  "in index.json can be promoted.", file=sys.stderr)
            return 1
        if len(promoting) > 1:
            lines = ", ".join(e.get("match", "?") for e in promoting)
            print(f"promoting {wanted}, which serves more than one line: {lines}")
    dst_index = read_json_key(bucket, f"manifests/{target}/index.json")
    if dst_index is None:
        print(f"{target} has no index yet; creating one.")
        dst_index = {"schemaVersion": 1, "entries": []}

    scope = "all lines" if promote_all else f"version {wanted_version}"
    print(f"promoting {source} -> {target} ({scope})")

    # ---- Plan. Every guard runs over a working copy of the target index, and nothing is copied
    # until all of them have passed. The target's documents are read up front: the per-line guard
    # needs its own line's, and the cross-line note below needs the rest.
    entries = [dict(e) for e in dst_index["entries"]]
    target_sequence = {}
    for existing in entries:
        doc = document(target, existing.get("manifest", ""))
        target_sequence[existing.get("match")] = int((doc or {}).get("sequence", 0))

    to_copy = []
    for entry in promoting:
        match, manifest = entry["match"], entry["manifest"]
        if not MANIFEST_SHAPE.match(manifest):
            print(f"error: index names manifest '{manifest}', which the update server would refuse "
                  f"to serve; fix {source}/index.json first", file=sys.stderr)
            return 1
        src_doc = document(source, manifest)
        if src_doc is None:
            print(f"error: {source}/index.json names {manifest}, which is not in the bucket", file=sys.stderr)
            return 1
        src_seq = int(src_doc.get("sequence", 0))

        # Refuse a promotion that would move a line BACKWARDS. Compared per line: a single global
        # sequence says nothing about which line is regressing, and regressing one is how a channel
        # loses a fix that already shipped to it.
        current = next((e["manifest"] for e in entries if e.get("match") == match), None)
        if current:
            dst_seq = target_sequence[match]
            if src_seq <= dst_seq:
                print(f"error: refusing line {match}: {source} sequence {src_seq} is not newer than "
                      f"{target}'s {dst_seq}, which would regress {target}", file=sys.stderr)
                return 1
            print(f"  {match}: {current} (seq {dst_seq}) -> {manifest} (seq {src_seq})")
        else:
            print(f"  {match}: new line -> {manifest} (seq {src_seq})")

        # Lines are independent (a maintenance line legitimately trails the current one), so an
        # older document on a line the target does not serve yet is allowed. It is also how a
        # candidate the target already passed over can be promoted behind a newer one, now that a
        # single version can be picked, so say so rather than decide silently.
        newer = sorted(((seq, sel) for sel, seq in target_sequence.items()
                        if sel != match and seq > src_seq), reverse=True)
        if newer:
            lines = ", ".join(f"{sel} (seq {seq})" for seq, sel in newer)
            print(f"  note: {target} already serves a newer document on another line: {lines}. "
                  f"The sequence guard compares per line, so {manifest} is allowed through; make "
                  f"sure it is meant to reach {target} behind them.")

        for existing in entries:
            if existing.get("match") == match:
                existing["manifest"] = manifest
                break
        else:
            entries.insert(insert_position(entries, match), {"match": match, "manifest": manifest})
        if manifest not in to_copy:
            to_copy.append(manifest)

    # Validate the COMPLETE target index with the server's own selector semantics before anything
    # is written: an entry shadowed by a broader one above it would look promoted while never
    # being reachable.
    unreachable = list(find_unreachable(entries))
    if unreachable:
        for _, sel, shadow in unreachable:
            print(f"error: target entry '{sel}' would be unreachable: '{shadow}' above it already "
                  f"matches the clients it serves (first match wins)", file=sys.stderr)
        print(f"fix the ordering in {target}/index.json (or the source index) and re-run",
              file=sys.stderr)
        return 1
    body = json.dumps({**dst_index, "entries": entries}, indent=2) + "\n"

    # ---- Act. Documents before the index: a client that reads the index between the two writes
    # must find the document it names.
    for manifest in to_copy:
        for suffix, content_type in (("", "application/json"), (".sig", "text/plain")):
            copied = aws("s3", "cp",
                         f"s3://{bucket}/manifests/{source}/{manifest}{suffix}",
                         f"s3://{bucket}/manifests/{target}/{manifest}{suffix}",
                         "--content-type", content_type, "--cache-control", "no-cache")
            if copied.returncode != 0:
                print(f"error: copying {manifest}{suffix}: {copied.stderr.strip()}", file=sys.stderr)
                return 1

    print("--- promoted index ---")
    print(body)
    written = subprocess.run(
        ["aws", "s3", "cp", "-", f"s3://{bucket}/manifests/{target}/index.json",
         "--content-type", "application/json", "--cache-control", "no-cache"],
        input=body, capture_output=True, text=True)
    if written.returncode != 0:
        print(f"error: writing {target}/index.json: {written.stderr.strip()}", file=sys.stderr)
        return 1
    print(f"promoted {source} -> {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
