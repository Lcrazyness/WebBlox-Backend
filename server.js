// ============================================================
// WebBlox Backend
// ============================================================

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS
// ============================================================

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

// ============================================================
// ROBLOX FETCH
// ============================================================

async function robloxFetch(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WebBlox/2.0"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      error: text
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
// NORMALIZE
// ============================================================

function normalizeGame(game) {
  if (!game) return null;

  const universeId =
    game.universeId ??
    game.id ??
    game.universeID;

  const placeId =
    game.placeId ??
    game.rootPlaceId ??
    game.rootPlace?.id;

  if (!universeId) {
    return null;
  }

  return {
    id: Number(universeId),
    universeId: Number(universeId),

    placeId: placeId
      ? Number(placeId)
      : null,

    name:
      game.name ||
      game.displayName ||
      game.title ||
      "Untitled Experience",

    description:
      game.description ||
      game.shortDescription ||
      "",

    // This will be overwritten by the
    // official game-details request when possible.
    creator:
      game.creator?.name ||
      game.creatorName ||
      game.creator?.displayName ||
      "Unknown Creator",

    creatorId:
      game.creator?.id ||
      game.creatorId ||
      null,

    creatorType:
      game.creator?.type ||
      null,

    playing:
      Number(game.playing) ||
      Number(game.playerCount) ||
      0,

    visits:
      Number(game.visits) ||
      Number(game.visitCount) ||
      0,

    favorites:
      Number(game.favoritedCount) ||
      Number(game.favorites) ||
      Number(game.favoriteCount) ||
      0,

    maxPlayers:
      Number(game.maxPlayers) ||
      Number(game.maxPlayerCount) ||
      0,

    thumbnail:
      game.thumbnail ||
      game.thumbnailUrl ||
      game.imageUrl ||
      "",

    icon:
      game.icon ||
      game.iconUrl ||
      "",

    robloxUrl: placeId
      ? `https://www.roblox.com/games/${placeId}`
      : `https://www.roblox.com/games/${universeId}`,

    genre:
      game.genre ||
      game.genreName ||
      "All",

    updated:
      game.updated ||
      game.updatedAt ||
      null
  };
}

// ============================================================
// ENRICH GAME DETAILS
//
// This is the important creator fix.
//
// Search results can contain incomplete creator information.
// We ask games.roblox.com for the actual universe details.
// ============================================================

async function enrichGameDetails(games) {
  const valid = games.filter(
    game => game && game.universeId
  );

  const batchSize = 20;

  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = valid.slice(
      i,
      i + batchSize
    );

    const ids = batch
      .map(game => game.universeId)
      .join(",");

    try {
      const url =
        "https://games.roblox.com/v1/games" +
        `?universeIds=${encodeURIComponent(ids)}`;

      const data = await robloxFetch(url);

      const details =
        Array.isArray(data.data)
          ? data.data
          : [];

      for (const detail of details) {
        const game = batch.find(
          item =>
            String(item.universeId) ===
            String(detail.id)
        );

        if (!game) continue;

        // ACTUAL ROBLOX GAME NAME
        if (detail.name) {
          game.name = detail.name;
        }

        // ACTUAL CREATOR
        if (detail.creator) {
          game.creator =
            detail.creator.name ||
            "Unknown Creator";

          game.creatorId =
            detail.creator.id ||
            null;

          game.creatorType =
            detail.creator.type ||
            null;
        }

        // ACTUAL PLACE ID
        if (detail.rootPlaceId) {
          game.placeId =
            Number(detail.rootPlaceId);

          game.robloxUrl =
            `https://www.roblox.com/games/${detail.rootPlaceId}`;
        }

        if (detail.description) {
          game.description =
            detail.description;
        }

        if (detail.playing != null) {
          game.playing =
            Number(detail.playing) || 0;
        }

        if (detail.visits != null) {
          game.visits =
            Number(detail.visits) || 0;
        }

        if (detail.favoritedCount != null) {
          game.favorites =
            Number(detail.favoritedCount) || 0;
        }

        if (detail.maxPlayers != null) {
          game.maxPlayers =
            Number(detail.maxPlayers) || 0;
        }

        if (detail.genre) {
          game.genre = detail.genre;
        }

        if (detail.updated) {
          game.updated = detail.updated;
        }
      }
    } catch (error) {
      console.log(
        "[WebBlox] Game detail enrichment failed:",
        error.message
      );
    }
  }

  return valid;
}

// ============================================================
// THUMBNAILS
//
// Use landscape game thumbnails instead of square icons.
// ============================================================

async function addThumbnails(games) {
  const valid = games.filter(
    game => game && game.universeId
  );

  const batchSize = 10;

  for (
    let i = 0;
    i < valid.length;
    i += batchSize
  ) {
    const batch = valid.slice(
      i,
      i + batchSize
    );

    const ids = batch
      .map(game => game.universeId)
      .join(",");

    try {
      const url =
        "https://thumbnails.roblox.com/v1/games/multiget/thumbnails" +
        `?universeIds=${encodeURIComponent(ids)}` +
        "&countPerUniverse=1" +
        "&defaults=true" +
        "&size=768x432" +
        "&format=Png";

      const data = await robloxFetch(url);

      const results =
        Array.isArray(data.data)
          ? data.data
          : [];

      for (const result of results) {
        const game = batch.find(
          item =>
            String(item.universeId) ===
            String(result.universeId)
        );

        if (!game) continue;

        const thumbnail =
          result.thumbnails?.[0];

        if (thumbnail?.imageUrl) {
          game.thumbnail =
            thumbnail.imageUrl;
        }
      }
    } catch (error) {
      console.log(
        "[WebBlox] Thumbnail error:",
        error.message
      );
    }
  }

  return games;
}

// ============================================================
// FINALIZE GAMES
// ============================================================

async function finalizeGames(games) {
  const unique = [];
  const seen = new Set();

  for (const game of games) {
    if (!game?.universeId) continue;

    const key =
      String(game.universeId);

    if (seen.has(key)) continue;

    seen.add(key);

    if (
      !game.name ||
      game.name === "Untitled Experience"
    ) {
      continue;
    }

    unique.push(game);
  }

  await enrichGameDetails(unique);
  await addThumbnails(unique);

  return unique;
}

// ============================================================
// SEARCH ROBLOX
// ============================================================

async function searchRobloxGames(
  query,
  limit = 30
) {
  const sessionId =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const url =
    "https://apis.roblox.com/search-api/omni-search" +
    `?searchQuery=${encodeURIComponent(query)}` +
    `&sessionId=${encodeURIComponent(sessionId)}` +
    "&pageType=all";

  const data =
    await robloxFetch(url);

  const games = [];

  function walk(value) {
    if (!value) return;

    if (games.length >= limit) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);

        if (games.length >= limit) {
          break;
        }
      }

      return;
    }

    if (
      typeof value !== "object"
    ) {
      return;
    }

    const id =
      value.universeId ??
      value.rootPlaceId ??
      value.placeId;

    const name =
      value.name ||
      value.displayName ||
      value.title;

    if (id && name) {
      const game =
        normalizeGame(value);

      if (
        game &&
        game.name &&
        game.name !== "Untitled Experience"
      ) {
        games.push(game);
      }
    }

    for (
      const key of Object.keys(value)
    ) {
      if (
        key === "sessionId" ||
        key === "nextPageToken"
      ) {
        continue;
      }

      if (games.length >= limit) {
        break;
      }

      walk(value[key]);
    }
  }

  walk(data);

  return finalizeGames(
    games.slice(0, limit)
  );
}

// ============================================================
// HOME / DISCOVER
// ============================================================

async function getHomeGames() {
  const sessionId =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const sortsUrl =
    "https://apis.roblox.com/explore-api/v1/get-sorts" +
    `?sessionId=${encodeURIComponent(sessionId)}` +
    "&device=computer" +
    "&country=all";

  const sorts =
    await robloxFetch(sortsUrl);

  const sortList =
    sorts.sorts ||
    sorts.data ||
    [];

  const games = [];

  for (
    const sort of sortList.slice(0, 10)
  ) {
    const sortId =
      sort.sortId ||
      sort.id;

    if (!sortId) continue;

    try {
      const url =
        "https://apis.roblox.com/explore-api/v1/get-sort-content" +
        `?sessionId=${encodeURIComponent(sessionId)}` +
        `&sortId=${encodeURIComponent(sortId)}`;

      const content =
        await robloxFetch(url);

      const items =
        content.games ||
        content.items ||
        content.data ||
        content.content ||
        [];

      for (const item of items) {
        const game =
          normalizeGame(item);

        if (
          game &&
          game.universeId &&
          game.name &&
          game.name !== "Untitled Experience"
        ) {
          games.push(game);
        }

        if (games.length >= 60) {
          break;
        }
      }
    } catch (error) {
      console.log(
        "[WebBlox] Sort error:",
        error.message
      );
    }

    if (games.length >= 60) {
      break;
    }
  }

  const finalized =
    await finalizeGames(
      games.slice(0, 60)
    );

  const popular =
    [...finalized]
      .sort(
        (a, b) =>
          b.playing - a.playing
      )
      .slice(0, 30);

  const recommended =
    [...finalized]
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
    popular
  };
}

// ============================================================
// ROUTES
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
    status: "online"
  });
});

// ============================================================
// HOME
// ============================================================

app.get(
  "/api/home",
  async (req, res) => {
    console.log(
      "[WebBlox] GET /api/home"
    );

    try {
      const data =
        await getHomeGames();

      console.log(
        `[WebBlox] ${data.popular.length} games loaded`
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
        popular: []
      });
    }
  }
);

// ============================================================
// SEARCH
// ============================================================

app.get(
  "/api/search",
  async (req, res) => {
    const query =
      typeof req.query.q === "string"
        ? req.query.q.trim()
        : "";

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Enter a game name.",
        games: []
      });
    }

    console.log(
      "[WebBlox] Searching:",
      query
    );

    try {
      const limit =
        Math.min(
          Math.max(
            Number(req.query.limit) || 30,
            1
          ),
          50
        );

      const games =
        await searchRobloxGames(
          query,
          limit
        );

      res.json({
        success: true,
        query,
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
  }
);

// ============================================================
// GAME DETAILS
// ============================================================

app.get(
  "/api/game/:universeId",
  async (req, res) => {
    const universeId =
      String(req.params.universeId);

    if (!/^\d+$/.test(universeId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid universe ID."
      });
    }

    try {
      const url =
        `https://games.roblox.com/v1/games?universeIds=${universeId}`;

      const data =
        await robloxFetch(url);

      const raw =
        Array.isArray(data.data)
          ? data.data[0]
          : null;

      if (!raw) {
        return res.status(404).json({
          success: false,
          error: "Game not found."
        });
      }

      const game =
        normalizeGame(raw);

      await enrichGameDetails([game]);
      await addThumbnails([game]);

      res.json({
        success: true,
        game
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "===================================="
    );
    console.log(
      "       WebBlox Backend Online"
    );
    console.log(
      "===================================="
    );
    console.log(
      `Port: ${PORT}`
    );
    console.log(
      "CORS: enabled"
    );
    console.log(
      "Search: enabled"
    );
    console.log(
      "Creator lookup: enabled"
    );
    console.log(
      "Thumbnails: enabled"
    );
    console.log(
      "===================================="
    );
    console.log("");
  }
);
