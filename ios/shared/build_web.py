#!/usr/bin/env python3
"""Build the board page that ships inside the iPhone/iPad app.

Takes the same page the website uses (commandboard.html and its scripts) and makes ONE self-contained file:
scripts, styles, fonts, Leaflet and the patch image are all inside it, so the app opens with no internet and no GitHub.
gate.js is added after arc.js: inside the app, ArcGIS goes through the BEACON gate instead of an ArcGIS sign-in.

  python3 ios/shared/build_web.py commandboard.html ios/CommandBoard/CommandBoard/board.html
  (later: python3 ios/shared/build_web.py mci.html ios/MCIBoard/MCIBoard/board.html)
"""
import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
V = os.path.join(ROOT, 'ios', 'shared', 'vendor')
src, out = sys.argv[1], sys.argv[2]
html = open(os.path.join(ROOT, src), encoding='utf-8').read()

def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def b64(p): return base64.b64encode(open(p, 'rb').read()).decode()

FONTS = [('Barlow Condensed', 'barlow-condensed-latin-%d-normal.woff2', (500, 600, 700, 800)),
         ('Barlow', 'barlow-latin-%d-normal.woff2', (400, 500, 600, 700)),
         ('JetBrains Mono', 'jetbrains-mono-latin-%d-normal.woff2', (500, 700))]
font_css = ''.join("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}\n" % (fam, w, b64(os.path.join(V, pat % w))) for fam, pat, ws in FONTS for w in ws)

# drop what the app does not use: web manifest, install meta, Google Fonts, CDN links
html = re.sub(r'<link rel="(manifest|preconnect|icon|apple-touch-icon)"[^>]*>', '', html)
html = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', '<style>' + font_css + '</style>', html)
# Leaflet's CSS points at images/… next to the page, which the app doesn't have: put the images inside the CSS
def leaflet_css():
    css = open(os.path.join(V, 'leaflet.css')).read()
    return re.sub(r'url\(images/([\w-]+\.png)\)', lambda m: 'url(data:image/png;base64,%s)' % b64(os.path.join(V, m.group(1))), css)
html = re.sub(r'<link rel="stylesheet" href="https://unpkg\.com/leaflet[^>]*>', lambda m: '<style>' + leaflet_css() + '</style>', html)
html = re.sub(r'<script src="https://unpkg\.com/qrcode-generator[^>]*></script>', lambda m: '<script>' + open(os.path.join(V, 'qrcode.js')).read() + '</script>', html)
html = re.sub(r'<script src="https://unpkg\.com/leaflet[^>]*></script>', lambda m: '<script>' + open(os.path.join(V, 'leaflet.js')).read() + '</script>', html)
html = re.sub(r'<meta name="(apple-mobile-web-app-[^"]*|mobile-web-app-capable)"[^>]*>', '', html)

def css(m):
    t = read(m.group(1))
    t = re.sub(r'url\((["\']?)([a-z0-9_]+\.png)\1\)', lambda u: 'url(data:image/png;base64,%s)' % b64(os.path.join(ROOT, u.group(2))), t)
    return '<style>/* %s */\n%s</style>' % (m.group(1), t)
html = re.sub(r'<link rel="stylesheet" href="([a-z0-9_]+\.css)(?:\?v=\d+)?">', css, html)

def js(m):
    name = m.group(1); t = read(name)
    t = t.replace("'patch.png'", "'data:image/png;base64,%s'" % b64(os.path.join(ROOT, 'patch.png'))) if 'patch.png' in t else t
    extra = ('\n</script>\n<script>/* gate.js */\n' + read('gate.js')) if name == 'arc.js' else ''
    return '<script>/* %s */\n%s%s</script>' % (name, t.replace('</script>', '<\\/script>'), extra.replace('</script>\n<script>/* gate', '</script>\n<script>/* gate'))
html = re.sub(r'<script src="([a-z0-9_]+\.js)(?:\?v=\d+)?"></script>', js, html)

assert 'unpkg.com' not in html and 'fonts.googleapis' not in html, 'an outside link is still in the page'
assert not re.search(r'<script src=|<link rel="stylesheet" href=', html), 'a script or stylesheet was not inlined'
os.makedirs(os.path.dirname(os.path.join(ROOT, out)), exist_ok=True)
open(os.path.join(ROOT, out), 'w', encoding='utf-8').write(html)
print('wrote %s (%d KB)' % (out, len(html) // 1024))
