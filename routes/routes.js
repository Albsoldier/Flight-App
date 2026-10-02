const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// ============================================
// SAN ANDREAS ENROUTE WAYPOINT NETWORK
// Based on the SAAA FIR Enroute Low Altitude chart
// Coordinates are pixel positions from the chart
// ============================================
const WAYPOINTS = {
  // ---------- NORTH / NORTHEAST ----------
  OLRIQ:  { x: 165,  y: 100,  conn: ['VUTOX', 'PALEB'] },
  VUTOX:  { x: 320,  y: 82,   conn: ['OLRIQ', 'PALEB', 'ULTOR', 'GRAPO'] },
  ULTOR:  { x: 660,  y: 30,   conn: ['VUTOX', 'GORDO', 'GRAPO'] },
  PALEB:  { x: 240,  y: 280,  conn: ['OLRIQ', 'VUTOX', 'CHITO'] },
  GRAPO:  { x: 585,  y: 385,  conn: ['ULTOR', 'VUTOX', 'CHILI', 'GORDO', 'KSSGR'] },
  GORDO:  { x: 770,  y: 315,  conn: ['ULTOR', 'GRAPO', 'SEROD'] },
  CHITO:  { x: 420,  y: 465,  conn: ['PALEB', 'CHILI', 'CASDI'] },
  CHILI:  { x: 510,  y: 550,  conn: ['GRAPO', 'CHITO', 'CASDI', 'KSSGR', 'ALAMO'] },
  KSSGR:  { x: 720,  y: 565,  conn: ['GRAPO', 'CHILI', 'SEROD'] },
  KATVI:  { x: 890,  y: 515,  conn: ['SEROD', 'SANCI'] },
  CASDI:  { x: 235,  y: 620,  conn: ['CHITO', 'CHILI', 'MOJSI'] },
  SANCI:  { x: 855,  y: 600,  conn: ['KATVI', 'SEROD', 'LUXOR'] },
  MOJSI:  { x: 615,  y: 685,  conn: ['CASDI', 'ALAMO', 'OLMAK', 'MOJSJ'] },
  ALAMO:  { x: 460,  y: 722,  conn: ['CHILI', 'KSSGR', 'SANDY', 'MOJSI', 'OLMAK'] },
  SANDY:  { x: 555,  y: 745,  conn: ['ALAMO', 'MALBO'] },
  KSSA:   { x: 590,  y: 815,  conn: ['MALBO'] },
  MALBO:  { x: 715,  y: 780,  conn: ['SANDY', 'KSSA', 'SEROD', 'LUXOR'] },
  LUXOR:  { x: 940,  y: 685,  conn: ['SANCI', 'MALBO'] },
  SEROD:  { x: 715,  y: 570,  conn: ['GORDO', 'KSSGR', 'KATVI', 'SANCI', 'MALBO'] },
  OLMAK:  { x: 640,  y: 775,  conn: ['MOJSI', 'ALAMO'] },
  MOJSJ:  { x: 205,  y: 725,  conn: ['MOJSI', 'BARBA', 'PANDA'] },

  // ---------- CENTRAL ----------
  BARBA:  { x: 155,  y: 780,  conn: ['MOJSJ', 'PANDA'] },
  PANDA:  { x: 445,  y: 900,  conn: ['MOJSJ', 'BARBA', 'PACIF', 'CUTIE'] },
  PACIF:  { x: 285,  y: 1075, conn: ['PANDA', 'GOMEN', 'CUTIE'] },
  CUTIE:  { x: 505,  y: 1090, conn: ['PANDA', 'PACIF', 'GOMEN'] },
  GOMEN:  { x: 635,  y: 1180, conn: ['PACIF', 'CUTIE', 'PIERR', 'VESPU'] },
  PIERR:  { x: 685,  y: 1290, conn: ['GOMEN', 'GONKU', 'STRAW'] },
  GONKU:  { x: 730,  y: 1180, conn: ['PIERR'] },
  STRAW:  { x: 855,  y: 1290, conn: ['PIERR', 'DAVIS'] },
  DAVIS:  { x: 1090, y: 1160, conn: ['STRAW', 'MAZAR'] },
  MAZAR:  { x: 1070, y: 1275, conn: ['DAVIS', 'FIZEL', 'ARDOP'] },
  FIZEL:  { x: 1570, y: 1410, conn: ['MAZAR', 'DOCKX', 'ELBUR'] },
  ADVIX:  { x: 985,  y: 715,  conn: ['GIBBZ', 'SARTO', 'CHUMA'] },
  SELEN:  { x: 640,  y: 570,  conn: ['CHUMA', 'GIBBZ'] },
  GIBBZ:  { x: 1000, y: 640,  conn: ['ADVIX', 'SELEN', 'CHUMA', 'VINEW'] },
  CHUMA:  { x: 620,  y: 720,  conn: ['SELEN', 'GIBBZ', 'WUTAX', 'ADVIX'] },
  WUTAX:  { x: 825,  y: 745,  conn: ['CHUMA', 'VINEW', 'ADVIX'] },
  VINEW:  { x: 1240, y: 710,  conn: ['GIBBZ', 'WUTAX', 'SARTO', 'COLGB'] },
  SARTO:  { x: 1355, y: 615,  conn: ['ADVIX', 'VINEW', 'WINDY'] },
  WINDY:  { x: 1560, y: 595,  conn: ['SARTO', 'COLGB'] },
  COLGB:  { x: 1745, y: 690,  conn: ['VINEW', 'WINDY', 'LOMAX', 'ELBUR', 'LOMPO'] },
  LOMAX:  { x: 1065, y: 895,  conn: ['COLGB', 'ECLIP', 'VINEW'] },
  ECLIP:  { x: 875,  y: 1000, conn: ['LOMAX', 'ALTAS', 'ROCFO'] },
  ALTAS:  { x: 1080, y: 1025, conn: ['ECLIP', 'RESVO', 'DIMON', 'ROCFO'] },
  RESVO:  { x: 1665, y: 1015, conn: ['ALTAS', 'DIMON'] },
  DIMON:  { x: 1290, y: 1100, conn: ['ALTAS', 'RESVO', 'LOSAL', 'ELBUR'] },
  LOSAL:  { x: 1495, y: 1125, conn: ['DIMON', 'ELBUR'] },
  ELBUR:  { x: 1290, y: 1290, conn: ['DIMON', 'LOSAL', 'FIZEL', 'DOCKX'] },
  ROCFO:  { x: 850,  y: 1080, conn: ['ECLIP', 'ALTAS', 'DELPO'] },
  DELPO:  { x: 890,  y: 1100, conn: ['ROCFO'] },

  // ---------- SOUTH / SOUTHWEST ----------
  ILPOD:  { x: 145,  y: 1550, conn: ['ILMAD', 'MORDU'] },
  ILMAD:  { x: 395,  y: 1655, conn: ['ILPOD', 'ARDOP'] },
  ARDOP:  { x: 410,  y: 1755, conn: ['ILMAD', 'MAZAR', 'ARDUK'] },
  ARDUK:  { x: 870,  y: 1830, conn: ['ARDOP', 'SODAP', 'ULMOR'] },
  SODAP:  { x: 570,  y: 2020, conn: ['ARDUK', 'ULMOR', 'LANGO'] },
  ULMOR:  { x: 685,  y: 2070, conn: ['ARDUK', 'SODAP', '138D01', 'LANGO'] },
  "138D01": { x: 1035, y: 2050, conn: ['ULMOR', 'DOCKX'] },
  MORDU:  { x: 30,   y: 2265, conn: ['ILPOD', 'DUPAX'] },
  DUPAX:  { x: 400,  y: 2445, conn: ['MORDU', 'LANGO'] },
  LANGO:  { x: 735,  y: 2325, conn: ['SODAP', 'ULMOR', 'DUPAX'] },
  KOPAD:  { x: 1470, y: 2745, conn: ['DIVAS'] },

  // ---------- EAST / OFFSHORE ----------
  DOCKX:  { x: 1030, y: 1650, conn: ['FIZEL', 'ELBUR', '138D01', 'DIVAS'] },
  ABARU:  { x: 1055, y: 2015, conn: ['DIVAS'] },
  DIVAS:  { x: 1290, y: 1925, conn: ['DOCKX', 'ABARU', 'KOPAD', 'LOMPO'] },
  LOMPO:  { x: 1660, y: 1750, conn: ['COLGB', 'DIVAS'] }
};

// Build adjacency for bidirectional lookup
const ADJ = {};
Object.keys(WAYPOINTS).forEach(function (key) {
  ADJ[key] = WAYPOINTS[key].conn || [];
});

// Distance between two waypoints (in NM, approximate)
function waypointDistance(a, b) {
  var A = WAYPOINTS[a];
  var B = WAYPOINTS[b];
  if (!A || !B) return 0;
  var dx = A.x - B.x;
  var dy = A.y - B.y;
  var px = Math.sqrt(dx * dx + dy * dy);
  // Chart scale: roughly 100 pixels = 1 NM
  return Math.round((px / 100) * 10) / 10;
}

// Dijkstra shortest path
function findRoute(start, end) {
  if (!WAYPOINTS[start]) return { error: 'Unknown start waypoint: ' + start };
  if (!WAYPOINTS[end]) return { error: 'Unknown end waypoint: ' + end };
  if (start === end) return { error: 'Start and end are the same waypoint' };

  var distances = {};
  var previous = {};
  var unvisited = new Set(Object.keys(WAYPOINTS));

  Object.keys(WAYPOINTS).forEach(function (k) { distances[k] = Infinity; });
  distances[start] = 0;

  while (unvisited.size > 0) {
    var current = null;
    var minDist = Infinity;
    unvisited.forEach(function (node) {
      if (distances[node] < minDist) {
        minDist = distances[node];
        current = node;
      }
    });

    if (current === null || distances[current] === Infinity) break;
    if (current === end) break;

    unvisited.delete(current);

    var neighbors = ADJ[current] || [];
    for (var i = 0; i < neighbors.length; i++) {
      var neighbor = neighbors[i];
      if (!unvisited.has(neighbor)) continue;
      if (!WAYPOINTS[neighbor]) continue;
      var alt = distances[current] + waypointDistance(current, neighbor);
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        previous[neighbor] = current;
      }
    }
  }

  if (distances[end] === Infinity) {
    return { error: 'No route found between ' + start + ' and ' + end };
  }

  // Reconstruct path
  var path = [];
  var node = end;
  while (node) {
    path.unshift(node);
    node = previous[node];
  }

  var totalDistance = 0;
  for (var j = 1; j < path.length; j++) {
    totalDistance += waypointDistance(path[j - 1], path[j]);
  }
  totalDistance = Math.round(totalDistance * 10) / 10;

  return {
    success: true,
    from: start,
    to: end,
    path: path,
    distance_nm: totalDistance,
    waypoint_count: path.length
  };
}

// GET /api/routes/waypoints
router.get('/waypoints', function (req, res) {
  var list = Object.keys(WAYPOINTS).map(function (name) {
    return {
      name: name,
      x: WAYPOINTS[name].x,
      y: WAYPOINTS[name].y,
      connections: WAYPOINTS[name].conn.length
    };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  res.json({ waypoints: list });
});

// POST /api/routes/find
router.post('/find', function (req, res) {
  var from = (req.body.from || '').toUpperCase().trim();
  var to = (req.body.to || '').toUpperCase().trim();

  if (!from || !to) {
    return res.status(400).json({ error: 'Both from and to are required' });
  }

  var result = findRoute(from, to);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

module.exports = router;
