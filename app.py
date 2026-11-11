from flask import Flask, render_template, request, redirect, url_for
from collections import deque
import heapq
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Folder names are capitalised in this project (Templates, Static, Data).
# Pointing Flask at them explicitly makes the app work on Linux too,
# where file names are case-sensitive.
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "Templates"),
    static_folder=os.path.join(BASE_DIR, "Static"),
)

SPEED_OPTIONS = (40, 60, 80, 100)


def load_json(filename):

    path = os.path.join(BASE_DIR, "Data", filename)

    with open(path, encoding="utf-8") as file:
        return json.load(file)


def bfs_path(graph, start, end):

    queue = deque()

    queue.append((start, [start]))

    visited = set()

    while queue:

        current_city, path = queue.popleft()

        if current_city == end:
            return path

        visited.add(current_city)

        for neighbor in graph[current_city]:

            if neighbor not in visited:

                queue.append(
                    (
                        neighbor,
                        path + [neighbor]
                    )
                )

    return None


def calculate_distance(graph, path):

    total_distance = 0

    for i in range(len(path) - 1):

        current_city = path[i]
        next_city = path[i + 1]

        total_distance += graph[current_city][next_city]

    return total_distance


def dijkstra(graph, start, end):

    pq = []

    heapq.heappush(
        pq,
        (0, start, [start])
    )

    visited = set()

    while pq:

        distance, current_city, path = heapq.heappop(pq)

        if current_city == end:
            return path, distance

        if current_city in visited:
            continue

        visited.add(current_city)

        for neighbor, weight in graph[current_city].items():

            if neighbor not in visited:

                heapq.heappush(
                    pq,
                    (
                        distance + weight,
                        neighbor,
                        path + [neighbor]
                    )
                )

    return None, None


def estimate_time(distance, speed):

    hours = distance / speed
    h = int(hours)
    minutes = int((hours-h)*60)
    return f"{h} hr {minutes} min"


def unique_edges(routes):
    """Each road once, as [city_a, city_b, km] (the JSON lists both directions)."""

    seen = set()
    edges = []

    for a, neighbors in routes.items():
        for b, km in neighbors.items():
            key = tuple(sorted((a, b)))
            if key not in seen:
                seen.add(key)
                edges.append([a, b, km])

    return edges


def page_context(**extra):
    """Everything index.html needs; routes override the defaults."""

    routes = load_json("routes.json")
    coords = load_json("coords.json")
    edges = unique_edges(routes)

    context = {
        "cities": sorted(routes.keys()),
        "speeds": SPEED_OPTIONS,
        "selected_source": None,
        "selected_destination": None,
        "selected_speed": 60,
        "result": None,
        "error": None,
        "show_about": False,
        "city_count": len(routes),
        "road_count": len(edges),
    }

    context.update(extra)

    # Data the map script draws from (read by Static/script.js)
    context["graph"] = {
        "coords": coords,
        "edges": edges,
        "route": context["result"]["path_list"]
        if context["result"] and context["result"]["found"]
        else [],
    }

    return context


@app.route("/")
def home():

    return render_template("index.html", **page_context())


@app.route("/about")
def about():

    return render_template("index.html", **page_context(show_about=True))


@app.route("/route", methods=["GET", "POST"])
def route():

    if request.method == "GET":
        return redirect(url_for("home"))

    source = request.form.get("source", "")
    destination = request.form.get("destination", "")

    try:
        speed = int(request.form.get("speed", 60))
    except ValueError:
        speed = 60

    if speed not in SPEED_OPTIONS:
        speed = 60

    routes = load_json("routes.json")

    context = {
        "selected_source": source or None,
        "selected_destination": destination or None,
        "selected_speed": speed,
    }

    if source not in routes or destination not in routes:
        context["error"] = "Choose both a starting city and a destination."
        return render_template("index.html", **page_context(**context))

    if source == destination:
        context["error"] = "Pick two different cities."
        return render_template("index.html", **page_context(**context))

    path, total_distance = dijkstra(
        routes,
        source,
        destination
    )

    if path:

        legs = [
            {
                "from": path[i],
                "to": path[i + 1],
                "km": routes[path[i]][path[i + 1]],
            }
            for i in range(len(path) - 1)
        ]

        context["result"] = {
            "found": True,
            "path": " → ".join(path),
            "path_list": path,
            "legs": legs,
            "distance": total_distance,
            "time": estimate_time(total_distance, speed),
            "speed": speed,
        }

    else:

        context["result"] = {
            "found": False,
            "path": "No Route Found",
            "path_list": [],
            "legs": [],
            "distance": "-",
        }

    return render_template("index.html", **page_context(**context))


if __name__ == "__main__":
    app.run(debug=True)
