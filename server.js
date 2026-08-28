const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const ROBLOX_SEARCH =
  "https://apis.roblox.com/search-api/omni-search";

const ROBLOX_GAMES =
  "https://games.roblox.com/v1/games";

const ROBLOX_THUMBNAILS =
  "https://thumbnails.roblox.com/v1/games";

const ROBLOX_ICONS =
  "https://thumbnails.roblox.com/v1/games/icons";

async function robloxFetch(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WebBlox/5.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Roblox HTTP ${response.status}: ${text}`
    );
  }

  return JSON.parse(text);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function unique(values) {
  return [...new Set(values)];
}

/* ============================================================
   SEARCH
   ============================================================ */

function extractSearchResults(data) {
  const games = [];

  function inspect(item) {
    if (!item || typeof item !== "object") {
      return;
    }

    const universeId =
      item.universeId ||
      item.universeID ||
      item.game?.universeId ||
      item.experience?.universeId ||
      item.universe?.id;

    const placeId =
      item.placeId ||
      item.placeID ||
      item.rootPlaceId ||
      item.game?.placeId ||
      item.experience?.placeId ||
      item.rootPlace?.id;

    const name =
      item.name ||
      item.title ||
      item.game?.name ||
      item.experience?.name ||
      "";

    if (
      universeId &&
      placeId &&
      String(name).trim()
    ) {
      games.push({
        universeId: number(universeId),
        placeId: number(placeId),
        name: String(name).trim()
      });
    }

    if (Array.isArray(item.items)) {
      item.items.forEach(inspect);
    }

    if (Array.isArray(item.contents)) {
      item.contents.forEach(inspect);
    }

    if (Array.isArray(item.results)) {
      item.results.forEach(inspect);
    }
  }

  const results =
    data?.searchResults ||
    data?.results ||
    data?.data ||
    [];

  if (Array.isArray(results)) {
    results.forEach(inspect);
  }

  const seen = new Set();

  return games.filter(game => {
    if (seen.has(game.universeId)) {
      return false;
    }

    seen.add(game.universeId);
    return true;
  });
}

async function searchRoblox(query) {
  const sessionId =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const url =
    `${ROBLOX_SEARCH}` +
    `?searchQuery=${encodeURIComponent(query)}` +
    `&sessionId=${encodeURIComponent(sessionId)}` +
    `&pageType=all`;

  const data = await robloxFetch(url);

  return extractSearchResults(data);
}

/* ============================================================
   GAME DETAILS
   ============================================================ */

async function getGameDetails(universeIds) {
  const games = [];

  for (
    let i = 0;
    i < universeIds.length;
    i += 25
  ) {
    const batch =
      universeIds.slice(i, i + 25);

    try {
      const data = await robloxFetch(
        `${ROBLOX_GAMES}?universeIds=${batch.join(",")}`
      );

      if (Array.isArray(data.data)) {
        games.push(...data.data);
      }
    } catch (error) {
      console.error(
        "Game details error:",
        error.message
      );
    }
  }

  return games;
}

/* ============================================================
   THUMBNAILS
   ============================================================ */

async function getThumbnails(universeIds) {
  const result = new Map();

  /*
    Roblox accepts multiple universe IDs, but keeping
    the batches small avoids the "too many universe IDs"
    error you encountered earlier.
  */

  for (
    let i = 0;
    i < universeIds.length;
    i += 25
  ) {
    const batch =
      universeIds.slice(i, i + 25);

    try {
      const url =
        `${ROBLOX_THUMBNAILS}` +
        `?universeIds=${batch.join(",")}` +
        `&size=768x432` +
        `&format=Png` +
        `&isCircular=false`;

      const data =
        await robloxFetch(url);

      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (
            item.targetId &&
            item.imageUrl
          ) {
            result.set(
              number(item.targetId),
              item.imageUrl
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "Thumbnail batch error:",
        error.message
      );
    }
  }

  return result;
}

/* ============================================================
   ICONS
   ============================================================ */

async function getIcons(universeIds) {
  const result = new Map();

  for (
    let i = 0;
    i < universeIds.length;
    i += 25
  ) {
    const batch =
      universeIds.slice(i, i + 25);

    try {
      const url =
        `${ROBLOX_ICONS}` +
        `?universeIds=${batch.join(",")}` +
        `&size=150x150` +
        `&format=Png` +
        `&isCircular=false`;

      const data =
        await robloxFetch(url);

      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (
            item.targetId &&
            item.imageUrl
          ) {
            result.set(
              number(item.targetId),
              item.imageUrl
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "Icon batch error:",
        error.message
      );
    }
  }

  return result;
}

/* ============================================================
   FORMAT
   ============================================================ */

async function formatGames(games) {
  const validGames =
    games.filter(game => {
      const universeId =
        number(game.id);

      const placeId =
        number(game.rootPlaceId);

      return (
        universeId > 0 &&
        placeId > 0 &&
        String(game.name || "").trim()
      );
    });

  const universeIds =
    unique(
      validGames.map(
        game => number(game.id)
      )
    );

  const [
    thumbnails,
    icons
  ] = await Promise.all([
    getThumbnails(universeIds),
    getIcons(universeIds)
  ]);

  return validGames.map(game => {
    const universeId =
      number(game.id);

    const placeId =
      number(game.rootPlaceId);

    return {
      id: universeId,

      universeId,

      placeId,

      name:
        String(
          game.name || ""
        ).trim(),

      description:
        String(
          game.description || ""
        ),

      creator:
        String(
          game.creator?.name ||
          ""
        ),

      creatorId:
        number(
          game.creator?.id
        ),

      playing:
        number(game.playing),

      visits:
        number(game.visits),

      favorites:
        number(
          game.favoritedCount
        ),

      maxPlayers:
        number(
          game.maxPlayers
        ),

      thumbnail:
        thumbnails.get(
          universeId
        ) || "",

      icon:
        icons.get(
          universeId
        ) || "",

      robloxUrl:
        `https://www.roblox.com/games/${placeId}`,

      genre:
        String(
          game.genre ||
          "All"
        ),

      updated:
        game.updated || null
    };
  });
}

/* ============================================================
   SEARCH ENDPOINT
   ============================================================ */

app.get("/api/search", async (req, res) => {
  try {
    const query =
      String(
        req.query.q || ""
      ).trim();

    if (!query) {
      return res.json({
        success: true,
        games: []
      });
    }

    console.log(
      `Searching Roblox: ${query}`
    );

    const searchResults =
      await searchRoblox(query);

    if (!searchResults.length) {
      return res.json({
        success: true,
        query,
        games: []
      });
    }

    const universeIds =
      searchResults
        .map(
          game =>
            number(
              game.universeId
            )
        )
        .filter(Boolean);

    const details =
      await getGameDetails(
        universeIds
      );

    const games =
      await formatGames(details);

    res.json({
      success: true,
      query,
      games
    });

  } catch (error) {
    console.error(
      "SEARCH ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
      games: []
    });
  }
});

/* ============================================================
   HOME
   ============================================================ */

app.get("/api/home", async (req, res) => {
  try {
    /*
      These are only used to discover real Roblox
      experiences. Nothing is generated locally.
    */

    const queries = [
      "Roblox",
      "Blox Fruits",
      "Brookhaven",
      "simulator",
      "obby"
    ];

    const all = [];

    for (const query of queries) {
      try {
        const searchResults =
          await searchRoblox(query);

        const ids =
          searchResults
            .map(
              game =>
                number(
                  game.universeId
                )
            )
            .filter(Boolean);

        const details =
          await getGameDetails(ids);

        const formatted =
          await formatGames(
            details
          );

        for (const game of formatted) {
          if (
            !all.some(
              existing =>
                existing.universeId ===
                game.universeId
            )
          ) {
            all.push(game);
          }
        }

        if (all.length >= 40) {
          break;
        }

      } catch (error) {
        console.error(
          `Home query failed (${query}):`,
          error.message
        );
      }
    }

    const popular =
      [...all]
        .sort(
          (a, b) =>
            b.playing - a.playing
        )
        .slice(0, 20);

    const recommended =
      [...all]
        .sort(
          (a, b) =>
            b.visits - a.visits
        )
        .slice(0, 20);

    res.json({
      success: true,
      recommended,
      popular
    });

  } catch (error) {
    console.error(
      "HOME ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
      recommended: [],
      popular: []
    });
  }
});

/* ============================================================
   SINGLE GAME
   ============================================================ */

app.get(
  "/api/game/:universeId",
  async (req, res) => {
    try {
      const universeId =
        number(
          req.params.universeId
        );

      if (!universeId) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid universe ID"
        });
      }

      const details =
        await getGameDetails([
          universeId
        ]);

      const games =
        await formatGames(
          details
        );

      if (!games.length) {
        return res.status(404).json({
          success: false,
          error:
            "Roblox experience not found"
        });
      }

      res.json({
        success: true,
        game: games[0]
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/* ============================================================
   HEALTH
   ============================================================ */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "WebBlox Backend",
    roblox: true
  });
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "WebBlox Backend"
  });
});

app.listen(PORT, () => {
  console.log(
    `WebBlox Backend running on port ${PORT}`
  );
});
