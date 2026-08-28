const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json());

/*
  WebBlox Backend
  ----------------
  Roblox discovery/search proxy.

  Current Roblox endpoints:
    Explore:
      /explore-api/v1/get-sorts
      /explore-api/v1/get-sort-content

    Search:
      /search-api/omni-search

  We generate a fresh session ID for every request.
*/

const ROBLOX_EXPLORE = "https://apis.roblox.com/explore-api/v1";
const ROBLOX_SEARCH = "https://apis.roblox.com/search-api/omni-search";
const ROBLOX_GAMES = "https://games.roblox.com/v1/games";

const DEFAULT_HEADERS = {
  "Accept": "application/json",
  "User-Agent": "WebBlox/3.0"
};

function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function robloxFetch(url) {
  console.log("[WebBlox] Roblox request:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: DEFAULT_HEADERS
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Roblox returned non-JSON response (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Roblox HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/*
  Safely convert arbitrary values into strings.
*/
function str(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

/*
  Roblox's newer APIs sometimes nest game information differently.
  These helpers normalize the result into one consistent WebBlox object.
*/

function findUniverseId(obj) {
  const candidates = [
    obj?.universeId,
    obj?.universeID,
    obj?.UniverseId,
    obj?.id,
    obj?.gameId,
    obj?.rootPlaceId
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0) {
      return n;
    }
  }

  return null;
}

function findPlaceId(obj) {
  const candidates = [
    obj?.placeId,
    obj?.placeID,
    obj?.rootPlaceId,
    obj?.placeID,
    obj?.id
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0) {
      return n;
    }
  }

  return null;
}

function findName(obj) {
  return (
    str(obj?.name) ||
    str(obj?.displayName) ||
    str(obj?.title) ||
    str(obj?.gameName)
  ).trim();
}

function findDescription(obj) {
  return (
    str(obj?.description) ||
    str(obj?.gameDescription) ||
    ""
  ).trim();
}

function findCreator(obj) {
  if (typeof obj?.creator === "string") {
    return obj.creator;
  }

  return (
    str(obj?.creator?.name) ||
    str(obj?.creator?.displayName) ||
    str(obj?.creatorName) ||
    ""
  ).trim();
}

function findCreatorId(obj) {
  const candidates = [
    obj?.creatorId,
    obj?.creator?.id
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0) {
      return n;
    }
  }

  return null;
}

function findPlaying(obj) {
  const candidates = [
    obj?.playing,
    obj?.playerCount,
    obj?.playingCount,
    obj?.players
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n)) {
      return Math.max(0, Math.floor(n));
    }
  }

  return 0;
}

function findVisits(obj) {
  const candidates = [
    obj?.visits,
    obj?.visitCount
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n)) {
      return Math.max(0, Math.floor(n));
    }
  }

  return 0;
}

function findFavorites(obj) {
  const candidates = [
    obj?.favorites,
    obj?.favoriteCount
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n)) {
      return Math.max(0, Math.floor(n));
    }
  }

  return 0;
}

function findMaxPlayers(obj) {
  const candidates = [
    obj?.maxPlayers,
    obj?.maxPlayerCount
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n) && n > 0) {
      return Math.floor(n);
    }
  }

  return 50;
}

function findThumbnail(obj) {
  return (
    str(obj?.thumbnail) ||
    str(obj?.thumbnailUrl) ||
    str(obj?.imageUrl) ||
    str(obj?.icon) ||
    str(obj?.iconUrl) ||
    ""
  );
}

function findGenre(obj) {
  return (
    str(obj?.genre) ||
    str(obj?.genreL1) ||
    str(obj?.genreL2) ||
    "All"
  );
}

/*
  Placeholder/garbage names that aren't useful as a discovery result.
*/
function looksLikePlaceholderName(name) {
  const value = name.trim().toLowerCase();

  if (!value) return true;

  const badNames = [
    "place",
    "my place",
    "your place",
    "untitled",
    "game",
    "new game",
    "roblox game"
  ];

  if (badNames.includes(value)) {
    return true;
  }

  /*
    A huge number of newly-created Roblox experiences are literally:
      Username's Place
      Lugar de username
      username's first creation
    Those aren't useful for the main discovery page.
  */

  if (
    value.endsWith("'s place") ||
    value.endsWith("’s place") ||
    value.includes("your first creation") ||
    value.includes("your first roblox creation") ||
    value.includes("sua primeira criação") ||
    value.includes("tu primera creación")
  ) {
    return true;
  }

  return false;
}

function normalizeGame(obj) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  const universeId = findUniverseId(obj);
  const placeId = findPlaceId(obj);
  const name = findName(obj);

  if (!universeId || !name) {
    return null;
  }

  if (looksLikePlaceholderName(name)) {
    return null;
  }

  const creator = findCreator(obj);

  return {
    id: universeId,
    universeId,
    placeId: placeId || null,
    name,
    description: findDescription(obj),
    creator: creator || "Unknown Creator",
    creatorId: findCreatorId(obj),
    playing: findPlaying(obj),
    visits: findVisits(obj),
    favorites: findFavorites(obj),
    maxPlayers: findMaxPlayers(obj),
    thumbnail: findThumbnail(obj),
    icon: str(obj?.icon) || findThumbnail(obj),
    robloxUrl:
      placeId
        ? `https://www.roblox.com/games/${placeId}`
        : `https://www.roblox.com/games/${universeId}`,
    genre: findGenre(obj),
    updated: obj?.updated || obj?.updatedAt || null
  };
}

/*
  Recursively search an API response for objects that look like games.
*/
function collectPossibleGames(value, output = []) {
  if (!value) return output;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPossibleGames(item, output);
    }

    return output;
  }

  if (typeof value !== "object") {
    return output;
  }

  /*
    If this object itself looks like a game, add it.
  */
  const game = normalizeGame(value);

  if (game) {
    output.push(game);
  }

  for (const [key, child] of Object.entries(value)) {
    /*
      Don't recurse into giant unrelated metadata objects.
    */
    if (
      key === "sessionId" ||
      key === "tracking" ||
      key === "analytics"
    ) {
      continue;
    }

    if (child && typeof child === "object") {
      collectPossibleGames(child, output);
    }
  }

  return output;
}

/*
  Remove duplicates while preserving order.
*/
function uniqueGames(games) {
  const seen = new Set();
  const result = [];

  for (const game of games) {
    const key =
      game.universeId ||
      game.placeId ||
      `${game.name}:${game.creator}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(game);
  }

  return result;
}

/*
  Fetch official game details from games.roblox.com.

  This is important because Explore/Search sometimes gives incomplete
  metadata. The official game details endpoint is designed to return
  game details for universe IDs.
*/
async function enrichGames(games) {
  const ids = games
    .map(g => Number(g.universeId))
    .filter(id => Number.isSafeInteger(id) && id > 0);

  if (!ids.length) {
    return games;
  }

  /*
    Roblox can reject huge universe ID lists.
    Keep each request small.
  */
  const chunks = [];

  for (let i = 0; i < ids.length; i += 40) {
    chunks.push(ids.slice(i, i + 40));
  }

  const details = new Map();

  for (const chunk of chunks) {
    try {
      const url =
        `${ROBLOX_GAMES}?universeIds=${chunk.join(",")}`;

      const data = await robloxFetch(url);

      for (const item of data?.data || []) {
        const id = Number(item.id);

        if (Number.isSafeInteger(id) && id > 0) {
          details.set(id, item);
        }
      }
    } catch (error) {
      console.warn(
        "[WebBlox] Game detail enrichment failed:",
        error.message
      );
    }
  }

  return games.map(game => {
    const detail = details.get(Number(game.universeId));

    if (!detail) {
      return game;
    }

    return {
      ...game,

      id: Number(detail.id) || game.id,
      universeId: Number(detail.id) || game.universeId,

      placeId:
        Number(detail.rootPlaceId) ||
        game.placeId ||
        null,

      name:
        str(detail.name).trim() ||
        game.name,

      description:
        str(detail.description).trim() ||
        game.description,

      creator:
        str(detail.creator?.name).trim() ||
        game.creator,

      creatorId:
        Number(detail.creator?.id) ||
        game.creatorId ||
        null,

      playing:
        Number.isFinite(Number(detail.playing))
          ? Number(detail.playing)
          : game.playing,

      visits:
        Number.isFinite(Number(detail.visits))
          ? Number(detail.visits)
          : game.visits,

      favorites:
        Number.isFinite(Number(detail.favoritedCount))
          ? Number(detail.favoritedCount)
          : game.favorites,

      maxPlayers:
        Number.isFinite(Number(detail.maxPlayers))
          ? Number(detail.maxPlayers)
          : game.maxPlayers,

      genre:
        str(detail.genre).trim() ||
        game.genre,

      updated:
        detail.updated ||
        game.updated,

      robloxUrl:
        detail.rootPlaceId
          ? `https://www.roblox.com/games/${detail.rootPlaceId}`
          : game.robloxUrl
    };
  });
}

/*
  Get thumbnails for the games.

  Roblox's thumbnail API accepts universe IDs.
*/
async function addThumbnails(games) {
  if (!games.length) {
    return games;
  }

  const ids = games
    .map(game => Number(game.universeId))
    .filter(id => Number.isSafeInteger(id) && id > 0);

  const thumbnailMap = new Map();

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);

    try {
      const url =
        `https://thumbnails.roblox.com/v1/games/multiget/thumbnails` +
        `?universeIds=${chunk.join(",")}` +
        `&size=768x432` +
        `&format=Png` +
        `&isCircular=false`;

      const data = await robloxFetch(url);

      for (const item of data?.data || []) {
        const id = Number(item.targetId);

        if (Number.isSafeInteger(id) && item.imageUrl) {
          thumbnailMap.set(id, item.imageUrl);
        }
      }
    } catch (error) {
      console.warn(
        "[WebBlox] Thumbnail request failed:",
        error.message
      );
    }
  }

  return games.map(game => {
    const image = thumbnailMap.get(Number(game.universeId));

    if (!image) {
      return game;
    }

    return {
      ...game,
      thumbnail: image,
      icon: game.icon || image
    };
  });
}

/*
  Get one of Roblox's official Discover charts.
*/
async function getChart(sortId, limit = 100) {
  const sessionId = makeSessionId();

  const url =
    `${ROBLOX_EXPLORE}/get-sort-content` +
    `?sessionId=${encodeURIComponent(sessionId)}` +
    `&sortId=${encodeURIComponent(sortId)}` +
    `&device=computer` +
    `&country=all`;

  const data = await robloxFetch(url);

  let games = uniqueGames(collectPossibleGames(data));

  /*
    Keep only real named experiences.
  */
  games = games.filter(game => !looksLikePlaceholderName(game.name));

  /*
    Official chart order is important.
  */
  games = games.slice(0, Math.max(1, Math.min(limit, 100)));

  games = await enrichGames(games);
  games = await addThumbnails(games);

  return games;
}

/*
  Search Roblox experiences.
*/
async function searchRobloxGames(query, pageToken = "") {
  const sessionId = makeSessionId();

  const params = new URLSearchParams();

  params.set("searchQuery", query);
  params.set("sessionId", sessionId);
  params.set("pageType", "all");

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `${ROBLOX_SEARCH}?${params.toString()}`;

  const data = await robloxFetch(url);

  let games = uniqueGames(collectPossibleGames(data));

  games = games.filter(game => !looksLikePlaceholderName(game.name));

  /*
    Search results are already ranked by Roblox.
  */
  games = games.slice(0, 120);

  games = await enrichGames(games);
  games = await addThumbnails(games);

  return {
    games,
    nextPageToken: data?.nextPageToken || null
  };
}

/* =========================================================
   ROUTES
   ========================================================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "WebBlox Backend",
    version: "3.0.0",
    status: "online"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "webblox-backend"
  });
});

/*
  HOME

  Uses actual Roblox charts instead of random game data.
*/
app.get("/api/home", async (req, res) => {
  try {
    console.log("[WebBlox] Loading homepage charts...");

    const [trending, popular] = await Promise.all([
      getChart("top-trending", 100),
      getChart("top-playing-now", 100)
    ]);

    res.json({
      success: true,

      recommended: trending,

      popular,

      charts: {
        trending,
        topPlayingNow: popular
      }
    });
  } catch (error) {
    console.error("[WebBlox] Home error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/*
  Generic chart endpoint.

  Examples:

    /api/chart/top-playing-now
    /api/chart/top-trending
    /api/chart/up-and-coming
    /api/chart/top-revisited
*/
app.get("/api/chart/:sortId", async (req, res) => {
  try {
    const sortId = req.params.sortId;

    const allowed = new Set([
      "top-playing-now",
      "top-trending",
      "up-and-coming",
      "top-revisited",
      "fun-with-friends"
    ]);

    if (!allowed.has(sortId)) {
      return res.status(400).json({
        success: false,
        error: "Unknown Roblox chart."
      });
    }

    const games = await getChart(sortId, 100);

    res.json({
      success: true,
      sortId,
      games
    });
  } catch (error) {
    console.error("[WebBlox] Chart error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/*
  SEARCH

  /api/search?q=grow+a+garden
  /api/search?q=blox+fruits&pageToken=...
*/
app.get("/api/search", async (req, res) => {
  try {
    const query = str(req.query.q).trim();
    const pageToken = str(req.query.pageToken).trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing search query."
      });
    }

    if (query.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Search query is too long."
      });
    }

    console.log("[WebBlox] Search:", query);

    const result = await searchRobloxGames(
      query,
      pageToken
    );

    res.json({
      success: true,
      query,
      games: result.games,
      nextPageToken: result.nextPageToken
    });
  } catch (error) {
    console.error("[WebBlox] Search error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/*
  GAME DETAILS

  /api/game/123456
*/
app.get("/api/game/:universeId", async (req, res) => {
  try {
    const universeId = Number(req.params.universeId);

    if (!Number.isSafeInteger(universeId) || universeId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid universe ID."
      });
    }

    const data = await robloxFetch(
      `${ROBLOX_GAMES}?universeIds=${universeId}`
    );

    const game = data?.data?.[0];

    if (!game) {
      return res.status(404).json({
        success: false,
        error: "Game not found."
      });
    }

    let normalized = normalizeGame(game);

    if (!normalized) {
      return res.status(404).json({
        success: false,
        error: "Game information unavailable."
      });
    }

    normalized = (
      await addThumbnails([normalized])
    )[0];

    res.json({
      success: true,
      game: normalized
    });
  } catch (error) {
    console.error("[WebBlox] Game error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/*
  404 handler.
*/
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "WebBlox endpoint not found.",
    path: req.path
  });
});

/*
  Start server.
*/
app.listen(PORT, "0.0.0.0", () => {
  console.log("======================================");
  console.log("[WebBlox] Backend started");
  console.log(`[WebBlox] Port: ${PORT}`);
  console.log("[WebBlox] API: /api/home");
  console.log("[WebBlox] Search: /api/search?q=...");
  console.log("[WebBlox] Charts: /api/chart/:sortId");
  console.log("======================================");
});
