#!/usr/bin/env python3
"""Check English translations in content-en/ against their Chinese originals in content/.

For every translated page this verifies that the parts a translator must not
change are identical: fenced code blocks (byte for byte), image destinations,
link URLs, heading levels, table shapes and the [TOC] / legacy heading markers.
Exit status is 1 when any page differs.

Each translation records `sourceHash`, the MD5 of the original's body (what
Hugo calls .RawContent). The theme flags a translation whose original has
changed since. After updating a translation, refresh its hash with --update-hash.

Usage: python3 scripts/check-translations.py [--update-hash] [content-en/path/to/page.md ...]
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EN = ROOT / "content-en"
ZH = ROOT / "content"

FENCE = re.compile(r"^([ \t]*)(```|~~~)[^\n]*\n.*?^\1\2[ \t]*$", re.M | re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)")
AUTOLINK = re.compile(r"<(https?://[^>\s]+)>")
HEADING = re.compile(r"^(#{1,6})\s", re.M)
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$", re.M)


FRONT_MATTER = re.compile(r"---\s*\n.*?\n---[ \t]*\n", re.S)


def source_hash(text):
    m = FRONT_MATTER.match(text)
    return hashlib.md5(text[m.end():].encode("utf-8") if m else text.encode("utf-8")).hexdigest()


def update_hash(en_file, zh_file):
    h = source_hash(zh_file.read_text(encoding="utf-8"))
    text = en_file.read_text(encoding="utf-8")
    new, n = re.subn(r'(?m)^sourceHash:.*$', f'sourceHash: "{h}"', text, count=1)
    if not n:
        new = text.replace("\n---", f'\nsourceHash: "{h}"\n---', 1)
    if new != text:
        en_file.write_text(new, encoding="utf-8")
    return h


def body(text):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4:]
    return text


def facts(text):
    text = body(text)
    fences = [m.group(0).strip() for m in FENCE.finditer(text)]
    prose = FENCE.sub("", text)
    return {
        "code blocks": fences,
        "images": IMAGE.findall(prose),
        "links": sorted(set(LINK.findall(prose)) | set(AUTOLINK.findall(prose))),
        "headings": [len(h) for h in HEADING.findall(prose)],
        "table rows": len(TABLE_ROW.findall(prose)),
        "[TOC]": prose.count("[TOC]"),
        "legacy heading": len(re.findall(r"<font[^>]*size=['\"]?20", prose)),
    }


def check(en_file):
    zh_file = ZH / en_file.relative_to(EN)
    if not zh_file.exists():
        return [f"no Chinese original at {zh_file.relative_to(ROOT)}"]
    a = facts(zh_file.read_text(encoding="utf-8"))
    b = facts(en_file.read_text(encoding="utf-8"))
    problems = []
    for key in a:
        if a[key] != b[key]:
            if key == "code blocks":
                if len(a[key]) != len(b[key]):
                    problems.append(f"code blocks: {len(a[key])} in Chinese, {len(b[key])} in English")
                for i, (x, y) in enumerate(zip(a[key], b[key]), 1):
                    if x != y:
                        problems.append(f"code block {i} differs: starts {x[:60]!r}")
            else:
                problems.append(f"{key}: Chinese {a[key]!r} vs English {b[key]!r}")
    return problems


def main(args):
    update = "--update-hash" in args
    args = [a for a in args if a != "--update-hash"]
    files = [pathlib.Path(p).resolve() for p in args] or sorted(EN.rglob("*.md"))
    files = [f for f in files if f.name not in ("_index.md",) and "fedora-riscv-devel-docs" in f.parts]
    bad = 0
    for f in files:
        problems = check(f)
        rel = f.relative_to(ROOT)
        if problems:
            bad += 1
            print(f"FAIL {rel}")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"ok   {rel}")
            if update:
                print(f"     sourceHash {update_hash(f, ZH / f.relative_to(EN))}")
    if not files:
        print("no translated pages found")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
