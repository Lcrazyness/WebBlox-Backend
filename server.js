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

function unique(array) {
  return [...new Set(array)];
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------- SEARCH RESULT PARSER ---------------- */

function extractSearchResults(data) {
  const results =
    data?.searchResults ||
    data?.results ||
    data?.data ||
    [];

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

/* ---------------- GAME DETAILS ---------------- */

async function getGameDetails(ids) {
  if (!ids.length) {
    return [];
  }

  const results = [];

  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);

    try {
      const data = await robloxFetch(
        `${ROBLOX_GAMES}?universeIds=${batch.join(",")}`
      );

      if (Array.isArray(data.data)) {
        results.push(...data.data);
      }
    } catch (error) {
      console.error(
        "Game details failed:",
        error.message
      );
    }
  }

  return results;
}

/* ---------------- THUMBNAILS ---------------- */

/*
  Use the official per-universe endpoint.

  This is deliberately done one game at a time.
  It avoids the "too many universe IDs" problem
  and makes the thumbnail belong to the exact
  universe we're displaying.
*/

async function getThumbnail(universeId) {
  try {
    const url =
      `${ROBLOX_THUMBNAILS}/${universeId}/thumbnails` +
      `?size=768x432` +
      `&format=Png` +
      `&isCircular=false`;

    const data = await robloxFetch(url);

    if (
      Array.isArray(data.data) &&
      data.data.length > 0
    ) {
      const item = data.data.find(
        x => x.imageUrl
      );

      if (item?.imageUrl) {
        return item.imageUrl;
      }
    }
  } catch (error) {
    console.error(
      `Thumbnail ${universeId}:`,
      error.message
    );
  }

  return "";
}

/* ---------------- ICONS ---------------- */

async function getIcons(universeIds) {
  const map = new Map();

  if (!universeIds.length) {
    return map;
  }

  for (
    let i = 0;
    i < universeIds.length;
    i += 25
  ) {
    const batch =
      universeIds.slice(i, i + 25);

    try {
      const data = await robloxFetch(
        `${ROBLOX_ICONS}` +
        `?universeIds=${batch.join(",")}` +
        `&size=150x150` +
        `&format=Png` +
        `&isCircular=false`
      );

      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (
            item.targetId &&
            item.imageUrl
          ) {
            map.set(
              number(item.targetId),
              item.imageUrl
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "Icons failed:",
        error.message
      );
    }
  }

  return map;
}

/* ---------------- FORMAT GAME ---------------- */

async function formatGames(games) {
  const valid = games.filter(
    game =>
      game &&
      number(game.id || game.universeId) > 0 &&
      number(game.rootPlaceId || game.placeId) > 0 &&
      String(game.name || "").trim()
  );

  const universeIds = unique(
    valid.map(game =>
      number(game.id || game.universeId)
    )
  );

  const icons =
    await getIcons(universeIds);

  /*
    Fetch real thumbnails.
  */
  const thumbnailResults =
    await Promise.all(
      universeIds.map(async id => ({
        id,
        thumbnail: await getThumbnail(id)
      }))
    );

  const thumbnails = new Map(
    thumbnailResults.map(item => [
      item.id,
      item.thumbnail
    ])
  );

  return valid.map(game => {
    const universeId =
      number(game.id || game.universeId);

    const placeId =
      number(
        game.rootPlaceId ||
        game.placeId
      );

    return {
      id: universeId,
      universeId,

      placeId,

      name: String(
        game.name || ""
      ).trim(),

      description:
        String(
          game.description || ""
        ),

      creator:
        String(
          game.creator?.name ||
          game.creatorName ||
          ""
        ),

      creatorId:
        number(
          game.creator?.id ||
          game.creatorId
        ),

      playing:
        number(game.playing),

      visits:
        number(game.visits),

      favorites:
        number(
          game.favoritedCount ||
          game.favorites
        ),

      maxPlayers:
        number(game.maxPlayers),

      thumbnail:
        thumbnails.get(universeId) || "",

      icon:
        icons.get(universeId) || "",

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

/* ---------------- SEARCH ROBLOX ---------------- */

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

  const data =
    await robloxFetch(url);

  const found =
    extractSearchResults(data);

  if (!found.length) {
    return [];
  }

  const details =
    await getGameDetails(
      found.map(
        game => game.universeId
      )
    );

  /*
    Only display actual Roblox game details.
    We do NOT manufacture missing games.
  */

  return formatGames(details);
}

/* ---------------- HOME ---------------- */

app.get("/api/home", async (req, res) => {
  try {
    const queries = [
      "Roblox",
      "Blox Fruits",
      "Brookhaven",
      "simulator",
      "obby"
    ];

    let found = [];

    for (const query of queries) {
      if (found.length >= 30) {
        break;
      }

      try {
        const results =
          await searchRoblox(query);

        for (const game of results) {
          if (
            !found.some(
              x =>
                x.universeId ===
                game.universeId
            )
          ) {
            found.push(game);
          }
        }
      } catch (error) {
        console.error(
          `Home query "${query}" failed:`,
          error.message
        );
      }
    }

    /*
      Sort real games by current player count.
    */
    const popular =
      [...found]
        .sort(
          (a, b) =>
            b.playing - a.playing
        )
        .slice(0, 18);

    const recommended =
      [...found]
        .sort(
          (a, b) =>
            b.visits - a.visits
        )
        .slice(0, 18);

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

/* ---------------- SEARCH ENDPOINT ---------------- */

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
      `Searching Roblox for: ${query}`
    );

    const games =
      await searchRoblox(query);

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

/* ---------------- SINGLE GAME ---------------- */

app.get(
  "/api/game/:universeId",
  async (req, res) => {
    try {
      const id =
        number(
          req.params.universeId
        );

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Invalid universe ID"
        });
      }

      const details =
        await getGameDetails([id]);

      const games =
        await formatGames(details);

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

/* ---------------- HEALTH ---------------- */

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
    service: "WebBlox Backend",
    endpoints: [
      "/api/home",
      "/api/search?q=roblox",
      "/api/game/:universeId",
      "/api/health"
    ]
  });
});

app.listen(PORT, () => {
  console.log(
    `WebBlox backend running on port ${PORT}`
  );
});
