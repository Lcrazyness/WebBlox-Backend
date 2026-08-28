const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// ============================================================
// CORS
// ============================================================

const allowedOrigins = [
  "https://lcrazyness.github.io",
  "https://u7xnlt3.live.codepad.app",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else {
    // Allow the frontend even if its exact preview URL changes.
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ============================================================
// HELPERS
// ============================================================

function sessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function robloxFetch(url) {
  console.log("[Roblox] GET", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "WebBlox/1.0"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Roblox returned non-JSON (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Roblox HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  return data;
}

// ============================================================
// NORMALIZE ROBLOX GAME
// ============================================================

function normalizeGame(game) {
  if (!game) return null;

  const universeId =
    Number(
      game.universeId ??
      game.id ??
      game.universeID
    ) || 0;

  const placeId =
    Number(
      game.placeId ??
      game.rootPlaceId ??
      game.rootPlace?.id
    ) || 0;

  const name =
    game.name ??
    game.displayName ??
    game.title ??
    "Untitled Experience";

  const creator =
    game.creator?.name ??
    game.creatorName ??
    game.creator?.displayName ??
    "Unknown Creator";

  const creatorId =
    Number(
      game.creator?.id ??
      game.creatorId
    ) || 0;

  const playing =
    Number(
      game.playing ??
      game.playerCount ??
      game.concurrentPlayers
    ) || 0;

  const visits =
    Number(
      game.visits ??
      game.totalVisits
    ) || 0;

  const favorites =
    Number(
      game.favorites ??
      game.favoriteCount
    ) || 0;

  const maxPlayers =
    Number(
      game.maxPlayers ??
      game.maxPlayersPerServer
    ) || 0;

  let thumbnail =
    game.thumbnail ??
    game.thumbnailUrl ??
    game.imageUrl ??
    game.icon ??
    "";

  let icon =
    game.icon ??
    game.iconUrl ??
    game.thumbnail ??
    "";

  // Some Roblox API responses contain thumbnail arrays.
  if (!thumbnail && Array.isArray(game.thumbnails)) {
    thumbnail =
      game.thumbnails[0]?.url ||
      game.thumbnails[0]?.imageUrl ||
      "";
  }

  if (!icon && Array.isArray(game.icons)) {
    icon =
      game.icons[0]?.url ||
      game.icons[0]?.imageUrl ||
      "";
  }

  return {
    id: universeId,
    universeId,
    placeId,
    name,
    description: game.description || "",
    creator,
    creatorId,
    playing,
    visits,
    favorites,
    maxPlayers,
    thumbnail,
    icon,
    robloxUrl: placeId
      ? `https://www.roblox.com/games/${placeId}`
      : universeId
        ? `https://www.roblox.com/games/${universeId}`
        : "https://www.roblox.com/games",
    genre:
      game.genre ||
      game.genreL1 ||
      "All",
    updated:
      game.updated ||
      game.updatedUtc ||
      ""
  };
}

// ============================================================
// GET GAME DETAILS
// ============================================================

async function getGameDetails(universeIds) {
  const ids = [...new Set(
    universeIds
      .map(Number)
      .filter(Boolean)
  )].slice(0, 10);

  if (!ids.length) return [];

  const url =
    "https://games.roblox.com/v1/games?universeIds=" +
    ids.join(",");

  const data = await robloxFetch(url);

  return Array.isArray(data.data)
    ? data.data.map(normalizeGame).filter(Boolean)
    : [];
}

// ============================================================
// GET THUMBNAILS
// ============================================================

async function getThumbnails(games) {
  const ids = games
    .map(g => Number(g.universeId))
    .filter(Boolean)
    .slice(0, 10);

  if (!ids.length) return games;

  try {
    const url =
      "https://thumbnails.roblox.com/v1/games/multiget/thumbnails" +
      "?universeIds=" +
      encodeURIComponent(ids.join(",")) +
      "&countPerUniverse=1" +
      "&defaults=true" +
      "&size=512x512" +
      "&format=Png" +
      "&isCircular=false";

    const data = await robloxFetch(url);

    const map = new Map();

    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        const id = Number(item.targetId);

        if (!id) continue;

        const image =
          item.imageUrl ||
          item.url ||
          item.images?.[0]?.url ||
          "";

        if (image) {
          map.set(id, image);
        }
      }
    }

    return games.map(game => {
      const image = map.get(Number(game.universeId));

      if (image) {
        game.thumbnail = image;

        if (!game.icon) {
          game.icon = image;
        }
      }

      return game;
    });
  } catch (error) {
    console.log("[Roblox] Thumbnail lookup failed:", error.message);
    return games;
  }
}

// ============================================================
// EXPLORE / DISCOVER
// ============================================================

async function getSortContent(sortId) {
  const sid = sessionId();

  const url =
    "https://apis.roblox.com/explore-api/v1/get-sort-content" +
    `?sessionId=${encodeURIComponent(sid)}` +
    `&sortId=${encodeURIComponent(sortId)}` +
    "&device=computer" +
    "&country=all";

  return robloxFetch(url);
}

function extractUniverseIds(data) {
  const ids = [];

  function walk(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    if (typeof value !== "object") return;

    // Common universe ID fields.
    for (const key of [
      "universeId",
      "universeID",
      "gameId"
    ]) {
      if (value[key]) {
        const id = Number(value[key]);

        if (id && !ids.includes(id)) {
          ids.push(id);
        }
      }
    }

    // Sometimes nested inside game/experience.
    if (value.game) walk(value.game);
    if (value.experience) walk(value.experience);
    if (value.item) walk(value.item);

    for (const [key, child] of Object.entries(value)) {
      if (
        key !== "game" &&
        key !== "experience" &&
        key !== "item"
      ) {
        if (typeof child === "object") {
          walk(child);
        }
      }
    }
  }

  walk(data);

  return ids;
}

// ============================================================
// HOME
// ============================================================

app.get("/api/home", async (req, res) => {
  try {
    console.log("[WebBlox] Loading home");

    // Roblox's current Discover/Charts endpoint.
    const content = await getSortContent(
      "top-playing-now"
    );

    const ids = extractUniverseIds(content)
      .slice(0, 10);

    console.log(
      "[WebBlox] Found universe IDs:",
      ids
    );

    let games = await getGameDetails(ids);

    games = await getThumbnails(games);

    // Preserve Roblox's returned order.
    const popular = games
      .sort((a, b) => b.playing - a.playing);

    res.json({
      success: true,
      recommended: popular,
      popular
    });
  } catch (error) {
    console.error(
      "[WebBlox] Home error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// SEARCH
// ============================================================

app.get("/api/search", async (req, res) => {
  try {
    const query =
      String(req.query.q || "").trim();

    if (!query) {
      return res.json({
        success: true,
        games: []
      });
    }

    console.log(
      "[WebBlox] Searching:",
      query
    );

    const sid = sessionId();

    const url =
      "https://apis.roblox.com/search-api/omni-search" +
      `?searchQuery=${encodeURIComponent(query)}` +
      `&sessionId=${encodeURIComponent(sid)}`;

    const data = await robloxFetch(url);

    const ids = extractUniverseIds(data)
      .slice(0, 10);

    console.log(
      "[WebBlox] Search universe IDs:",
      ids
    );

    let games = await getGameDetails(ids);

    games = await getThumbnails(games);

    res.json({
      success: true,
      games
    });
  } catch (error) {
    console.error(
      "[WebBlox] Search error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
      games: []
    });
  }
});

// ============================================================
// HEALTH
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "WebBlox Backend",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy"
  });
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.path
  });
});

// ============================================================
// START
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[WebBlox] Backend running on port ${PORT}`
  );
});
