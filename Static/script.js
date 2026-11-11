/* RouteX: theme toggle, road-network map and form. */

/* ---------- Light / dark theme (runs on every page) ---------- */

(function () {
    "use strict";

    var KEY = "routex-theme";
    var root = document.documentElement;
    var btn = document.getElementById("theme-toggle");

    function current() {
        return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    function paint(theme) {
        root.setAttribute("data-theme", theme);
        if (!btn) return;
        var next = theme === "dark" ? "light" : "dark";
        btn.setAttribute("aria-label", "Switch to " + next + " theme");
        btn.setAttribute("title", "Switch to " + next + " theme");
    }

    paint(current());

    if (btn) {
        btn.addEventListener("click", function () {
            var theme = current() === "dark" ? "light" : "dark";
            paint(theme);
            try { localStorage.setItem(KEY, theme); } catch (e) {}
        });
    }

    /* Follow the system setting, unless the person has picked a theme themselves */
    if (window.matchMedia) {
        var mq = window.matchMedia("(prefers-color-scheme: dark)");
        var onSystemChange = function (ev) {
            var saved = null;
            try { saved = localStorage.getItem(KEY); } catch (e) {}
            if (!saved) paint(ev.matches ? "dark" : "light");
        };
        if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    }
})();

/* ---------- Map and form ---------- */

(function () {
    "use strict";

    var NS = "http://www.w3.org/2000/svg";
    var dataEl = document.getElementById("graph-data");
    var svg = document.getElementById("map");

    if (!dataEl || !svg) return;

    var data = JSON.parse(dataEl.textContent);
    var coords = data.coords;
    var edges = data.edges;
    var route = data.route || [];
    var hasRoute = route.length > 1;

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- Map projection: [lat, lon] -> SVG units ---------- */

    var SCALE = 20, LON0 = 67.2, LAT0 = 35.5, COS_LAT = 0.93;

    function project(name) {
        var c = coords[name];
        return { x: (c[1] - LON0) * COS_LAT * SCALE, y: (LAT0 - c[0]) * SCALE };
    }

    function make(tag, attrs, parent) {
        var node = document.createElementNS(NS, tag);
        for (var key in attrs) node.setAttribute(key, attrs[key]);
        if (parent) parent.appendChild(node);
        return node;
    }

    /* Everything drawn on the map keeps a constant on-screen size, even when
       the view zooms. Each "sizer" re-applies its sizes for the current scale. */

    var sizers = [];
    var u = 1;   /* SVG units per screen pixel */

    function applyScale() {
        var r = svg.getBoundingClientRect();
        if (!r.width || !r.height) return;
        u = 1 / Math.min(r.width / vb.w, r.height / vb.h);
        for (var i = 0; i < sizers.length; i++) sizers[i](u);
    }

    /* ---------- Viewport ---------- */

    var vb = { x: 0, y: 0, w: 1, h: 1 };
    var mode = hasRoute ? "route" : "full";

    function setViewBox(v) {
        vb = v;
        svg.setAttribute("viewBox", [v.x, v.y, v.w, v.h].join(" "));
        applyScale();
    }

    /* Grow a box so it matches the map's aspect ratio (no empty bars). */
    function matchAspect(box) {
        var r = svg.getBoundingClientRect();
        var target = r.width / (r.height || 1);
        var w = box.w, h = box.h;
        if (w / h < target) w = h * target; else h = w / target;
        return { x: box.cx - w / 2, y: box.cy - h / 2, w: w, h: h };
    }

    function boxOf(names, pad, minW, minH) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        names.forEach(function (n) {
            var p = project(n);
            x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        });
        return {
            cx: (x0 + x1) / 2,
            cy: (y0 + y1) / 2,
            w: Math.max(x1 - x0 + pad * 2, minW),
            h: Math.max(y1 - y0 + pad * 2, minH)
        };
    }

    function targetBox(which) {
        return which === "route"
            ? matchAspect(boxOf(route, 70, 190, 130))
            : matchAspect(boxOf(Object.keys(coords), 36, 0, 0));
    }

    var tween = null;
    function goTo(box, animate) {
        if (tween) cancelAnimationFrame(tween);
        if (!animate || reduceMotion) { setViewBox(box); return; }
        var from = vb, start = null, ms = 600;
        function step(ts) {
            if (start === null) start = ts;
            var t = Math.min((ts - start) / ms, 1);
            var e = 1 - Math.pow(1 - t, 3);
            setViewBox({
                x: from.x + (box.x - from.x) * e,
                y: from.y + (box.y - from.y) * e,
                w: from.w + (box.w - from.w) * e,
                h: from.h + (box.h - from.h) * e
            });
            if (t < 1) tween = requestAnimationFrame(step);
        }
        tween = requestAnimationFrame(step);
    }

    var routeSet = {};
    route.forEach(function (c) { routeSet[c] = true; });

    var kmByPair = {};
    edges.forEach(function (e) {
        kmByPair[e[0] + "|" + e[1]] = e[2];
        kmByPair[e[1] + "|" + e[0]] = e[2];
    });

    if (hasRoute) svg.classList.add("has-route");
    svg.classList.toggle("is-full", mode === "full");

    /* ---------- Roads ---------- */

    var roads = make("g", {}, svg);
    edges.forEach(function (e) {
        var a = project(e[0]), b = project(e[1]);
        make("line", { "class": "edge", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, roads);
    });

    /* ---------- Shortest route ---------- */

    if (hasRoute) {
        var d = route.map(function (name, i) {
            var p = project(name);
            return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1);
        }).join(" ");

        var line = make("path", { "class": "route-line", d: d }, svg);
        var len = line.getTotalLength();
        line.style.setProperty("--len", len);
        line.style.strokeDasharray = len;
        sizers.push(function (k) { line.setAttribute("stroke-width", 4.5 * k); });

        var pills = make("g", { "class": "leg-pills" }, svg);

        for (var i = 0; i < route.length - 1; i++) {
            (function (a, b) {
                var p1 = project(a), p2 = project(b);
                var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                var pill = make("g", { "class": "leg-pill" }, pills);
                var rect = make("rect", {}, pill);
                var txt = make("text", {}, pill);
                txt.textContent = kmByPair[a + "|" + b] + " km";

                var segment = Math.hypot(p2.x - p1.x, p2.y - p1.y);

                sizers.push(function (k) {
                    /* Hide the pill when the leg is too short on screen to hold it */
                    var roomy = segment / k > 95;
                    pill.style.display = roomy ? "" : "none";

                    var w = 56 * k, h = 22 * k;
                    rect.setAttribute("x", mx - w / 2);
                    rect.setAttribute("y", my - h / 2);
                    rect.setAttribute("width", w);
                    rect.setAttribute("height", h);
                    rect.setAttribute("rx", h / 2);
                    txt.setAttribute("x", mx);
                    txt.setAttribute("y", my);
                    txt.style.fontSize = 12 * k + "px";
                });
            })(route[i], route[i + 1]);
        }
    }

    /* ---------- Cities (route cities last so they sit on top) ---------- */

    var cityEls = {};
    var names = Object.keys(coords).sort(function (a, b) {
        return (routeSet[a] ? 1 : 0) - (routeSet[b] ? 1 : 0);
    });
    var cities = make("g", {}, svg);

    names.forEach(function (name) {
        var p = project(name);
        var onRoute = !!routeSet[name];
        var g = make("g", {
            "class": "city" + (onRoute ? " is-route" : ""),
            transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")",
            tabindex: 0,
            role: "button",
            "aria-label": name
        }, cities);

        var hit = make("circle", { "class": "hit" }, g);
        var dot = make("circle", { "class": "dot" }, g);
        var text = make("text", {}, g);
        text.textContent = name;

        var onRight = p.x < 330;

        /* A route city gets its label above the dot, unless the route runs
           mostly top-to-bottom there, in which case the line would cross it. */
        var labelAbove = onRoute;
        if (onRoute) {
            var idx = route.indexOf(name);
            var before = project(route[Math.max(idx - 1, 0)]);
            var after = project(route[Math.min(idx + 1, route.length - 1)]);
            labelAbove = Math.abs(after.x - before.x) >= Math.abs(after.y - before.y);
        }

        sizers.push(function (k) {
            var big = g.classList.contains("is-start") || g.classList.contains("is-end") ||
                      g.classList.contains("is-pick-from") || g.classList.contains("is-pick-to");
            var r = (onRoute ? 6.5 : 4.5) * k;
            hit.setAttribute("r", 13 * k);
            dot.setAttribute("r", r);
            text.style.fontSize = (big ? 15 : 13) * k + "px";
            text.style.strokeWidth = 4 * k + "px";

            if (labelAbove) {
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("x", 0);
                text.setAttribute("y", -(r + 8 * k));
            } else {
                text.setAttribute("text-anchor", onRight ? "start" : "end");
                text.setAttribute("x", (onRight ? 1 : -1) * (r + 6 * k));
                text.setAttribute("y", 4.5 * k);
            }
        });

        cityEls[name] = g;
    });

    if (hasRoute) {
        cityEls[route[0]].classList.add("is-start");
        cityEls[route[route.length - 1]].classList.add("is-end");
    }

    /* ---------- Zoom toggle (only when a route is shown) ---------- */

    var zoomBtn = document.getElementById("zoom-toggle");

    if (zoomBtn) {
        zoomBtn.addEventListener("click", function () {
            mode = mode === "route" ? "full" : "route";
            svg.classList.toggle("is-full", mode === "full");
            zoomBtn.textContent = mode === "route" ? "Show full map" : "Zoom to route";
            goTo(targetBox(mode), true);
        });
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { goTo(targetBox(mode), false); }, 80);
    });

    goTo(targetBox(mode), false);

    /* ---------- Form: only on the Home page ---------- */

    var form = document.getElementById("route-form");

    if (!form) {                      /* About page: the map is just an illustration */
        svg.classList.add("is-static");
        Object.keys(cityEls).forEach(function (name) {
            cityEls[name].removeAttribute("role");
            cityEls[name].setAttribute("tabindex", "-1");
        });
        return;
    }

    var from = document.getElementById("source");
    var to = document.getElementById("destination");
    var swap = document.getElementById("swap");
    var errorBox = document.getElementById("form-error");
    var findBtn = document.getElementById("find");

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = !message;
    }

    function syncPicks() {
        Object.keys(cityEls).forEach(function (name) {
            cityEls[name].classList.toggle("is-pick-from", from.value === name);
            cityEls[name].classList.toggle("is-pick-to", to.value === name);
        });
        applyScale();
    }

    function pick(name) {
        showError("");
        if (!from.value || (from.value && to.value)) {
            from.value = name;
            to.value = "";
        } else if (name !== from.value) {
            to.value = name;
        }
        syncPicks();
    }

    Object.keys(cityEls).forEach(function (name) {
        var g = cityEls[name];
        g.addEventListener("click", function () { pick(name); });
        g.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                pick(name);
            }
        });
    });

    from.addEventListener("change", function () { showError(""); syncPicks(); });
    to.addEventListener("change", function () { showError(""); syncPicks(); });

    swap.addEventListener("click", function () {
        var a = from.value;
        from.value = to.value;
        to.value = a;
        swap.classList.toggle("spin");
        showError("");
        syncPicks();
    });

    form.addEventListener("submit", function (ev) {
        if (!from.value || !to.value) {
            ev.preventDefault();
            showError("Choose both a starting city and a destination.");
            (from.value ? to : from).focus();
            return;
        }
        if (from.value === to.value) {
            ev.preventDefault();
            showError("Pick two different cities.");
            return;
        }
        findBtn.setAttribute("aria-busy", "true");
        findBtn.querySelector("span").textContent = "Finding route…";
    });

    syncPicks();
})();
