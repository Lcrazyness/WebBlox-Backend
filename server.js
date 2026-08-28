const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "1mb" }));

// ============================================================
// CORS
// No cors package required.
// ============================================================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ============================================================
// CONFIG
// ============================================================

const ROBLOX_GAMES = "https://games.roblox.com";
const ROBLOX_SEARCH = "https://apis.roblox.com/search-api";
const ROBLOX_THUMBS = "https://thumbnails.roblox.com";

const FETCH_TIMEOUT = 15000;

// ============================================================
// HELPERS
// ============================================================

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "WebBlox/1.0",
        ...(options.headers || {})
      }
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {
        raw: text
      };
    }

    if (!response.ok) {
      throw new Error(
        `Roblox HTTP ${response.status}: ${
          typeof data === "string"
            ? data
            : JSON.stringify(data)
        }`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function chunk(array, size) {
  const output = [];

  for (let i = 0; i < array.length; i += size) {
    output.push(array.slice(i, i + size));
  }

  return output;
}

function uniqueNumbers(values) {
  return [
    ...new Set(
      values
        .map(Number)
        .filter(Number.isFinite)
    )
  ];
}

function cleanGame(game) {
  if (!game) return null;

  const universeId =
    game.universeId ||
    game.id ||
    game.universeID;

  const placeId =
    game.placeId ||
    game.rootPlaceId ||
    game.rootPlaceID;

  const name =
    game.name ||
    game.displayName ||
    "Untitled Experience";

  if (!universeId || !placeId) {
    return null;
  }

  const creator =
    game.creator?.name ||
    game.creatorName ||
    game.creator?.displayName ||
    game.creator?.username ||
    "Unknown Creator";

  const creatorId =
    game.creator?.id ||
    game.creatorId ||
    game.creatorID ||
    null;

  return {
    id: Number(universeId),
    universeId: Number(universeId),
    placeId: Number(placeId),

    name,

    description:
      game.description ||
      "",

    creator,
    creatorId,

    playing:
      Number(
        game.playing ??
        game.playerCount ??
        game.players ??
        0
      ),

    visits:
      Number(
        game.visits ??
        game.placeVisits ??
        game.visitsCount ??
        0
      ),

    favorites:
      Number(
        game.favoritedCount ??
        game.favorites ??
        game.favoritesCount ??
        0
      ),

    maxPlayers:
      Number(
        game.maxPlayers ??
        game.maxPlayersPerServer ??
        0
      ),

    genre:
      game.genre ||
      game.genreName ||
      "All",

    updated:
      game.updated ||
      game.updatedAt ||
      null,

    thumbnail:
      game.thumbnail ||
      game.thumbnailUrl ||
      game.imageUrl ||
      null,

    icon:
      game.icon ||
      game.iconUrl ||
      null,

    robloxUrl:
      `https://www.roblox.com/games/${placeId}`
  };
}

// ============================================================
// GAME DETAILS
// ============================================================

async function getGameDetails(universeIds) {
  const ids = uniqueNumbers(universeIds);

  if (!ids.length) {
    return [];
  }

  const result = [];

  // Roblox limits how many universe IDs can be requested
  // in one call, so split them into small batches.
  for (const batch of chunk(ids, 40)) {
    const url =
      `${ROBLOX_GAMES}/v1/games?universeIds=` +
      batch.join(",");

    try {
      const data = await fetchJSON(url);

      if (Array.isArray(data.data)) {
        result.push(...data.data);
      }
    } catch (error) {
      console.error(
        "[WebBlox] Game detail error:",
        error.message
      );
    }
  }

  return result;
}

// ============================================================
// THUMBNAILS
// ============================================================

async function getThumbnails(universeIds) {
  const ids = uniqueNumbers(universeIds);

  const output = new Map();

  if (!ids.length) {
    return output;
  }

  for (const batch of chunk(ids, 50)) {
    try {
      const url =
        `${ROBLOX_THUMBS}/v1/games/multiget/thumbnails` +
        `?universeIds=${batch.join(",")}` +
        `&countPerUniverse=1` +
        `&defaults=true` +
        `&size=768x432` +
        `&format=Png` +
        `&isCircular=false`;

      const data = await fetchJSON(url);

      for (const item of data.data || []) {
        const id =
          Number(
            item.universeId ||
            item.universeID
          );

        const image =
          item.thumbnails?.[0]?.imageUrl ||
          item.imageUrl ||
          null;

        if (id && image) {
          output.set(id, image);
        }
      }
    } catch (error) {
      console.error(
        "[WebBlox] Thumbnail error:",
        error.message
      );
    }
  }

  // Fallback to icons if a game has no thumbnail.
  const missing = ids.filter(
    id => !output.has(id)
  );

  for (const batch of chunk(missing, 50)) {
    try {
      const url =
        `${ROBLOX_THUMBS}/v1/games/icons` +
        `?universeIds=${batch.join(",")}` +
        `&size=512x512` +
        `&format=Png` +
        `&isCircular=false`;

      const data = await fetchJSON(url);

      for (const item of data.data || []) {
        const id =
          Number(
            item.targetId ||
            item.universeId
          );

        const image =
          item.imageUrl ||
          item.imageURL ||
          null;

        if (id && image) {
          output.set(id, image);
        }
      }
    } catch (error) {
      console.error(
        "[WebBlox] Icon fallback error:",
        error.message
      );
    }
  }

  return output;
}

// ============================================================
// FORMAT GAMES
// ============================================================

async function hydrateGames(games) {
  const ids = uniqueNumbers(
    games.map(game =>
      game.universeId ||
      game.id
    )
  );

  const details = await getGameDetails(ids);

  const detailMap = new Map();

  for (const detail of details) {
    detailMap.set(
      Number(detail.id),
      detail
    );
  }

  const thumbnails =
    await getThumbnails(ids);

  const finalGames = [];

  for (const raw of games) {
    const universeId =
      Number(
        raw.universeId ||
        raw.id
      );

    const detail =
      detailMap.get(universeId);

    const merged = {
      ...(detail || {}),
      ...raw
    };

    const game =
      cleanGame(merged);

    if (!game) continue;

    const thumbnail =
      thumbnails.get(game.universeId) ||
      game.thumbnail ||
      game.icon ||
      null;

    game.thumbnail = thumbnail;
    game.icon = thumbnail;

    finalGames.push(game);
  }

  // Remove duplicate universe IDs.
  const seen = new Set();

  return finalGames.filter(game => {
    if (seen.has(game.universeId)) {
      return false;
    }

    seen.add(game.universeId);
    return true;
  });
}

// ============================================================
// SEARCH ROBLOX
// ============================================================

async function searchRoblox(query, limit = 40) {
  const sessionId =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const url =
    `${ROBLOX_SEARCH}/omni-search` +
    `?searchQuery=${encodeURIComponent(query)}` +
    `&sessionId=${encodeURIComponent(sessionId)}` +
    `&pageType=all`;

  const data = await fetchJSON(url);

  const results =
    Array.isArray(data.searchResults)
      ? data.searchResults
      : [];

  const games = [];

  for (const result of results) {
    const contents =
      Array.isArray(result.contents)
        ? result.contents
        : [];

    for (const item of contents) {
      const universeId =
        item.universeId ||
        item.universeID ||
        item.id;

      const placeId =
        item.placeId ||
        item.rootPlaceId ||
        item.rootPlaceID;

      if (!universeId || !placeId) {
        continue;
      }

      games.push(item);

      if (games.length >= limit) {
        break;
      }
    }

    if (games.length >= limit) {
      break;
    }
  }

  return hydrateGames(games);
}

// ============================================================
// HOME
// ============================================================

app.get("/api/home", async (req, res) => {
  try {
    console.log("[WebBlox] Home request");

    // A few real Roblox discovery queries give us a much
    // better home page than randomly generated games.
    const queries = [
      "roblox",
      "simulator",
      "obby"
    ];

    const all = [];

    for (const query of queries) {
      try {
        const games =
          await searchRoblox(query, 15);

        all.push(...games);
      } catch (error) {
        console.error(
          `[WebBlox] Home search "${query}" failed:`,
          error.message
        );
      }
    }

    const unique = [];
    const seen = new Set();

    for (const game of all) {
      if (!seen.has(game.universeId)) {
        seen.add(game.universeId);
        unique.push(game);
      }
    }

    // Popular = highest current player count.
    const popular = [...unique]
      .sort(
        (a, b) =>
          (b.playing || 0) -
          (a.playing || 0)
      )
      .slice(0, 20);

    // Recommended = a mixture of games with activity,
    // favorites and visits.
    const recommended = [...unique]
      .sort((a, b) => {
        const scoreA =
          (a.playing || 0) * 10 +
          Math.log10(
            (a.visits || 0) + 1
          ) * 100 +
          Math.log10(
            (a.favorites || 0) + 1
          ) * 50;

        const scoreB =
          (b.playing || 0) * 10 +
          Math.log10(
            (b.visits || 0) + 1
          ) * 100 +
          Math.log10(
            (b.favorites || 0) + 1
          ) * 50;

        return scoreB - scoreA;
      })
      .slice(0, 20);

    res.json({
      success: true,
      recommended,
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
  const query =
    String(
      req.query.q ||
      req.query.query ||
      ""
    ).trim();

  if (!query) {
    return res.json({
      success: true,
      results: []
    });
  }

  if (query.length > 100) {
    return res.status(400).json({
      success: false,
      error: "Search query is too long."
    });
  }

  try {
    console.log(
      `[WebBlox] Search: ${query}`
    );

    const results =
      await searchRoblox(query, 40);

    res.json({
      success: true,
      query,
      results
    });
  } catch (error) {
    console.error(
      "[WebBlox] Search error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
      results: []
    });
  }
});

// ============================================================
// SINGLE GAME
// ============================================================

app.get(
  "/api/game/:universeId",
  async (req, res) => {
    const universeId =
      Number(req.params.universeId);

    if (
      !Number.isSafeInteger(universeId) ||
      universeId <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid universe ID."
      });
    }

    try {
      const games =
        await hydrateGames([
          {
            universeId
          }
        ]);

      if (!games.length) {
        return res.status(404).json({
          success: false,
          error: "Game not found."
        });
      }

      res.json({
        success: true,
        game: games[0]
      });
    } catch (error) {
      console.error(
        "[WebBlox] Game error:",
        error
      );

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// HEALTH
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "WebBlox Backend",
    status: "online"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

// ============================================================
// START
// ============================================================

app.listen(PORT, () => {
  console.log("");
  console.log("====================================");
  console.log(" WebBlox Backend");
  console.log("====================================");
  console.log(
    `[WebBlox] Port: ${PORT}`
  );
  console.log(
    `[WebBlox] Home: /api/home`
  );
  console.log(
    `[WebBlox] Search: /api/search?q=...`
  );
  console.log("====================================");
});
