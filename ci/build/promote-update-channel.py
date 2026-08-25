#!/usr/bin/env python3
"""Promotes the source documents a channel serves down the channel ladder.

A channel is no longer one source.json: each release publishes source-<version>.json and claims a
line in index.json. So promotion copies the DOCUMENTS the source channel currently serves and
upserts the matching index entries in the target — per line, so a line the target serves and the
source does not (an older maintenance line, say) is left alone rather than silently dropped.

Documents and their detached signatures are copied verbatim, so the CI signature stays valid and
nothing is re-signed. The client resolves by channel path and never reads the document's own
`channel` field, so a copied document is correct where it lands.

Usage: promote-update-channel.py <bucket> <from-channel> <to-channel>
"""
import json
import re
import subprocess
import sys


def aws(*args: str) -> subprocess.CompletedProcess:
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


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    bucket, source, target = sys.argv[1], sys.argv[2], sys.argv[3]

    src_index = read_json_key(bucket, f"manifests/{source}/index.json")
    if not src_index or not src_index.get("entries"):
        print(f"error: {source} has no index.json with entries; nothing to promote", file=sys.stderr)
        return 1
    dst_index = read_json_key(bucket, f"manifests/{target}/index.json")
    if dst_index is None:
        print(f"{target} has no index yet; creating one.")
        dst_index = {"schemaVersion": 1, "entries": []}

    print(f"promoting {source} -> {target}")
    manifest_shape = re.compile(r"^(source|source-[A-Za-z0-9][A-Za-z0-9._+-]{0,63})\.json$")
    for entry in src_index["entries"]:
        match, manifest = entry["match"], entry["manifest"]
        if not manifest_shape.match(manifest):
            print(f"error: index names manifest '{manifest}', which the update server would refuse "
                  f"to serve; fix {source}/index.json first", file=sys.stderr)
            return 1
        src_doc = read_json_key(bucket, f"manifests/{source}/{manifest}")
        if src_doc is None:
            print(f"error: {source}/index.json names {manifest}, which is not in the bucket", file=sys.stderr)
            return 1
        src_seq = int(src_doc.get("sequence", 0))

        # Refuse a promotion that would move a line BACKWARDS. Compared per line: a single global
        # sequence says nothing about which line is regressing, and regressing one is how a channel
        # loses a fix that already shipped to it.
        current = next((e["manifest"] for e in dst_index["entries"] if e.get("match") == match), None)
        if current:
            dst_doc = read_json_key(bucket, f"manifests/{target}/{current}")
            dst_seq = int((dst_doc or {}).get("sequence", 0))
            if src_seq <= dst_seq:
                print(f"error: refusing line {match}: {source} sequence {src_seq} is not newer than "
                      f"{target}'s {dst_seq}, which would regress {target}", file=sys.stderr)
                return 1
            print(f"  {match}: {current} (seq {dst_seq}) -> {manifest} (seq {src_seq})")
        else:
            print(f"  {match}: new line -> {manifest} (seq {src_seq})")

        for suffix, content_type in (("", "application/json"), (".sig", "text/plain")):
            copied = aws("s3", "cp",
                         f"s3://{bucket}/manifests/{source}/{manifest}{suffix}",
                         f"s3://{bucket}/manifests/{target}/{manifest}{suffix}",
                         "--content-type", content_type, "--cache-control", "no-cache")
            if copied.returncode != 0:
                print(f"error: copying {manifest}{suffix}: {copied.stderr.strip()}", file=sys.stderr)
                return 1

        for existing in dst_index["entries"]:
            if existing.get("match") == match:
                existing["manifest"] = manifest
                break
        else:
            dst_index["entries"].append({"match": match, "manifest": manifest})

    body = json.dumps(dst_index, indent=2) + "\n"
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
