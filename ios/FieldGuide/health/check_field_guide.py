#!/usr/bin/env python3
"""EOP Field Guide health check.

Checks everything the iPhone app depends on, the same way the app reads it:
  1. the public EM Field Guide item is reachable and published
  2. its published config parses into the guide (pages, menu, page HTML, links between pages)
  3. every lifeline the home screen shows has its guide page
  4. the Update my lifeline form address is present and the Survey123 form is public
  5. the Lifeline Status feed (newest row, the one SIGNAL shows) answers with all eight lifelines

Exit code 0 = healthy, 1 = something the app needs is broken. Warnings never fail the run.
Standard library only, so it runs anywhere Python 3.9+ runs.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

GUIDE_ITEM = "c7e098280d1c497c9b387ea3fe85a90e"
SHARING = "https://www.arcgis.com/sharing/rest/content/items/"
LIFELINE_LAYER = ("https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/"
                  "EmergencyInformation_public_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/1")

# Must match LifelineDef in FieldGuide/LifelineStatus.swift.
LIFELINES = [
    ("safetysecurity", "Safety"), ("foodhydrationshelter", "Food"), ("healthmedical", "Health"),
    ("energy", "Energy"), ("communications", "Communications"), ("transportation", "Transportation"),
    ("hazardousmaterials", "Hazardous"), ("watersystems", "Water Systems"),
]
STATUS_CODES = {"Minimal Impact", "Moderate Impact", "Significant Impact", "Unknown", "Administrative", None, ""}
MIN_PAGES = 20          # the guide has 26 today; fewer than this means pages went missing
STALE_STATUS_DAYS = 30  # only a warning: a quiet month is normal

failures, warnings, notes = [], [], []


def get_json(url, tries=3):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FieldGuideHealth/1"}), timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # network blips: retry, then report
            if attempt == tries - 1:
                raise RuntimeError(f"{url.split('?')[0]}: {e}") from e
            time.sleep(3 * (attempt + 1))


def fail(msg): failures.append(msg)
def warn(msg): warnings.append(msg)
def note(msg): notes.append(msg)


def check_item():
    info = get_json(f"{SHARING}{GUIDE_ITEM}?f=json")
    if "error" in info:
        fail(f"EM Field Guide item: {info['error'].get('message')}")
        return None
    if info.get("access") != "public":
        fail(f"EM Field Guide item is shared '{info.get('access')}', the app needs it public")
    if not any(k.lower().startswith("status: published") for k in info.get("typeKeywords", [])):
        fail("EM Field Guide has never been published")
    mod = datetime.fromtimestamp(info["modified"] / 1000, timezone.utc)
    note(f"EM Field Guide last changed {mod:%Y-%m-%d %H:%M} UTC")
    return info


def check_config():
    cfg = get_json(f"{SHARING}{GUIDE_ITEM}/resources/config/config.json")
    pages, views, layouts, widgets = (cfg.get(k, {}) for k in ("pages", "views", "layouts", "widgets"))
    if not (pages and views and layouts and widgets):
        fail("Published config is missing pages, views, layouts or widgets")
        return

    def embed(layout, kind):
        for size in ("LARGE", "MEDIUM", "SMALL"):
            lid = (layout or {}).get(size)
            lay = layouts.get(lid) or {}
            content = lay.get("content") or {}
            for key in lay.get("order") or sorted(content):
                w = widgets.get((content.get(key) or {}).get("widgetId"), {})
                c = w.get("config") or {}
                if "embed" in w.get("uri", "") and c.get("embedType") == kind:
                    return c
        return None

    def view_of(link):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(link or "").query)
        return (q.get("views") or [""])[0].split(",")[0] or None

    guide, sections, form_url, empty = {}, [], None, []
    for entry in cfg.get("pageStructure", []):
        for pid, children in entry.items():
            p = pages.get(pid, {})
            if p.get("isVisible") is False:
                continue
            ids = [pid] if p.get("type") != "FOLDER" else children
            titles = []
            for cid in ids:
                c = pages.get(cid, {})
                if c.get("isVisible") is False:
                    continue
                if c.get("type") == "LINK":
                    v = view_of(c.get("linkUrl"))
                    e = embed(views.get(v, {}).get("layout"), "code") if v else None
                    if not e or not (e.get("embedCode") or "").strip():
                        empty.append(c.get("label", cid))
                        continue
                    guide[v] = (c.get("label") or "", e["embedCode"])
                    titles.append(c.get("label") or "")
                elif c.get("type") == "NORMAL":
                    e = embed(c.get("layout"), "url")
                    if e:
                        t = re.sub(r"<[^>]+>", "", e.get("expression") or "").replace("&amp;", "&").strip()
                        if t.startswith("http"):
                            form_url = t
            if p.get("type") == "FOLDER":
                sections.append((p.get("label", pid), titles))

    if empty:
        fail("Menu pages with no guide content: " + ", ".join(empty))
    if len(guide) < MIN_PAGES:
        fail(f"Only {len(guide)} guide pages found (expected at least {MIN_PAGES})")
    note(f"{len(guide)} guide pages; folders: " + "; ".join(f"{n} ({len(t)})" for n, t in sections))

    # Links between guide pages must point at pages that exist.
    broken = set()
    for v, (title, html) in guide.items():
        for target in re.findall(r"[?&]views=(view_\d+)", html):
            if target not in views:
                broken.add(f"{title} → {target}")
    if broken:
        warn("Guide links to pages that no longer exist: " + "; ".join(sorted(broken)))

    # Each lifeline tile on the home screen opens its page in the Lifelines folder.
    lifeline_titles = next((t for n, t in sections if "lifeline" in n.lower()), [])
    for field, keyword in LIFELINES:
        if not any(keyword.lower() in t.lower() for t in lifeline_titles):
            fail(f"No Lifelines page matching '{keyword}' (home-screen tile for {field} would have no guide page)")

    if not form_url:
        fail("No Update my lifeline form address in the published guide")
    else:
        m = re.search(r"/share/([0-9a-f]{32})", form_url)
        if not m:
            warn(f"Form address is not a Survey123 share link: {form_url}")
        else:
            fi = get_json(f"{SHARING}{m.group(1)}?f=json")
            if "error" in fi:
                fail(f"Lifeline Report form {m.group(1)}: {fi['error'].get('message')}")
            elif fi.get("access") != "public":
                fail(f"Lifeline Report form is shared '{fi.get('access')}', lifeline leads need it public")
            else:
                note(f"Lifeline Report form is public ({fi.get('title')})")

    ts = cfg.get("timestamp")
    if ts:
        note(f"Guide published {datetime.fromtimestamp(int(ts) / 1000, timezone.utc):%Y-%m-%d %H:%M} UTC")


def check_lifeline_feed():
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "orderByFields": "OBJECTID DESC",
                                "resultRecordCount": 1, "f": "json"})
    data = get_json(f"{LIFELINE_LAYER}/query?{q}")
    if "error" in data:
        fail(f"Lifeline Status feed: {data['error'].get('message')}")
        return
    feats = data.get("features") or []
    if not feats:
        fail("Lifeline Status feed has no rows")
        return
    a = feats[0].get("attributes", {})
    missing = [f for f, _ in LIFELINES if f not in a]
    if missing:
        fail("Lifeline Status feed is missing fields: " + ", ".join(missing))
    odd = sorted({str(a.get(f)) for f, _ in LIFELINES if a.get(f) not in STATUS_CODES})
    if odd:
        warn("Unexpected lifeline status values (app shows them as-is): " + ", ".join(odd))
    stamp = a.get("EditDate") or a.get("CreationDate")
    if stamp:
        when = datetime.fromtimestamp(stamp / 1000, timezone.utc)
        age = (datetime.now(timezone.utc) - when).days
        note(f"Newest lifeline status row: {when:%Y-%m-%d %H:%M} UTC ({age} days old)")
        if age > STALE_STATUS_DAYS:
            warn(f"Lifeline status not updated in {age} days")


def main():
    for check in (check_item, check_config, check_lifeline_feed):
        try:
            check()
        except Exception as e:
            fail(f"{check.__name__}: {e}")

    lines = ["## EOP Field Guide health", ""]
    lines.append("**Result: " + ("❌ problems found**" if failures else "✅ healthy**"))
    for title, items in (("Problems", failures), ("Warnings", warnings), ("Details", notes)):
        if items:
            lines += ["", f"### {title}"] + [f"- {i}" for i in items]
    report = "\n".join(lines)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(report + "\n")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
