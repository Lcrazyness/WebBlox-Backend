// ============================================================
// WebBlox Backend
// No cors package required
// ============================================================

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS
// ============================================================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

// ============================================================
// HELPERS
// ============================================================

function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function robloxFetch(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WebBlox/1.0",
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      error: text,
    };
  }

  if (!response.ok) {
    throw new Error(
      `Roblox HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  return data;
}

// ============================================================
// NORMALIZE GAME
// ============================================================

function normalizeGame(game) {
  if (!game) return null;

  const universeId =
    game.universeId ??
    game.id ??
    game.rootPlaceId ??
    game.placeId;

  const placeId =
    game.placeId ??
    game.rootPlaceId ??
    game.rootPlace?.id ??
    universeId;

  const name =
    game.name ||
    game.displayName ||
    game.title ||
    "Untitled Experience";

  const creator =
    game.creator?.name ||
    game.creatorName ||
    game.creator?.displayName ||
    "Unknown Creator";

  const creatorId =
    game.creator?.id ||
    game.creatorId ||
    null;

  const playing =
    Number(game.playing) ||
    Number(game.playerCount) ||
    Number(game.activePlayers) ||
    0;

  const visits =
    Number(game.visits) ||
    Number(game.visitCount) ||
    0;

  const favorites =
    Number(game.favoritedCount) ||
    Number(game.favorites) ||
    Number(game.favoriteCount) ||
    0;

  const maxPlayers =
    Number(game.maxPlayers) ||
    Number(game.maxPlayerCount) ||
    0;

  const description =
    game.description ||
    game.shortDescription ||
    "";

  let thumbnail =
    game.thumbnail ||
    game.thumbnailUrl ||
    game.imageUrl ||
    game.icon ||
    game.iconUrl ||
    "";

  let icon =
    game.icon ||
    game.iconUrl ||
    game.thumbnail ||
    game.thumbnailUrl ||
    "";

  // Search API sometimes returns thumbnails in nested fields.
  if (!thumbnail && game.thumbnailInfo) {
    thumbnail =
      game.thumbnailInfo.url ||
      game.thumbnailInfo.imageUrl ||
      "";
  }

  if (!icon && game.thumbnailInfo) {
    icon =
      game.thumbnailInfo.url ||
      game.thumbnailInfo.imageUrl ||
      "";
  }

  return {
    id: universeId,
    universeId,
    placeId,
    name,
    description,
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
      : "#",
    genre: game.genre || game.genreName || "All",
    updated:
      game.updated ||
      game.updatedAt ||
      game.updatedDate ||
      null,
  };
}

// ============================================================
// THUMBNAILS
// ============================================================

async function addThumbnails(games) {
  const validGames = games.filter(
    (game) => game && game.universeId
  );

  if (!validGames.length) {
    return games;
  }

  // Roblox thumbnail API accepts a limited number of IDs.
  // Keep batches small to avoid "Too many universe IDs".
  const batchSize = 20;

  for (let i = 0; i < validGames.length; i += batchSize) {
    const batch = validGames.slice(i, i + batchSize);

    const ids = batch
      .map((game) => game.universeId)
      .filter(Boolean)
      .join(",");

    try {
      const thumbnailUrl =
        `https://thumbnails.roblox.com/v1/games/icons` +
        `?universeIds=${encodeURIComponent(ids)}` +
        `&returnPolicy=PlaceHolder` +
        `&size=512x512` +
        `&format=Png` +
        `&isCircular=false`;

      const result = await robloxFetch(thumbnailUrl);

      if (Array.isArray(result.data)) {
        for (const item of result.data) {
          const game = batch.find(
            (g) =>
              String(g.universeId) === String(item.targetId)
          );

          if (!game) continue;

          if (item.imageUrl) {
            game.thumbnail = item.imageUrl;
            game.icon = item.imageUrl;
          }
        }
      }
    } catch (error) {
      console.log(
        "[WebBlox] Thumbnail batch failed:",
        error.message
      );
    }
  }

  return games;
}

// ============================================================
// SEARCH API
// ============================================================

async function searchRobloxGames(query, limit = 30) {
  const sessionId = makeSessionId();

  const url =
    "https://apis.roblox.com/search-api/omni-search" +
    `?searchQuery=${encodeURIComponent(query)}` +
    `&sessionId=${encodeURIComponent(sessionId)}` +
    "&pageType=all";

  const data = await robloxFetch(url);

  const results = [];

  function walk(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);

        if (results.length >= limit) {
          return;
        }
      }

      return;
    }

    if (typeof value !== "object") {
      return;
    }

    // Search results can appear under different structures.
    const possibleGame =
      value.universeId ||
      value.placeId ||
      value.rootPlaceId;

    const possibleName =
      value.name ||
      value.displayName ||
      value.title;

    if (possibleGame && possibleName) {
      const normalized = normalizeGame(value);

      if (
        normalized &&
        normalized.name &&
        normalized.name !== "Untitled Experience"
      ) {
        results.push(normalized);
      }
    }

    for (const key of Object.keys(value)) {
      if (results.length >= limit) break;

      // Avoid repeatedly walking giant metadata objects.
      if (
        key === "nextPageToken" ||
        key === "sessionId"
      ) {
        continue;
      }

      walk(value[key]);
    }
  }

  walk(data);

  // Remove duplicates.
  const seen = new Set();

  const unique = results.filter((game) => {
    const key =
      game.universeId ||
      game.placeId ||
      game.name;

    if (seen.has(String(key))) {
      return false;
    }

    seen.add(String(key));
    return true;
  });

  return addThumbnails(unique.slice(0, limit));
}

// ============================================================
// HOME / DISCOVER
// ============================================================

async function getHomeGames() {
  // Roblox's explore API is the current replacement
  // for the old games/sorts endpoint.
  const sessionId = makeSessionId();

  const sortsUrl =
    "https://apis.roblox.com/explore-api/v1/get-sorts" +
    `?sessionId=${encodeURIComponent(sessionId)}` +
    "&device=computer" +
    "&country=all";

  const sorts = await robloxFetch(sortsUrl);

  const sortList =
    sorts.sorts ||
    sorts.data ||
    [];

  const games = [];

  // Find useful game/chart sorts.
  for (const sort of sortList.slice(0, 8)) {
    const sortId =
      sort.sortId ||
      sort.id;

    if (!sortId) continue;

    try {
      const contentUrl =
        "https://apis.roblox.com/explore-api/v1/get-sort-content" +
        `?sessionId=${encodeURIComponent(sessionId)}` +
        `&sortId=${encodeURIComponent(sortId)}`;

      const content = await robloxFetch(contentUrl);

      const items =
        content.games ||
        content.items ||
        content.data ||
        content.content ||
        [];

      for (const item of items) {
        const normalized = normalizeGame(item);

        if (
          normalized &&
          normalized.universeId &&
          normalized.name &&
          normalized.name !== "Untitled Experience"
        ) {
          games.push(normalized);
        }

        if (games.length >= 60) break;
      }
    } catch (error) {
      console.log(
        "[WebBlox] Sort failed:",
        sortId,
        error.message
      );
    }

    if (games.length >= 60) break;
  }

  // Remove duplicates.
  const unique = [];
  const seen = new Set();

  for (const game of games) {
    const key = String(
      game.universeId || game.placeId
    );

    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(game);
  }

  const withThumbs = await addThumbnails(
    unique.slice(0, 60)
  );

  // Sort popular games by active players.
  const popular = [...withThumbs]
    .sort((a, b) => b.playing - a.playing)
    .slice(0, 30);

  const recommended = [...withThumbs]
    .sort((a, b) => {
      const aScore =
        a.playing +
        a.visits / 100000 +
        a.favorites / 1000;

      const bScore =
        b.playing +
        b.visits / 100000 +
        b.favorites / 1000;

      return bScore - aScore;
    })
    .slice(0, 30);

  return {
    success: true,
    recommended,
    popular,
  };
}

// ============================================================
// HEALTH
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "WebBlox Backend",
    status: "online",
    version: "2.0.0",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
  });
});

// ============================================================
// HOME
// ============================================================

app.get("/api/home", async (req, res) => {
  console.log("[WebBlox] GET /api/home");

  try {
    const data = await getHomeGames();

    console.log(
      `[WebBlox] Home: ${data.recommended.length} recommended, ${data.popular.length} popular`
    );

    res.json(data);
  } catch (error) {
    console.error(
      "[WebBlox] Home error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
      recommended: [],
      popular: [],
    });
  }
});

// ============================================================
// SEARCH
// ============================================================

app.get("/api/search", async (req, res) => {
  const query =
    typeof req.query.q === "string"
      ? req.query.q.trim()
      : "";

  console.log(
    "[WebBlox] Search:",
    query
  );

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Missing search query.",
      games: [],
    });
  }

  if (query.length > 100) {
    return res.status(400).json({
      success: false,
      error: "Search query is too long.",
      games: [],
    });
  }

  try {
    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 30,
        1
      ),
      50
    );

    const games = await searchRobloxGames(
      query,
      limit
    );

    res.json({
      success: true,
      query,
      games,
    });
  } catch (error) {
    console.error(
      "[WebBlox] Search error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
      games: [],
    });
  }
});

// ============================================================
// GAME DETAILS
// ============================================================

app.get("/api/game/:universeId", async (req, res) => {
  const universeId =
    String(req.params.universeId);

  if (!/^\d+$/.test(universeId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid universe ID.",
    });
  }

  try {
    const url =
      `https://games.roblox.com/v1/games?universeIds=${universeId}`;

    const data = await robloxFetch(url);

    const gameData =
      Array.isArray(data.data)
        ? data.data[0]
        : null;

    if (!gameData) {
      return res.status(404).json({
        success: false,
        error: "Game not found.",
      });
    }

    const game = normalizeGame(gameData);

    await addThumbnails([game]);

    res.json({
      success: true,
      game,
    });
  } catch (error) {
    console.error(
      "[WebBlox] Game error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("====================================");
  console.log("       WebBlox Backend Online");
  console.log("====================================");
  console.log(`Port: ${PORT}`);
  console.log("CORS: enabled");
  console.log("Search: enabled");
  console.log("Thumbnails: enabled");
  console.log("====================================");
  console.log("");
});
