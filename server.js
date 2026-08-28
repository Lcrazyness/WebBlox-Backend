// ============================================================
// WebBlox Backend
// ============================================================

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 10000;

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

const allowedOrigins = [
  "https://lcrazyness.github.io",
  "https://lcrazyness.github.io/WebBlox",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an Origin header
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Also allow GitHub Pages origins
      if (
        origin.startsWith("https://lcrazyness.github.io") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false
  })
);

app.use(express.json());

// Explicit CORS headers as an extra safeguard
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  next();
});

app.options("*", (req, res) => {
  res.sendStatus(204);
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WebBlox/1.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Roblox returned invalid JSON");
  }
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

// ------------------------------------------------------------
// Roblox thumbnail loader
// ------------------------------------------------------------

async function getThumbnails(universeIds) {
  if (!universeIds.length) {
    return {};
  }

  const result = {};

  // Roblox APIs can reject very large ID lists.
  // Keep requests small.
  const chunks = chunkArray(
    [...new Set(universeIds.filter(Boolean))],
    25
  );

  for (const chunk of chunks) {
    try {
      const url =
        "https://thumbnails.roblox.com/v1/games/icons" +
        `?universeIds=${chunk.join(",")}` +
        "&returnPolicy=PlaceHolder" +
        "&size=512x512" +
        "&format=Png" +
        "&isCircular=false";

      const data = await fetchJson(url);

      for (const item of data.data || []) {
        if (item.targetId) {
          result[String(item.targetId)] =
            item.imageUrl || "";
        }
      }
    } catch (error) {
      console.error(
        "[WebBlox] Thumbnail error:",
        error.message
      );
    }
  }

  return result;
}

// ------------------------------------------------------------
// Normalize Roblox game
// ------------------------------------------------------------

function normalizeGame(game, thumbnails = {}) {
  const universeId =
    game.universeId ??
    game.id ??
    game.universeID ??
    null;

  const placeId =
    game.placeId ??
    game.rootPlaceId ??
    game.rootPlaceID ??
    null;

  let creator = "Unknown Creator";

  if (typeof game.creator === "string") {
    creator = game.creator;
  } else if (game.creator?.name) {
    creator = game.creator.name;
  } else if (game.creator?.username) {
    creator = game.creator.username;
  }

  const thumbnail =
    thumbnails[String(universeId)] ||
    game.thumbnail ||
    game.icon ||
    "";

  return {
    id: universeId,
    universeId,
    placeId,

    name:
      game.name ||
      "Untitled Roblox Experience",

    description:
      game.description ||
      "No description available.",

    creator,

    creatorId:
      game.creator?.id ??
      game.creatorId ??
      null,

    playing:
      Number(game.playing ?? game.playerCount ?? 0),

    visits:
      Number(
        game.visits ??
        game.placeVisits ??
        0
      ),

    favorites:
      Number(
        game.favorites ??
        game.favoritedCount ??
        0
      ),

    maxPlayers:
      Number(
        game.maxPlayers ??
        game.maxPlayersAllowed ??
        0
      ),

    thumbnail,

    icon: thumbnail,

    robloxUrl:
      placeId
        ? `https://www.roblox.com/games/${placeId}`
        : universeId
          ? `https://www.roblox.com/games?universeId=${universeId}`
          : "#",

    genre:
      game.genre ||
      game.genre_l1 ||
      "All",

    updated:
      game.updated ||
      game.updatedAt ||
      null
  };
}

// ------------------------------------------------------------
// Search Roblox
// ------------------------------------------------------------

async function searchRobloxGames(keyword, limit = 24) {
  keyword = String(keyword || "").trim();

  if (!keyword) {
    return [];
  }

  const safeLimit = Math.min(
    Math.max(Number(limit) || 24, 1),
    50
  );

  const url =
    "https://games.roblox.com/v1/games/list" +
    `?model.keyword=${encodeURIComponent(keyword)}` +
    `&model.maxRows=${safeLimit}` +
    "&model.startRows=0";

  const data = await fetchJson(url);

  const rawGames =
    data.games ||
    data.data ||
    [];

  const games = rawGames.slice(0, safeLimit);

  const universeIds = games
    .map(
      game =>
        game.universeId ??
        game.id
    )
    .filter(Boolean);

  const thumbnails =
    await getThumbnails(universeIds);

  return games.map(game =>
    normalizeGame(game, thumbnails)
  );
}

// ------------------------------------------------------------
// Home
// ------------------------------------------------------------

app.get("/api/home", async (req, res) => {
  try {
    console.log("[WebBlox] Loading home");

    // Search several broad Roblox categories instead of
    // returning random broken placeholder experiences.
    const searches = [
      "roblox",
      "simulator",
      "tycoon",
      "obby"
    ];

    const allGames = [];

    for (const term of searches) {
      try {
        const games =
          await searchRobloxGames(term, 12);

        allGames.push(...games);
      } catch (error) {
        console.error(
          `[WebBlox] Home search "${term}" failed:`,
          error.message
        );
      }
    }

    // Remove duplicate universe IDs
    const unique = [];
    const seen = new Set();

    for (const game of allGames) {
      const id = String(
        game.universeId ||
        game.placeId ||
        game.name
      );

      if (seen.has(id)) {
        continue;
      }

      seen.add(id);

      // Don't display blank titles
      if (
        !game.name ||
        game.name === "Untitled Roblox Experience"
      ) {
        continue;
      }

      unique.push(game);
    }

    // Popular = highest player count
    const popular = [...unique]
      .sort(
        (a, b) =>
          (b.playing || 0) -
          (a.playing || 0)
      )
      .slice(0, 24);

    // Recommended = another useful selection
    const recommended = [...unique]
      .sort(
        (a, b) =>
          (b.favorites || 0) -
          (a.favorites || 0)
      )
      .slice(0, 24);

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

// ------------------------------------------------------------
// Search endpoint
// ------------------------------------------------------------

app.get("/api/search", async (req, res) => {
  try {
    const query =
      String(req.query.q || "").trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Search query is required."
      });
    }

    console.log(
      `[WebBlox] Searching Roblox for: ${query}`
    );

    const games =
      await searchRobloxGames(query, 50);

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
      error: error.message
    });
  }
});

// ------------------------------------------------------------
// Individual game
// ------------------------------------------------------------

app.get("/api/game/:placeId", async (req, res) => {
  try {
    const placeId =
      String(req.params.placeId);

    if (!/^\d+$/.test(placeId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid place ID."
      });
    }

    const universeUrl =
      `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;

    const universeData =
      await fetchJson(universeUrl);

    const universeId =
      universeData.universeId;

    if (!universeId) {
      throw new Error(
        "Could not find universe for this game."
      );
    }

    const gameUrl =
      `https://games.roblox.com/v1/games?universeIds=${universeId}`;

    const gameData =
      await fetchJson(gameUrl);

    const game =
      gameData.data?.[0];

    if (!game) {
      throw new Error(
        "Roblox did not return game information."
      );
    }

    const thumbnails =
      await getThumbnails([
        universeId
      ]);

    res.json({
      success: true,
      game: normalizeGame(
        {
          ...game,
          placeId
        },
        thumbnails
      )
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
});

// ------------------------------------------------------------
// Health
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

app.listen(PORT, () => {
  console.log("");
  console.log("==============================");
  console.log(" WebBlox Backend");
  console.log("==============================");
  console.log(`Port: ${PORT}`);
  console.log("Status: ONLINE");
  console.log("==============================");
  console.log("");
});
