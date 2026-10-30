/* EM OPS — home board and ArcGIS setup */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;

  OPS.tool('home', { eop: 'general',
    n: 'EM Ops', sub: 'County Operations Tools', icon: 'dash', d: 'Every county EM operations tool in one place, on ArcGIS, tied to Command Post incidents.',
    render: function () {
      var miss = !OPS.svc.main;
      var h = '<div class="phead"><div><h1 class="pg">Operations board</h1><p class="pgsub" style="margin:0">' + (OPS.inc ? 'Numbers for <b>' + E(OPS.inc.name) + '</b>. Switch to county-wide at the top to see everything.' : 'County-wide numbers. Pick an incident at the top to focus every tool on it.') + '</p></div><div class="acts"><button class="btn sm" data-act="refresh">' + I('refresh') + 'Refresh</button></div></div>';
      if (miss) h += '<div class="warnbox" style="margin-bottom:12px">' + I('warn') + ' The county EM Operations service is not set up yet. <a href="#setup" data-act="go" data-a="setup">Open Setup</a> (needs an ArcGIS publisher account, one time).</div>';
      h += '<div class="tiles">' + OPS.order.filter(function (k) { return k !== 'home' && k !== 'setup'; }).map(function (k) {
        var t = OPS.tools[k], nums = !miss && t.nums ? OPS.load('home:' + k + ':' + (OPS.inc ? OPS.inc.key : ''), t.nums, 60000) : null;
        var nh = nums === undefined ? '<span class="dim">…</span>' : nums && nums._err ? '<span class="dim" style="font-size:12px">' + E(nums._err).slice(0, 90) + '</span>' : (nums || []).map(function (n) { return '<div><b class="' + (n[2] || '') + '">' + E(n[0]) + '</b><span>' + E(n[1]) + '</span></div>'; }).join('');
        return '<a class="tile ' + (t.color || '') + '" href="#' + k + '" data-act="go" data-a="' + k + '"><div class="ti">' + I(t.icon || 'list') + E(t.n) + '</div><p>' + E(t.d || '') + '</p><div class="nums">' + nh + '</div></a>';
      }).join('') + '</div>';
      h += '<div class="card" style="margin-top:14px"><h3>' + I('link') + 'Field links</h3><div class="tk">' +
        '<a href="checkin.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) : '') + '" target="_blank"><b>Check-In app</b><span>Phone check-in for responders and volunteers</span></a>' +
        '<a href="mci.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) : '') + '" target="_blank" class="red"><b>MCI app</b><span>Triage, transport, hospitals</span></a>' +
        '<a href="' + OPS.cpLink() + '" target="_blank"><b>Command Post</b><span>Incident record and ICS forms</span></a>' +
        (OPS.webmapId() ? '<a href="' + A.portal + '/apps/mapviewer/index.html?webmap=' + OPS.webmapId() + '" target="_blank" class="blue"><b>EM Operations Map</b><span>All Ops layers in ArcGIS</span></a>' : '') + '</div></div>';
      return h;
    }
  });
  OPS.webmapId = function () { return (CP.store.prefs().opsSvc || {}).webmap || ''; };

  // ---------- setup ----------
  OPS.tool('setup', {
    n: 'Setup', sub: 'ArcGIS Services & Sharing', icon: 'gear', d: 'Create and maintain the ArcGIS services behind the EM Ops tools.',
    render: function () {
      var u = A.user || {}, canPub = u.canPublish;
      var h = '<div class="phead"><div><h1 class="pg">ArcGIS setup</h1><p class="pgsub" style="margin:0">Every Ops tool reads and writes hosted feature layers in county ArcGIS Online. Staff data goes in <b>BOCO_EM_Operations</b>. Personal information (AFN registry, reunification, MCI patients) goes in <b>BOCO_EM_Protected</b>, which you share only with a restricted group.</p></div></div>';
      h += '<div class="grid g2">' + ['main', 'prot'].map(function (key) {
        var d = OPS.SERVICES[key], s = OPS.svc[key];
        var gaps = s ? OPS.load('gaps:' + key, function () { return OPS.schemaGaps(key); }) : null;
        var gtxt = !s ? '' : gaps === undefined ? '<span class="dim">Checking layers…</span>' : gaps && gaps._err ? E(gaps._err) : (gaps.layers.length || gaps.fields.length) ? '<span class="warn-t">' + gaps.layers.length + ' layers and ' + gaps.fields.reduce(function (n, x) { return n + x.f.length; }, 0) + ' fields missing.</span> <button class="btn xs pri" data-act="upgrade" data-a="' + key + '">Update layers</button>' : '<span class="ok-t">' + I('check') + ' All ' + OPS.layersFor(key).length + ' layers up to date.</span>';
        return '<div class="card"><h3>' + I(key === 'prot' ? 'shield' : 'cloud') + E(d.title) + '<span class="x">' + (s ? OPS.chip('Active') : '<span class="chip red">Not set up</span>') + '</span></h3>' +
          '<div class="mono dim" style="font-size:12px;word-break:break-all;margin-bottom:8px">' + E(s ? s.url : d.name) + '</div>' +
          (s ? '<p style="margin:0 0 8px">' + gtxt + '</p><p style="margin:0 0 10px" class="dim">Owner ' + E(s.owner || '?') + ' · shared: ' + E(s.access || '?') + '</p>' +
            '<div class="row">' + (s.id ? '<a class="btn sm" target="_blank" href="' + A.portal + '/home/item.html?id=' + s.id + '">' + I('link') + 'Item page</a><button class="btn sm" data-act="shareDlg" data-a="' + key + '">' + I('users') + 'Share</button>' : '') + '</div>'
            : (canPub ? '<p class="dim">' + E(d.desc) + '</p><button class="btn pri" data-act="createSvc" data-a="' + key + '">' + I('plus') + 'Create ' + E(d.name) + '</button>' : '<div class="warnbox">You need an ArcGIS publisher account to create this service, or ask the owner to share it with you.</div>')) +
          '<details style="margin-top:10px"><summary class="dim" style="cursor:pointer">Layers (' + OPS.layersFor(key).length + ')</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:13px">' + OPS.layersFor(key).map(function (l) { return '<li><b>' + E(l.name) + '</b> <span class="dim">' + E(l.title) + (l.geom ? ' · points' : ' · table') + (l.attach ? ' · attachments' : '') + '</span>' + (s && s.ids[l.name] == null ? ' <span class="warn-t">missing</span>' : '') + '</li>'; }).join('') + '</ul></details></div>';
      }).join('') + '</div>';
      h += '<div class="card" style="margin-top:14px"><h3>' + I('map') + 'EM Operations web map</h3><p class="dim" style="margin-top:0">One web map with every Ops layer plus the county EM layers (Command Post incidents, shelters, PODs, critical infrastructure, closures, evacuation notices, CAD). Use it in ArcGIS Dashboards, Experience Builder, Field Maps or the Hub site.</p>' +
        (OPS.webmapId() ? '<div class="row"><a class="btn sm" target="_blank" href="' + A.portal + '/apps/mapviewer/index.html?webmap=' + OPS.webmapId() + '">' + I('map') + 'Open in Map Viewer</a><a class="btn sm ghost" target="_blank" href="' + A.portal + '/home/item.html?id=' + OPS.webmapId() + '">Item page</a><button class="btn sm ghost" data-act="makeMap">Make a new copy</button></div>' : '<button class="btn" data-act="makeMap"' + (OPS.svc.main ? '' : ' disabled') + '>' + I('plus') + 'Create the web map</button>') + '</div>';
      h += '<div class="card" style="margin-top:14px"><h3>' + I('link') + 'How the tools connect</h3><div class="dim" style="font-size:13.5px;line-height:1.55">' +
        '<b>Command Post incidents</b> (CP_Incidents) are the shared incident list; every incident record in these tools carries its incident key. ' +
        '<b>Check-In</b> writes each arrival into the Command Post incident (Resources page, ICS 211, CP_Resources table) and marks the inventory item Assigned. Check-out releases both. ' +
        '<b>Resources</b> requests land in the Command Post incident as ICS 213RR requests. Filling one assigns county inventory and adds it to Command Post as ordered. ' +
        '<b>Cost Recovery</b> imports labor hours from Check-In, equipment hours from Resources, volunteer hours and POD purchases. ' +
        '<b>AFN Registry</b> is checked against the county evacuation notices layer. <b>Reunification</b> searches the shelter registry and MCI patients. ' +
        '<b>Infrastructure</b> reads the county Critical Infrastructure layer. <b>PODs</b> use the county Resources/PODs layer and update its public commodity flags. ' +
        'Major status changes are written to the Command Post activity log.</div></div>';
      return h;
    }
  });
  OPS.act.createSvc = async function (key) {
    U.toast('Creating ' + OPS.SERVICES[key].name + ' in ArcGIS…');
    try { await OPS.createService(key); U.toast(OPS.SERVICES[key].name + ' created. Share it next.', 'ok', 6000); OPS.bust(); OPS.render(); OPS.act.shareDlg(key); } catch (e) { U.toast(E(e.message), 'err', 8000); }
  };
  OPS.act.upgrade = async function (key) { try { var m = await OPS.upgrade(key); U.toast('Updated: ' + m, 'ok'); OPS.bust(); OPS.render(); } catch (e) { U.toast(E(e.message), 'err', 8000); } };
  OPS.act.makeMap = async function () { try { var id = await OPS.makeWebMap(); U.toast('EM Operations Map created', 'ok'); OPS.render(); window.open(A.portal + '/home/item.html?id=' + id, '_blank'); } catch (e) { U.toast(E(e.message), 'err', 8000); } };
  OPS.act.shareDlg = async function (key) {
    var me = await A.req(A.portal + '/sharing/rest/community/self', {}).catch(function () { return { groups: [] }; });
    var gs = (me.groups || []).sort(function (a, b) { return a.title.localeCompare(b.title); });
    var prot = key === 'prot';
    U.modal('Share ' + OPS.SERVICES[key].name, (prot ? '<div class="warnbox" style="margin-bottom:10px">This service holds names, addresses, medical needs and patient records. Share it only with a small restricted group, not the whole organization.</div>' : '<p class="dim" style="margin-top:0">Share with the groups whose members use the Ops tools. Everyone who can see it can add and edit records.</p>') +
      (prot ? '' : '<label class="chk" style="margin-bottom:8px"><input type="checkbox" name="org"> Whole Botetourt County organization</label>') +
      '<div class="multi" id="grpList">' + (gs.map(function (g) { return '<label class="chk"><input type="checkbox" value="' + E(g.id) + '"> ' + E(g.title) + '</label>'; }).join('') || '<span class="dim">You are not in any groups.</span>') + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Share', cls: 'pri', fn: function (bg) { var ids = Array.prototype.map.call(bg.querySelectorAll('#grpList input:checked'), function (x) { return x.value; }); var org = !!(bg.querySelector('[name="org"]') || {}).checked; OPS.share(key, ids, org).then(function () { U.toast('Shared', 'ok'); OPS.render(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); } }]);
  };
})(window.CP);
