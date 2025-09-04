
// Prefixes / globals
const ukAirportPrefix = "EG";
const controllerPrefixes = ["EG", "LON", "MAN", "LTC", "STC", "THAMES", "ESSEX", "SCO"];

let allControllers = [];
let allPilots = [];

// View modes: "controllers", "airports", "auto"
let currentView = "controllers";
let autoRotateInterval = null;

const subtitleEl = document.getElementById("subtitle");
const searchInput = document.getElementById("searchInput");
const atcGrid = document.getElementById("atcGrid");
const viewToggle = document.getElementById("viewToggle");
const buttons = viewToggle.querySelectorAll("button");
const lastUpdatedEl = document.getElementById("lastUpdated");

// Badge color helper for controllers
function getBadgeColor(callsign) {
    if (callsign.includes("GND") || callsign.includes("DEL")) return "bg-gray-500";
    if (callsign.includes("TWR")) return "bg-vatsimPrimary";
    if (callsign.includes("APP") || callsign.includes("DEP")) return "bg-blue-600";
    if (callsign.includes("CTR")) return "bg-vatsimSecondary";
    return "bg-gray-700";
}

// Calculate distance between two lat/lon points in km using Haversine formula
function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = angle => (angle * Math.PI) / 180;
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Estimate time to landing (minutes) given distance (km) and groundspeed (knots)
function minutesToLanding(distanceKmVal, groundspeedKnots) {
    if (!groundspeedKnots || groundspeedKnots === 0) return Infinity;
    const knotsToKmPerMin = 1.852 / 60; // 1 knot = 1.852 km/h, so /60 to get km/min
    const speedKmMin = groundspeedKnots * knotsToKmPerMin;
    return distanceKmVal / speedKmMin;
}

// Render controllers list
function renderControllers(list) {
    atcGrid.innerHTML = "";
    if (list.length === 0) {
        atcGrid.innerHTML = `<p class="col-span-full text-center text-gray-600 dark:text-gray-400 font-body">No controllers found.</p>`;
        return;
    }
    list.forEach(atc => {
        const badgeColor = getBadgeColor(atc.callsign);
        const card = `
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-md p-5 hover:scale-105 transition-transform duration-200">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xl font-heading font-bold text-gray-900 dark:text-gray-100">${atc.callsign}</span>
              <span class="${badgeColor} text-white text-xs px-2 py-1 rounded-md uppercase font-semibold">
                ${atc.callsign.split("_").pop()}
              </span>
            </div>
            <p class="text-gray-800 dark:text-gray-300 mb-1 font-body">👤 ${atc.name || "Unknown"}</p>
            <p class="text-gray-600 dark:text-gray-400 font-body">📡 ${atc.frequency || "-"}</p>
          </div>
        `;
        atcGrid.innerHTML += card;
    });
}

// Render airport arrivals/departures with busy badge on departures > 25
function renderAirports(airportStats) {
    atcGrid.innerHTML = "";

    if (Object.keys(airportStats).length === 0) {
        atcGrid.innerHTML = `<p class="col-span-full text-center text-gray-600 dark:text-gray-400 font-body">No airport stats available.</p>`;
        return;
    }

    const sortedAirports = Object.entries(airportStats).sort(([,a],[,b]) => (b.arrivals + b.departures) - (a.arrivals + a.departures));

    sortedAirports.forEach(([icao, stats]) => {
        const busyBadge = stats.departures > 25
            ? `<span class="inline-block bg-red-600 text-white text-xs px-2 py-1 rounded-md font-semibold ml-2">Busy</span>`
            : "";
        const card = `
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-md p-5 hover:scale-105 transition-transform duration-200">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xl font-heading font-bold text-gray-900 dark:text-gray-100">${icao}</span>
              ${busyBadge}
            </div>
            <p class="text-gray-800 dark:text-gray-300 mb-1 font-body">✈️ Arrivals: ${stats.arrivals}</p>
            <p class="text-gray-600 dark:text-gray-400 font-body">🛫 Departures: ${stats.departures}</p>
          </div>
        `;
        atcGrid.innerHTML += card;
    });
}

// ✅ Original airport logic restored:
// - Departures counted only if aircraft is on ground at a UK airport
// - Arrivals counted only if inbound to a UK airport, airborne, and within 90 minutes based on distance & groundspeed
function calculateAirportStats(pilots) {
    const stats = {};

    // (Kept as in your original; includes some duplicates which you can clean later if you like)
    const airportCoords = {
        "EGLL": {lat: 51.4706, lon: -0.4619},
        "EGKK": {lat: 51.1488, lon: -0.1921},
        "EGSS": {lat: 51.8850, lon: 0.2350},
        "EGCC": {lat: 53.3494, lon: -2.2795},
        "EGPH": {lat: 55.9501, lon: -3.3723},
        "EGGW": {lat: 51.8747, lon: -0.3683},
        "EGPF": {lat: 55.8719, lon: -4.4331},
        "EGBB": {lat: 52.4539, lon: -1.7480},
        "EGLC": {lat: 51.5053, lon: 0.0553},
        "EGGD": {lat: 51.3827, lon: -2.7191},
        "EGGP": {lat: 53.3336, lon: -2.8497},
        "EGAA": {lat: 54.6575, lon: -6.2158},
        "EGNT": {lat: 55.0380, lon: -1.6896},
        "EGNX": {lat: 52.8311, lon: -1.3281},
        "EGPK": {lat: 55.5020, lon: -4.5870},
        "EGNM": {lat: 53.8659, lon: -1.6606},
        "EGPD": {lat: 57.2019, lon: -2.1978},
        "EGAC": {lat: 54.6181, lon: -5.8725},
        "EGHI": {lat: 50.9503, lon: -1.3568},
        "EGPE": {lat: 57.5425, lon: -4.0475},
        "EGFF": {lat: 51.3967, lon: -3.3433},
        "EGMC": {lat: 51.5706, lon: 0.6936},
        "EGTE": {lat: 50.7343, lon: -3.4140},
        "EGHH": {lat: 50.7805, lon: -1.8396},
        "EGLF": {lat: 51.2758, lon: -0.7763},
        "EGHQ": {lat: 50.4406, lon: -4.9954},
        "EGSH": {lat: 52.6758, lon: 1.2828},
        "EGKB": {lat: 51.3308, lon: 0.0325},
        "EGNV": {lat: 54.5092, lon: -1.4294},
        "EGTK": {lat: 51.8369, lon: -1.3200},
        "EGSU": {lat: 52.0908, lon: 0.1319},
        "EGMD": {lat: 50.9562, lon: 0.9391},
        "EGKA": {lat: 50.8356, lon: -0.2972},
        "EGNJ": {lat: 53.5762, lon: -0.3495},
        "EGUN": {lat: 52.3619, lon: 0.4864},
        "EGVN": {lat: 51.7500, lon: -1.5836},
        "EGPB": {lat: 59.8789, lon: -1.2956},
        "EGBJ": {lat: 51.8942, lon: -2.1672},
        "EGPA": {lat: 58.9578, lon: -2.9050},
        "EGPC": {lat: 58.4589, lon: -3.0931},
        "EGBP": {lat: 51.6685, lon: -2.0566},
        "EGBE": {lat: 52.3697, lon: -1.4797},
        "EGSC": {lat: 52.2050, lon: 0.1750},
        "EGLK": {lat: 51.3239, lon: -0.8475},
        "EGAE": {lat: 55.0428, lon: -7.1611},
        "EGTB": {lat: 51.6118, lon: -0.8083},
        "EGWU": {lat: 51.5530, lon: -0.4182},
        "EGPN": {lat: 56.4525, lon: -3.0258},
        "EGPO": {lat: 58.2156, lon: -6.3311},
        "EGNH": {lat: 53.7717, lon: -3.0286},
        "EGHR": {lat: 50.8598, lon: -0.7601},
        "EGBK": {lat: 52.3053, lon: -0.7931},
        "EGNR": {lat: 53.1781, lon: -2.9778},
        "EGHJ": {lat: 50.6781, lon: -1.1094},
        "EGUL": {lat: 52.4095, lon: 0.5612},
        "EGVA": {lat: 51.6836, lon: -1.7892},
        "EGHC": {lat: 50.1028, lon: -5.6706},
        "EGEO": {lat: 56.4635, lon: -5.3997},
        "EGXW": {lat: 53.1662, lon: -0.5238},
        "EGHL": {lat: 51.1874, lon: -1.0317},
        "EGNC": {lat: 54.9375, lon: -2.8092},
        "EGHE": {lat: 49.9134, lon: -6.2919},
        "EGPR": {lat: 57.0228, lon: -7.4431},
        "EGPL": {lat: 57.4811, lon: -7.3628},
        "EGPI": {lat: 55.6827, lon: -6.2575},
        "EGBN": {lat: 52.9200, lon: -1.0792},
        "EGKR": {lat: 51.2136, lon: -0.1386},
        "EGQS": {lat: 57.7052, lon: -3.3392},
        "EGFE": {lat: 51.8331, lon: -4.9611},
        "EGDY": {lat: 51.0094, lon: -2.6388},
        "EGEP": {lat: 59.3517, lon: -2.9003},
        "EGEC": {lat: 55.4372, lon: -5.6864},
        "EGUB": {lat: 51.6144, lon: -1.0960},
        "EGNL": {lat: 54.1286, lon: -3.2675},
        "EGNO": {lat: 53.7451, lon: -2.8831},
        "EGEW": {lat: 59.3503, lon: -2.9500},
        "EGPT": {lat: 56.4392, lon: -3.3722},
        "EGTO": {lat: 51.3519, lon: 0.5033},
        "EGYM": {lat: 52.6484, lon: 0.5507},
        "EGQL": {lat: 56.3740, lon: -2.8689},
        "EGXC": {lat: 53.0930, lon: -0.1660},
        "EGVO": {lat: 51.2341, lon: -0.9428},
        "EGFH": {lat: 51.6014, lon: -4.0710},
        "EGEI": {lat: 57.2534, lon: -5.8279},
        "EGSQ": {lat: 51.7850, lon: 1.1300},
        "EGOV": {lat: 53.2481, lon: -4.5353},
        "EGED": {lat: 59.1906, lon: -2.7722},
        "EGAB": {lat: 54.3983, lon: -7.6512},
        "EGET": {lat: 60.1922, lon: -1.2436},
        "EGWN": {lat: 51.7907, lon: -0.7380},
        "EGCJ": {lat: 53.7885, lon: -1.2169},
        "EGPU": {lat: 56.4992, lon: -6.8692},
        "EGXH": {lat: 52.3426, lon: 0.7729},
        "EGEF": {lat: 59.5347, lon: -1.6285},
        "EGES": {lat: 59.2503, lon: -2.5767},
        "EGPW": {lat: 60.7472, lon: -0.8539},
        "EGSV": {lat: 52.4975, lon: 1.0519},
        "EGDJ": {lat: 51.2866, lon: -1.7822},
        "EGEN": {lat: 59.3675, lon: -2.4344},
        "EGER": {lat: 59.1553, lon: -2.6414},
        "EGEH": {lat: 60.3768, lon: -0.9272},
        "EGZL": {lat: 57.1037, lon: -3.8917},
        "EGCA": {lat: 53.3048, lon: -1.4289},
        "EGMF": {lat: 51.3328, lon: 0.6011},
        "EGLW": {lat: 51.4699, lon: -0.1795},
        "EGHK": {lat: 50.1304, lon: -5.5139}

    };

    pilots.forEach(pilot => {
        if (pilot.flight_plan && pilot.flight_plan.departure && pilot.flight_plan.arrival) {
            const dep = pilot.flight_plan.departure.toUpperCase();
            const arr = pilot.flight_plan.arrival.toUpperCase();

            const groundspeed = pilot.groundspeed ?? 9999;
            const altitude = pilot.altitude ?? 9999;
            const onGround = groundspeed < 20 || altitude < 100;

            // Count departures only if on ground and dep is UK
            if (dep.startsWith(ukAirportPrefix) && onGround) {
                if (!stats[dep]) stats[dep] = { arrivals: 0, departures: 0 };
                stats[dep].departures++;
            }

            // For arrivals:
            // Only count if arriving at UK airport, airborne (groundspeed >= 20 && altitude > 100)
            // AND within 90 minutes to landing based on distance & groundspeed
            if (arr.startsWith(ukAirportPrefix)) {
                const airport = airportCoords[arr];
                if (!airport) return; // skip if no coordinates known

                if (groundspeed >= 20 && altitude > 100) {
                    // Calculate distance to destination airport
                    const distKmVal = distanceKm(pilot.latitude, pilot.longitude, airport.lat, airport.lon);
                    const minLeft = minutesToLanding(distKmVal, groundspeed);

                    if (minLeft <= 90) {
                        if (!stats[arr]) stats[arr] = { arrivals: 0, departures: 0 };
                        stats[arr].arrivals++;
                    }
                }
            }
        }
    });

    return stats;
}

// Render based on current view
function render() {
    const searchTerm = searchInput.value.trim().toLowerCase();

    if (currentView === "controllers") {
        let filtered = allControllers.filter(c =>
            c.callsign.toLowerCase().includes(searchTerm) || (c.name && c.name.toLowerCase().includes(searchTerm))
        );
        renderControllers(filtered);
        subtitleEl.textContent = `Showing controllers within VATSIM UK (${filtered.length})`;
    } else if (currentView === "airports") {
        const stats = calculateAirportStats(allPilots);
        // Filter airports by search term on ICAO code
        const filteredStats = {};
        for (const [icao, stat] of Object.entries(stats)) {
            if (icao.toLowerCase().includes(searchTerm)) {
                filteredStats[icao] = stat;
            }
        }
        renderAirports(filteredStats);
        subtitleEl.textContent = `Showing airport arrivals/departures within VATSIM UK (${Object.keys(filteredStats).length})`;
    } else if (currentView === "auto") {
        // Auto mode initially shows controllers
        renderControllers(allControllers);
        subtitleEl.textContent = `Showing controllers within VATSIM UK (${allControllers.length})`;
    }
}

// Auto rotate views every 15 seconds
function startAutoRotate() {
    let step = 0;
    const views = ["controllers", "airports"];
    autoRotateInterval = setInterval(() => {
        step = (step + 1) % views.length;
        currentView = views[step];

        // Update toggle button states
        buttons.forEach(btn => {
            const active = btn.dataset.view === currentView;
            btn.classList.toggle('toggle-button-active', active);
            btn.classList.toggle('toggle-button-inactive', !active);
            btn.setAttribute('aria-pressed', active ? "true" : "false");
        });

        render();
    }, 15000);
}

// Stop auto rotate
function stopAutoRotate() {
    if (autoRotateInterval) {
        clearInterval(autoRotateInterval);
        autoRotateInterval = null;
    }
}

// Handle toggle button clicks
buttons.forEach(button => {
    button.addEventListener("click", () => {
        stopAutoRotate();
        currentView = button.dataset.view;
        // Update button styles & aria-pressed
        buttons.forEach(btn => {
            const active = btn === button;
            btn.classList.toggle('toggle-button-active', active);
            btn.classList.toggle('toggle-button-inactive', !active);
            btn.setAttribute('aria-pressed', active ? "true" : "false");
        });
        render();

        if (currentView === "auto") {
            startAutoRotate();
        }
    });
});

// Search input debounce
let searchTimeout = null;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        render();
    }, 300);
});

// Fetch data and initialize
async function fetchData() {
    try {
        const res = await fetch("https://data.vatsim.net/v3/vatsim-data.json");
        const data = await res.json();

        // Filter controllers by allowed prefixes and exclude EGTT & observers
        allControllers = data.controllers.filter(c =>
            controllerPrefixes.some(prefix => c.callsign.startsWith(prefix)) &&
            !c.callsign.startsWith("EGTT") &&
            !c.callsign.includes("OBS")
        );

        allPilots = data.pilots.filter(pilot =>
            pilot.flight_plan &&
            pilot.flight_plan.departure &&
            pilot.flight_plan.arrival
        );

        const now = new Date();
        lastUpdatedEl.textContent = `Last updated: ${now.toLocaleString()}`;

        render();

        // If auto view selected, start auto rotate
        if (currentView === "auto") startAutoRotate();

    } catch (err) {
        atcGrid.innerHTML = `<p class="col-span-full text-center text-red-600 dark:text-red-400 font-body">Error fetching data. Please try again later.</p>`;
        console.error(err);
    }
}

fetchData();
setInterval(fetchData, 60000);