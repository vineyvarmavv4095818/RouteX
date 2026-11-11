# RouteX

A DSA-based Smart Route Planner built using Flask and Dijkstra Algorithm.

## Features

- Shortest Path Calculation (Dijkstra's algorithm with a min-heap)
- Distance Estimation, with the distance of every leg
- Travel Time Estimator
- Dynamic Speed Selection (40 / 60 / 80 / 100 km/h)
- Interactive road-network map: tap cities to pick them, the route zooms into view
- Responsive map-first dashboard UI (desktop, tablet, phone)
- Light / dark theme toggle (remembers your choice, follows your system setting by default)

## Technologies Used

- Python
- Flask
- HTML, CSS, JavaScript (SVG map, no extra libraries)
- Dijkstra Algorithm
- JSON

## Project structure

```
app.py              Flask app and the algorithms (BFS, Dijkstra)
Templates/index.html  Page template (Home and About)
Static/style.css      Styling
Static/script.js      Draws the map, swap button, tap-to-select
Data/routes.json      Roads between cities (km)
Data/coords.json      Latitude / longitude of each city (used to draw the map)
```

## Run it

```
pip install flask
python app.py
```

Then open http://127.0.0.1:5000

## Adding a city

1. Add the city and its roads to `Data/routes.json` (add the road in both directions).
2. Add its `[latitude, longitude]` to `Data/coords.json`.
