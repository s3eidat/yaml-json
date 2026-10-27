/* YAML ⇄ JSON — js-yaml 4 with its default (safe) schema: no !!js/function, no code execution. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var Y = window.jsyaml;
  var input = $("#input"), output = $("#output"), status = $("#status"), info = $("#info");
  var state = { dir: S3.store("yj.dir") || "y2j", text: "", ok: false };
  var MAX_NODES = 2000000; // guards against "billion laughs" alias expansion

  // Walk the value the way JSON.stringify would; stop on cycles and alias bombs.
  function guard(v) {
    var seen = 0, path = [];
    (function walk(x) {
      if (++seen > MAX_NODES) throw new Error("This YAML expands to more than " + MAX_NODES.toLocaleString("en-US") + " values (alias bomb?), so it was not converted");
      if (x && typeof x === "object" && !(x instanceof Date)) {
        if (path.indexOf(x) >= 0) throw new Error("This YAML refers to itself (a recursive alias), which JSON can't represent");
        path.push(x);
        Object.keys(x).forEach(function (k) { walk(x[k]); });
        path.pop();
      }
    })(v);
    return seen;
  }
  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = sortDeep(v[k]); }); return o;
    }
    return v;
  }

  function yamlToJson(text, opt) {
    var docs = [];
    Y.loadAll(text, function (d) { docs.push(d); }, { schema: Y.DEFAULT_SCHEMA });
    var val = docs.length === 1 && !opt.always ? docs[0] : docs;
    var count = guard(val);
    if (opt.sort) val = sortDeep(val);
    return { text: JSON.stringify(val, null, +opt.indent) + "\n", docs: docs.length, nodes: count, value: val };
  }
  function jsonToYaml(text, opt) {
    var val = JSON.parse(text), o = { indent: +opt.indent, sortKeys: !!opt.sort, lineWidth: -1, noRefs: true };
    if (opt.multi && Array.isArray(val)) {
      return { text: val.length ? val.map(function (d) { return "---\n" + Y.dump(d, o); }).join("") : "", docs: val.length, value: val };
    }
    return { text: Y.dump(val, o), docs: 1, value: val };
  }
  // JSON.parse messages differ per engine: "at position 42" or "line 3 column 5".
  function jsonPos(msg, text) {
    var m = /line (\d+) column (\d+)/i.exec(msg);
    if (m) return { line: +m[1], col: +m[2] };
    m = /position (\d+)/i.exec(msg);
    if (!m) return null;
    var before = text.slice(0, +m[1]).split("\n");
    return { line: before.length, col: before[before.length - 1].length + 1 };
  }
  function errInfo(e, text, isYaml) {
    if (isYaml && e.mark) return { msg: e.reason || e.message, at: { line: e.mark.line + 1, col: e.mark.column + 1 } };
    return { msg: e.message, at: isYaml ? null : jsonPos(e.message, text) };
  }

  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === value));
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onPick(b.dataset.v);
      });
    });
  }
  function opts() {
    var o = { indent: $("#indent").value, sort: $("#sort").checked, multi: $("#multi").checked, always: $("#always").checked };
    S3.store("yj.opts", o); return o;
  }
  function labels() {
    var y = state.dir === "y2j";
    $("#inLabel").textContent = y ? "YAML input" : "JSON input";
    $("#outLabel").textContent = y ? "JSON output" : "YAML output";
    $("#saveExt").textContent = y ? ".json" : ".yaml";
    input.placeholder = y ? "Paste YAML here, or drop a file" : "Paste JSON here, or drop a file";
    $$(".j2y-only").forEach(function (e) { e.hidden = y; });
    $$(".y2j-only").forEach(function (e) { e.hidden = !y; });
  }

  function render(fromAction) {
    var text = input.value, y = state.dir === "y2j";
    info.textContent = ""; state.ok = false; state.text = "";
    if (!text.trim()) { output.textContent = ""; status.className = "chip"; status.textContent = "Waiting for input"; return; }
    var o = opts(), r;
    try { r = y ? yamlToJson(text, o) : jsonToYaml(text, o); }
    catch (e) {
      var er = errInfo(e, text, y), lines = text.split("\n"), html = S3.esc(er.msg) + "\n\n";
      status.className = "chip bad";
      status.textContent = (y ? "YAML" : "JSON") + " error" + (er.at ? " at line " + er.at.line + ", col " + er.at.col : "");
      if (er.at) {
        var from = Math.max(0, er.at.line - 4), to = Math.min(lines.length, er.at.line + 2);
        for (var i = from; i < to; i++) {
          var ln = String(i + 1).padStart(4) + " │ " + S3.esc(lines[i]);
          html += i + 1 === er.at.line ? '<span class="yj-err">' + ln + "\n" + " ".repeat(6 + er.at.col) + "^</span>" : ln + "\n";
        }
      }
      output.innerHTML = html;
      return;
    }
    state.text = r.text; state.ok = true;
    output.textContent = r.text;
    status.className = "chip ok";
    status.textContent = y ? "Valid YAML" : "Valid JSON";
    info.textContent = (r.docs > 1 || o.always ? r.docs + " document" + (r.docs === 1 ? "" : "s") + " · " : "") +
      S3.fmtBytes(new Blob([text]).size) + " → " + S3.fmtBytes(new Blob([r.text]).size);
    if (fromAction) S3.done();
  }

  var SAMPLE_YAML = "# GitHub Actions style workflow with an anchor and a merge key\nname: CI\non:\n  push:\n    branches: [main]\n" +
    "defaults: &node\n  runs-on: ubuntu-latest\n  timeout-minutes: 10\njobs:\n  test:\n    <<: *node\n    steps:\n      - uses: actions/checkout@v4\n" +
    "      - name: Install\n        run: npm ci\n      - name: Test\n        run: |\n          npm test\n          npm run lint\n  build:\n    <<: *node\n    needs: test\n" +
    "    env:\n      NODE_ENV: production\n      RETRIES: 3\n      DEBUG: false\n      VERSION: \"1.10\"\n---\n# a second document\nkind: Service\nmetadata:\n  name: web\n";
  var SAMPLE_JSON = '{\n  "apiVersion": "apps/v1",\n  "kind": "Deployment",\n  "metadata": { "name": "web", "labels": { "app": "web" } },\n' +
    '  "spec": { "replicas": 3, "template": { "spec": { "containers": [ { "name": "web", "image": "nginx:1.27", "ports": [ { "containerPort": 80 } ] } ] } } }\n}';

  var saved = S3.store("yj.opts") || {};
  if (saved.indent) $("#indent").value = saved.indent;
  $("#sort").checked = !!saved.sort; $("#multi").checked = !!saved.multi; $("#always").checked = !!saved.always;
  seg($("#dir"), state.dir, function (v) { state.dir = v; S3.store("yj.dir", v); labels(); render(); });
  labels();
  ["indent", "sort", "multi", "always"].forEach(function (id) { $("#" + id).addEventListener("change", function () { render(); }); });
  input.addEventListener("input", S3.debounce(function () { render(); }, 250));
  $("#swap").addEventListener("click", function () {
    if (!state.ok) return S3.toast("Fix the input first", "error");
    input.value = state.text;
    var nd = state.dir === "y2j" ? "j2y" : "y2j";
    $("#dir button[data-v=" + nd + "]").click();
  });
  $("#clear").addEventListener("click", function () { input.value = ""; render(); input.focus(); });
  $("#sample").addEventListener("click", function () { input.value = state.dir === "y2j" ? SAMPLE_YAML : SAMPLE_JSON; render(true); });
  function load(f) {
    S3.readFile(f, "text").then(function (t) {
      input.value = t;
      var isJson = /\.json$/i.test(f.name) || /^\s*[\[{]/.test(t);
      var want = isJson ? "j2y" : "y2j";
      if (want !== state.dir) $("#dir button[data-v=" + want + "]").click(); else render(true);
    });
  }
  $("#open input").addEventListener("change", function (e) { var f = e.target.files[0]; if (f) load(f); e.target.value = ""; });
  input.addEventListener("dragover", function (e) { e.preventDefault(); });
  input.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); load(f); });
  $("#copy").addEventListener("click", function () { if (state.ok) { S3.copy(state.text); S3.done(); } else S3.toast("Nothing valid to copy yet", "error"); });
  $("#save").addEventListener("click", function () {
    if (!state.ok) return S3.toast("Nothing valid to save yet", "error");
    var y = state.dir === "y2j";
    S3.download(state.text, y ? "data.json" : "data.yaml", y ? "application/json" : "application/yaml"); S3.done();
  });

  window.S3_DEMO = function () { if (state.dir !== "y2j") $("#dir button[data-v=y2j]").click(); $("#sample").click(); };

  window.S3_SELFTEST = function () {
    var fails = [];
    function eq(name, a, b) { a = JSON.stringify(a); b = JSON.stringify(b); if (a !== b) fails.push(name + ": got " + a + " want " + b); }
    function throwsMsg(fn) { try { fn(); return null; } catch (e) { return e.message || String(e); } }
    var o = { indent: 2 };
    var anchors = yamlToJson("base: &b {x: 1, y: 2}\nchild:\n  <<: *b\n  y: 3\nlist: [*b]\n", o).value;
    eq("merge key", anchors.child, { x: 1, y: 3 }); eq("alias", anchors.list[0], { x: 1, y: 2 });
    var multi = yamlToJson("a: 1\n---\nb: [1, two]\n---\n", o);
    eq("multi-doc", multi.value, [{ a: 1 }, { b: [1, "two"] }, null]); eq("doc count", multi.docs, 3);
    eq("always array", yamlToJson("a: 1", { indent: 2, always: true }).value, [{ a: 1 }]);
    var fnErr = throwsMsg(function () { yamlToJson("f: !!js/function 'function () { return 1 }'\n", o); });
    eq("!!js/function rejected", !!(fnErr && /unknown tag/i.test(fnErr)), true);
    eq("!!python rejected", !!throwsMsg(function () { yamlToJson("x: !!python/object/apply:os.system ['ls']", o); }), true);
    eq("!!js/regexp rejected", !!throwsMsg(function () { yamlToJson("r: !!js/regexp /x/", o); }), true);
    try { yamlToJson("a: 1\nb: [1, 2\nc: 3\n", o); fails.push("bad yaml accepted"); }
    catch (e) { var ei = errInfo(e, "", true); eq("error has line", ei.at && ei.at.line >= 2, true); }
    eq("core schema types", yamlToJson("a: yes\nb: 010\nc: 0x1F\nd: ~\ne: 1e3\nf: '1.10'", o).value, { a: "yes", b: 10, c: 31, d: null, e: 1000, f: "1.10" });
    eq("timestamp", yamlToJson("d: 2026-10-26", o).value.d instanceof Date, true);
    eq("block scalar", yamlToJson("s: |\n  line1\n  line2\n", o).value.s, "line1\nline2\n");
    var bomb = "a: &a [x, x, x, x, x, x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\n" +
      "d: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]\ne: &e [*d, *d, *d, *d, *d, *d, *d, *d, *d, *d]\nf: &f [*e, *e, *e, *e, *e, *e, *e, *e, *e, *e]\ng: [*f, *f, *f, *f, *f, *f, *f, *f, *f, *f]\n";
    eq("alias bomb stopped", /alias bomb/.test(throwsMsg(function () { yamlToJson(bomb, o); }) || ""), true);
    var obj = { name: "S3", list: [1, "two", true, null, 2.5], nested: { "a b": "x: y", quote: "it's \"q\"", num: "123", empty: "", multi: "l1\nl2" } };
    var y = jsonToYaml(JSON.stringify(obj), o).text;
    eq("round trip", yamlToJson(y, o).value, obj);
    eq("string stays string", /num: '123'/.test(y), true);
    eq("sort keys", jsonToYaml('{"b":1,"a":{"d":1,"c":2}}', { indent: 2, sort: true }).text, "a:\n  c: 2\n  d: 1\nb: 1\n");
    eq("multi out", jsonToYaml('[{"a":1},{"b":2}]', { indent: 2, multi: true }).text, "---\na: 1\n---\nb: 2\n");
    eq("indent 4", jsonToYaml('{"a":{"b":1}}', { indent: 4 }).text, "a:\n    b: 1\n");
    eq("json error pos", jsonPos("Unexpected token } in JSON at position 9", '{"a":1,\n}'), { line: 2, col: 2 });
    return fails.length ? fails : true;
  };

  input.value = S3.store("yj.last") || "";
  input.addEventListener("input", S3.debounce(function () { S3.store("yj.last", input.value.length < 200000 ? input.value : undefined); }, 600));
  render();
})();
