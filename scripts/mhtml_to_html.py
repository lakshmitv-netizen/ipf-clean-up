#!/usr/bin/env python3
"""Convert an MHTML (multipart/related) archive into a single self-contained HTML
file by inlining every referenced resource as a data: URI.

Usage: python3 mhtml_to_html.py <input.mhtml> <output.html>
"""
import base64
import email
import quopri
import re
import sys


def decode_part(part):
    payload = part.get_payload(decode=True)
    if payload is None:
        payload = part.get_payload()
        if isinstance(payload, str):
            payload = payload.encode("utf-8", "replace")
        else:
            payload = b""
    return payload


def main(inp, outp):
    with open(inp, "rb") as f:
        msg = email.message_from_binary_file(f)

    parts = []
    if msg.is_multipart():
        for p in msg.walk():
            if p.is_multipart():
                continue
            parts.append(p)
    else:
        parts.append(msg)

    # Root = first text/html part
    root = None
    for p in parts:
        if p.get_content_type() == "text/html":
            root = p
            break
    if root is None:
        root = parts[0]

    # Build lookup maps for resources (everything except the root).
    by_location = {}
    by_cid = {}
    for p in parts:
        if p is root:
            continue
        ctype = p.get_content_type()
        data = decode_part(p)
        loc = p.get("Content-Location")
        cid = p.get("Content-ID")
        is_text = ctype.startswith("text/") or ctype in (
            "application/javascript",
            "application/x-javascript",
        )
        entry = {"ctype": ctype, "data": data, "is_text": is_text}
        if loc:
            by_location[loc.strip()] = entry
        if cid:
            by_cid[cid.strip().strip("<>")] = entry

    def to_data_uri(entry):
        ctype = entry["ctype"]
        b64 = base64.b64encode(entry["data"]).decode("ascii")
        return f"data:{ctype};base64,{b64}"

    # First pass: process CSS text resources so that url(...)/@import inside them
    # are also inlined. Then convert each resource to a data URI.
    def process_css_text(text):
        def repl(m):
            quote = m.group("q") or ""
            ref = m.group("u").strip()
            new = resolve_ref(ref)
            if new is None:
                return m.group(0)
            return f"url({quote}{new}{quote})"

        return re.sub(
            r"url\(\s*(?P<q>['\"]?)(?P<u>[^)'\"]+)(?P=q)\s*\)",
            repl,
            text,
        )

    resolved_cache = {}

    def resolve_ref(ref):
        if ref in resolved_cache:
            return resolved_cache[ref]
        entry = None
        if ref.startswith("cid:"):
            entry = by_cid.get(ref[4:]) or by_location.get(ref)
        else:
            entry = by_location.get(ref) or by_cid.get(ref)
        if entry is None:
            resolved_cache[ref] = None
            return None
        if entry["is_text"] and entry["ctype"] == "text/css":
            txt = entry["data"].decode("utf-8", "replace")
            txt = process_css_text(txt)
            uri = "data:text/css;base64," + base64.b64encode(
                txt.encode("utf-8")
            ).decode("ascii")
        else:
            uri = to_data_uri(entry)
        resolved_cache[ref] = uri
        return uri

    html = decode_part(root).decode("utf-8", "replace")

    # Replace cid: references.
    def cid_repl(m):
        ref = m.group(1)
        uri = resolve_ref("cid:" + ref)
        return uri if uri else m.group(0)

    html = re.sub(r"cid:([^\"')\s>]+)", cid_repl, html)

    # Replace absolute URL references that match known resource locations.
    # Sort by length desc so longer URLs match first.
    for loc in sorted(by_location.keys(), key=len, reverse=True):
        if loc in html:
            uri = resolve_ref(loc)
            if uri:
                html = html.replace(loc, uri)

    with open(outp, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Wrote {outp} ({len(html)} chars), {len(parts)} parts inlined")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
