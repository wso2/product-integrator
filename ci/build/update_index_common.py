"""Selector semantics shared by every index writer, mirroring the update server's decide.bal.

The server resolves index entries top to bottom, first match wins. Anything that WRITES an index
must therefore be able to answer "can a client this entry is meant for actually reach it?" with the
same matching rules the server applies — a writer with weaker rules publishes entries that look
fine and are silently never served.
"""
import re


def compare_versions(a: str, b: str) -> int:
    """Mirrors the server's compareVersions: dotted numeric segments (missing = 0), pre-release
    after '-' ranks below the release, numeric identifiers below alphanumeric, ASCII order."""
    def split(v):
        v = v.split("+", 1)[0]
        core, _, pre = v.partition("-")
        nums = [int(x) if x.isdigit() else 0 for x in core.split(".")]
        return nums, pre
    an, ap = split(a.strip())
    bn, bp = split(b.strip())
    for i in range(max(len(an), len(bn))):
        x = an[i] if i < len(an) else 0
        y = bn[i] if i < len(bn) else 0
        if x != y:
            return -1 if x < y else 1
    if ap == bp:
        return 0
    if not ap:
        return 1          # release ranks above its own pre-release
    if not bp:
        return -1
    for x, y in zip(ap.split("."), bp.split(".")):
        if x == y:
            continue
        if x.isdigit() and y.isdigit():
            return -1 if int(x) < int(y) else 1
        if x.isdigit():
            return -1     # numeric ranks below alphanumeric
        if y.isdigit():
            return 1
        return -1 if x < y else 1
    return -1 if len(ap.split(".")) < len(bp.split(".")) else 1


_COMPARATOR = re.compile(r"^(>=|<=|>|<|==|=)?\s*(.+)$")


def matches_selector(version: str, selector: str) -> bool:
    """The server's matchesSelector: '*' matches all; 'x' wildcards match per segment; a selector
    containing comparators is a range where every space-separated comparator must hold."""
    selector = selector.strip()
    if selector in ("*", ""):
        return True
    if any(c in selector for c in "<>="):
        for comparator in selector.split():
            m = _COMPARATOR.match(comparator)
            op = m.group(1) or "="
            cmp = compare_versions(version, m.group(2))
            ok = (cmp >= 0 if op == ">=" else cmp > 0 if op == ">"
                  else cmp <= 0 if op == "<=" else cmp < 0 if op == "<" else cmp == 0)
            if not ok:
                return False
        return True
    want, have = selector.split("."), version.split(".")
    for i, seg in enumerate(want):
        if seg in ("x", "X", "*"):
            return True
        if i >= len(have) or have[i] != seg:
            return False
    return len(want) == len(have)


def is_exact(selector: str) -> bool:
    s = selector.strip()
    return s not in ("*", "") and not any(c in s for c in "<>=xX*")


def sample_version(selector: str):
    """A version the selector is meant to serve, or None when one cannot be derived (ranges)."""
    s = selector.strip()
    if s in ("*", ""):
        return "999.999.999"
    if any(c in s for c in "<>="):
        return None
    return ".".join("0" if p in ("x", "X", "*") else p for p in s.split("."))


def find_unreachable(entries):
    """Yields (position, selector, shadowing_selector) for every entry that a client it is meant to
    serve can never reach, because an earlier entry already matches that client.

    An earlier EXACT entry is never treated as shadowing a broader one: it captures a single version
    on purpose (a pinned hotfix) and the broader entry still serves everything else on its line."""
    for pos, entry in enumerate(entries):
        selector = (entry.get("match") or "").strip()
        probe = sample_version(selector)
        if probe is None:
            continue
        for earlier in entries[:pos]:
            other = (earlier.get("match") or "").strip()
            if is_exact(other) and other != selector:
                continue
            if matches_selector(probe, other):
                yield pos, selector, other
                break


if __name__ == "__main__":
    # Self-check vectors, runnable anywhere: python3 update_index_common.py
    assert compare_versions("5.1.3-a1", "5.1.3") < 0
    assert compare_versions("5.1.0", "5.1") == 0
    assert compare_versions("1.0.0-beta.2", "1.0.0-beta.11") < 0
    assert compare_versions("2201.13.4", "2201.13.5") < 0
    assert matches_selector("5.1.0", ">=5.0.0 <6.0.0")
    assert not matches_selector("6.0.0", ">=5.0.0 <6.0.0")
    assert matches_selector("5.1.7", "5.1.x")
    assert not matches_selector("5.2.0", "5.1.x")
    assert list(find_unreachable([{"match": ">=5.0.0 <6.0.0"}, {"match": "5.1.x"}])) \
        == [(1, "5.1.x", ">=5.0.0 <6.0.0")]
    assert list(find_unreachable([{"match": "5.1.0"}, {"match": "5.1.x"}])) == []
    print("update_index_common: all self-checks pass")
