const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// ============================================
// SAN ANDREAS ENROUTE WAYPOINT NETWORK
// Hand-encoded from the L1 enroute chart
// ============================================
const WAYPOINTS = {
  // Northern region
  ULTOP:   { x: 620, y: 45,  conn: ['WUTHR', 'GORDO'] },
  CLUBS:   { x: 305, y: 100, conn: ['WUTHR', 'PALIS'] },
  WUTHR:   { x: 395, y: 78,  conn: ['CLUBS', 'ULTOP', 'PALIS', 'CARTO'] },
  GORDO:   { x: 730, y: 265, conn: ['ULTOP', 'OSCAR', 'SANTO'] },
  OSCAR:   { x: 605, y: 260, conn: ['GORDO', 'SANTO', 'CHILI', 'CARTO'] },
  PALIS:   { x: 380, y: 235, conn: ['CLUBS', 'WUTHR', 'CARTO', 'MCJBI'] },
  CARTO:   { x: 470, y: 320, conn: ['PALIS', 'WUTHR', 'OSCAR', 'CHILI', 'CASIO', 'MCJBI'] },
  CHILI:   { x: 525, y: 375, conn: ['CARTO', 'OSCAR', 'CASIO', 'KSSIR', 'ALAMO'] },
  CASIO:   { x: 320, y: 460, conn: ['CARTO', 'CHILI', 'MCJBI'] },
  KSSIR:   { x: 635, y: 428, conn: ['CHILI', 'ALAMO', 'SAUDI'] },
  SAUDI:   { x: 770, y: 442, conn: ['KSSIR', 'KATVU', 'LIBOR'] },
  KATVU:   { x: 775, y: 385, conn: ['SAUDI'] },
  ALAMO:   { x: 510, y: 530, conn: ['CHILI', 'KSSIR', 'SANCT', 'CLUBS', 'SANTO'] },
  MCJBI:   { x: 255, y: 555, conn: ['CASIO', 'PALIS', 'FOZEDA', 'CLUBS'] },
  LIBOR:   { x: 780, y: 570, conn: ['SAUDI', 'MAERO'] },
  SANTO:   { x: 575, y: 545, conn: ['ALAMO', 'GORDO', 'OSCAR', 'CLUBS', 'MAERO'] },
  CLUBS2:  { x: 445, y: 595, conn: ['ALAMO', 'MCJBI', 'CLAMA'] },

  // Central region
  FOZEDA:  { x: 265, y: 675, conn: ['MCJBI', 'LABUA', 'ZANCO', 'BELEN'] },
  LABUA:   { x: 350, y: 725, conn: ['FOZEDA', 'ZANCO', 'ADKIN', 'BELEN'] },
  ZANCO:   { x: 145, y: 780, conn: ['FOZEDA', 'LABUA', 'FARGO', 'SARSA'] },
  BELEN:   { x: 245, y: 800, conn: ['LABUA', 'FOZEDA', 'HOBBI', 'BRIAR'] },
  ADKIN:   { x: 395, y: 790, conn: ['LABUA', 'HOBBI', 'VINDI'] },
  SARSA:   { x: 45,  y: 900, conn: ['ZANCO', 'PALDO', 'FARGO'] },
  FARGO:   { x: 140, y: 855, conn: ['SARSA', 'ZANCO', 'PALDO'] },
  BRIAR:   { x: 275, y: 865, conn: ['BELEN', 'KRIKR'] },
  KRIKR:   { x: 305, y: 890, conn: ['BRIAR', 'CHIMA'] },
  CHIMA:   { x: 330, y: 925, conn: ['KRIKR', 'VINDI', 'WUTTAX'] },
  WUTTAX:  { x: 390, y: 930, conn: ['CHIMA', 'VINDI', 'LOMAX'] },
  VINDI:   { x: 480, y: 940, conn: ['CHIMA', 'ADKIN', 'WUTTAX', 'LOMAX', 'ROMBO'] },
  LOMAX:   { x: 470, y: 970, conn: ['VINDI', 'WUTTAX', 'ECLIP'] },
  ECLIP:   { x: 350, y: 970, conn: ['LOMAX', 'PAPIS', 'ALTAX'] },
  HOBBI:   { x: 405, y: 855, conn: ['ADKIN', 'BELEN', 'ALTAX', 'PAPIS'] },
  PALMD:   { x: 105, y: 940, conn: ['FARGO', 'SARSA', 'PAPIS', 'PALDO'] },
  PAPIS:   { x: 155, y: 905, conn: ['PALMD', 'FARGO', 'HOBBI', 'COTTE'] },
  COTTE:   { x: 210, y: 940, conn: ['PAPIS', 'KRIKR', 'GOMER'] },
  ALTAX:   { x: 430, y: 1020, conn: ['HOBBI', 'ECLIP', 'ROMBO', 'ROCCO'] },
  ROMBO:   { x: 520, y: 1015, conn: ['VINDI', 'ALTAX', 'REINO', 'COLOR'] },
  REINO:   { x: 570, y: 1030, conn: ['ROMBO', 'COLOR', 'TEVIS'] },
  COLOR:   { x: 780, y: 920, conn: ['ROMBO', 'REINO', 'KLAX', 'DOCKX'] },
  PALDO:   { x: 30,  y: 1090, conn: ['SARSA', 'FARGO', 'PAPIS', 'SOTAX'] },
  SOTAX:   { x: 75,  y: 1130, conn: ['PALDO', 'GOMER'] },
  GOMER:   { x: 210, y: 1050, conn: ['COTTE', 'SOTAX', 'HOBBI', 'DUNES', 'GORNU'] },
  DUNES:   { x: 215, y: 1165, conn: ['GOMER', 'PIRRE', 'CAJUN'] },
  KLAX:    { x: 700, y: 985, conn: ['COLOR', 'OSANA', 'DOCKX'] },
  GORNU:   { x: 245, y: 1150, conn: ['GOMER', 'PIRRE', 'GILMO'] },
  PIRRE:   { x: 195, y: 1180, conn: ['DUNES', 'GORNU', 'GILMO', 'LIMBO'] },
  CAJUN:   { x: 285, y: 1200, conn: ['DUNES', 'MAZAR'] },
  MAZAR:   { x: 320, y: 1215, conn: ['CAJUN', 'FIZZL', 'BUENA'] },
  GILMO:   { x: 175, y: 1215, conn: ['GORNU', 'PIRRE', 'LIMBO'] },
  LIMBO:   { x: 85,  y: 1215, conn: ['PIRRE', 'GILMO', 'LJPOA', 'SLIWI'] },
  FIZZL:   { x: 540, y: 1180, conn: ['MAZAR', 'OSANA', 'TEVIS'] },
  BUENA:   { x: 320, y: 1280, conn: ['MAZAR', 'SWATT'] },
  OSANA:   { x: 765, y: 1120, conn: ['COLOR', 'FIZZL', 'DOCKX'] },

  // Southern region
  LJPOA:   { x: 65,  y: 1245, conn: ['LIMBO', 'LAMBO', 'SLIWI'] },
  SLIWI:   { x: 40,  y: 1270, conn: ['LIMBO', 'LJPOA', 'LAMBO'] },
  LAMBO:   { x: 145, y: 1290, conn: ['LJPOA', 'SLIWI', 'GLBRT'] },
  GLBRT:   { x: 240, y: 1300, conn: ['LAMBO', 'SWATT', 'DOCKX'] },
  SWATT:   { x: 285, y: 1320, conn: ['BUENA', 'GLBRT', 'DOCKX'] },
  DOCKX:   { x: 610, y: 1190, conn: ['COLOR', 'KLAX', 'GLBRT', 'SWATT', 'SOSAP', 'ILBUR'] },
  SOSAP:   { x: 260, y: 1320, conn: ['DOCKX', 'GLBRT'] },
  ILBUR:   { x: 240, y: 1355, conn: ['DOCKX', 'SOSAP'] },
  TEVIS:   { x: 620, y: 1100, conn: ['REINO', 'COLOR', 'FIZZL', 'DOCKX'] },
  LSAND:   { x: 425, y: 1320, conn: ['DOCKX', 'GLBRT'] },
  OJIMA:   { x: 1345,y: 1270, conn: ['DOCKX', 'AEERO', 'KONAI'] },
  AEERO:   { x: 1090,y: 1320, conn: ['OJIMA', 'KONAI'] },
  KONAI:   { x: 780, y: 1450, conn: ['OJIMA', 'AEERO', 'LAMBO', 'GLBRT'] },
  ILTOR:   { x: 1520,y: 700,  conn: ['COLOR'] },

  // South coast
  GUAVA:   { x: 165, y: 1400, conn: ['LAMBO', 'GLBRT', 'SUAVA'] },
  SUAVA:   { x: 115, y: 1420, conn: ['GUAVA', 'MORDU'] },
  MORDU:   { x: 35,  y: 1415, conn: ['SUAVA', 'LAMBO'] },

  // Far east
  LOMPO:   { x: 1740,y: 715,  conn: ['KLAX', 'ILTOR'] },
  LOMPO2:  { x: 1740,y: 715,  conn: ['ILTOR'] }
};

// Build adjacency for bidirectional lookup
const ADJ = {};
Object.keys(WAYPOINTS).forEach(function(key) {
  ADJ[key] = WAYPOINTS[key].conn || [];
});

// Calculate approximate distance between two waypoints (in nautical miles)
// Based on chart scale: the map represents roughly 20x20 NM, so we scale pixel distance
function waypointDistance(a, b) {
  var A = WAYPOINTS[a];
  var B = WAYPOINTS[b];
  if (!A || !B) return 0;
  var dx = A.x - B.x;
  var dy = A.y - B.y;
  var px = Math.sqrt(dx * dx + dy * dy);
  // Scale: 100 pixels ≈ 1 NM (approximate for the SA chart)
  return Math.round(px / 100 * 10) / 10;
}

// Dijkstra shortest path
function findRoute(start, end) {
  if (!WAYPOINTS[start]) return { error: 'Unknown start waypoint: ' + start };
  if (!WAYPOINTS[end]) return { error: 'Unknown end waypoint: ' + end };
  if (start === end) return { error: 'Start and end are the same' };

  var distances = {};
  var previous = {};
  var unvisited = new Set(Object.keys(WAYPOINTS));

  Object.keys(WAYPOINTS).forEach(function(k) {
    distances[k] = Infinity;
  });
  distances[start] = 0;

  while (unvisited.size > 0) {
    var current = null;
    var minDist = Infinity;
    unvisited.forEach(function(node) {
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

  // Calculate total distance
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

// GET /api/routes/waypoints — list all waypoints
router.get('/waypoints', function(req, res) {
  var list = Object.keys(WAYPOINTS).map(function(name) {
    return {
      name: name,
      x: WAYPOINTS[name].x,
      y: WAYPOINTS[name].y,
      connections: WAYPOINTS[name].conn.length
    };
  }).sort(function(a, b) { return a.name.localeCompare(b.name); });

  res.json({ waypoints: list });
});

// POST /api/routes/find — compute route
router.post('/find', function(req, res) {
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
