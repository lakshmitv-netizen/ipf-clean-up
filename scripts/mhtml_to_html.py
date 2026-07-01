#!/usr/bin/env python3
"""Convert a (Blink-saved) MHTML archive into a single self-contained HTML file.

All sub-resources (CSS, images, fonts) are inlined as data: URIs so the page
renders standalone with no external/org dependencies.
"""
import base64
import email
import sys
from email import policy
from urllib.parse import urlsplit


def data_uri(ctype: str, payload: bytes) -> str:
    b64 = base64.b64encode(payload).decode("ascii")
    return f"data:{ctype};base64,{b64}"


def rel_path(url: str):
    """Return the host-relative form (path[?query]) of an absolute http(s) URL.

    The HTML sometimes references a resource by its relative path while the MHTML
    stores it under the absolute Content-Location, so we must map both forms.
    """
    if not url:
        return None
    s = urlsplit(url)
    if s.scheme in ("http", "https") and s.path:
        return s.path + (("?" + s.query) if s.query else "")
    return None


def add_ref(uri_map: dict, key, uri):
    if key:
        uri_map[key] = uri


def main(src: str, dst: str) -> None:
    with open(src, "rb") as f:
        msg = email.message_from_binary_file(f, policy=policy.default)

    parts = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        parts.append(
            {
                "loc": part.get("Content-Location"),
                "cid": (part.get("Content-ID") or "").strip("<>") or None,
                "ctype": part.get_content_type(),
                "payload": part.get_payload(decode=True) or b"",
            }
        )

    main_part = None
    resources = []
    for p in parts:
        if main_part is None and p["ctype"] == "text/html":
            main_part = p
        else:
            resources.append(p)

    if main_part is None:
        raise SystemExit("No text/html part found in MHTML")

    binary_res = [r for r in resources if not r["ctype"].startswith("text/")]
    text_res = [r for r in resources if r["ctype"].startswith("text/")]

    # Map: original reference -> data URI. Binary resources first (no nested refs).
    uri_map = {}
    for r in binary_res:
        uri = data_uri(r["ctype"], r["payload"])
        add_ref(uri_map, r["loc"], uri)
        add_ref(uri_map, rel_path(r["loc"]), uri)
        if r["cid"]:
            add_ref(uri_map, "cid:" + r["cid"], uri)

    def replace_all(text: str, mapping: dict) -> str:
        # Longest keys first to avoid partial overlaps.
        for loc in sorted(mapping, key=len, reverse=True):
            uri = mapping[loc]
            if loc in text:
                text = text.replace(loc, uri)
            esc = loc.replace("&", "&amp;")
            if esc != loc and esc in text:
                text = text.replace(esc, uri)
        return text

    # Inline binary refs into CSS/text parts, then expose them as data URIs.
    for r in text_res:
        txt = r["payload"].decode("utf-8", errors="replace")
        txt = replace_all(txt, uri_map)
        r["_text"] = txt
    for r in text_res:
        uri = data_uri(r["ctype"], r["_text"].encode("utf-8"))
        add_ref(uri_map, r["loc"], uri)
        add_ref(uri_map, rel_path(r["loc"]), uri)
        if r["cid"]:
            add_ref(uri_map, "cid:" + r["cid"], uri)

    html = main_part["payload"].decode("utf-8", errors="replace")
    html = replace_all(html, uri_map)

    with open(dst, "w", encoding="utf-8") as f:
        f.write(html)

    remaining = html.count("orgfarm-816dbc0c56")
    print(f"Wrote {dst} ({len(html)} bytes). Remaining org URLs: {remaining}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
