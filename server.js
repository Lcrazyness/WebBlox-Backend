const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json());

/* =========================================================
   CONFIG
========================================================= */

const ROBLOX_EXPLORE =
    "https://apis.roblox.com/explore-api/v1";

const ROBLOX_SEARCH =
    "https://apis.roblox.com/search-api";

const ROBLOX_GAMES =
    "https://games.roblox.com/v1";

const ROBLOX_THUMBNAILS =
    "https://thumbnails.roblox.com/v1";

/* =========================================================
   CORS
========================================================= */

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

/* =========================================================
   HELPERS
========================================================= */

function sessionId() {
    return crypto.randomUUID();
}

async function robloxFetch(url, options = {}) {
    console.log("[Roblox] GET/POST:", url);

    const response = await fetch(url, {
        ...options,
        headers: {
            "Accept": "application/json",
            "User-Agent":
                "WebBlox/3.0 (+https://lcrazyness.github.io/WebBlox/)",
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    console.log(
        "[Roblox] Status:",
        response.status
    );

    if (!response.ok) {
        console.error(
            "[Roblox] Error:",
            text.substring(0, 1000)
        );

        throw new Error(
            `Roblox API returned HTTP ${response.status}`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            "Roblox returned invalid JSON."
        );
    }
}

/* =========================================================
   THUMBNAILS
========================================================= */

async function getThumbnails(universeIds) {
    if (!universeIds.length) {
        return new Map();
    }

    const uniqueIds = [
        ...new Set(
            universeIds
                .map(String)
                .filter(Boolean)
        )
    ];

    const result = new Map();

    /*
      Roblox accepts a comma-separated list of universe IDs.
      Keep batches reasonably small.
    */

    for (
        let i = 0;
        i < uniqueIds.length;
        i += 50
    ) {
        const batch =
            uniqueIds.slice(i, i + 50);

        const url =
            ROBLOX_THUMBNAILS +
            "/games/multiget/thumbnails" +
            "?universeIds=" +
            encodeURIComponent(
                batch.join(",")
            ) +
            "&size=768x432" +
            "&format=Png" +
            "&isCircular=false";

        try {
            const data =
                await robloxFetch(url);

            const items =
                Array.isArray(data.data)
                    ? data.data
                    : [];

            for (const item of items) {
                if (
                    item &&
                    item.targetId &&
                    item.imageUrl
                ) {
                    result.set(
                        String(item.targetId),
                        item.imageUrl
                    );
                }
            }
        } catch (error) {
            console.error(
                "[Thumbnails] Failed:",
                error.message
            );
        }
    }

    return result;
}

/* =========================================================
   GAME DETAILS
========================================================= */

async function getGameDetails(universeIds) {
    if (!universeIds.length) {
        return [];
    }

    const uniqueIds = [
        ...new Set(
            universeIds
                .map(String)
                .filter(Boolean)
        )
    ];

    const results = [];

    for (
        let i = 0;
        i < uniqueIds.length;
        i += 50
    ) {
        const batch =
            uniqueIds.slice(i, i + 50);

        const url =
            ROBLOX_GAMES +
            "/games?universeIds=" +
            encodeURIComponent(
                batch.join(",")
            );

        try {
            const data =
                await robloxFetch(url);

            if (
                Array.isArray(data.data)
            ) {
                results.push(
                    ...data.data
                );
            }
        } catch (error) {
            console.error(
                "[Game Details] Failed:",
                error.message
            );
        }
    }

    return results;
}

/* =========================================================
   NORMALIZE ROBLOX GAME
========================================================= */

function normalizeGame(
    game,
    thumbnailMap
) {
    const universeId =
        game.id ??
        game.universeId ??
        game.placeId;

    if (!universeId) {
        return null;
    }

    const id =
        String(universeId);

    const thumbnail =
        thumbnailMap.get(id) ||
        game.thumbnailUrl ||
        game.thumbnail ||
        null;

    return {
        id: id,

        universeId: id,

        placeId:
            game.rootPlaceId ??
            game.placeId ??
            null,

        name:
            game.name ||
            "Unknown Roblox Experience",

        creator:
            game.creator?.name ||
            game.creatorName ||
            "Unknown Creator",

        creatorId:
            game.creator?.id ||
            game.creatorId ||
            null,

        description:
            game.description ||
            "",

        playing:
            Number(
                game.playing ??
                game.playerCount ??
                0
            ),

        visits:
            Number(
                game.visits ??
                game.placeVisits ??
                0
            ),

        maxPlayers:
            Number(
                game.maxPlayers ??
                0
            ),

        thumbnail: thumbnail,

        icon: thumbnail,

        placeUrl:
            "https://www.roblox.com/games/" +
            (
                game.rootPlaceId ??
                game.placeId ??
                id
            )
    };
}

/* =========================================================
   EXTRACT UNIVERSE IDS
========================================================= */

function extractUniverseIds(value) {
    const ids = [];

    function walk(item) {
        if (!item) {
            return;
        }

        if (Array.isArray(item)) {
            for (const x of item) {
                walk(x);
            }
            return;
        }

        if (
            typeof item === "string" ||
            typeof item === "number"
        ) {
            return;
        }

        if (typeof item !== "object") {
            return;
        }

        /*
          Different versions of Roblox's discovery/search
          responses use different field names.
        */

        const possibleId =
            item.universeId ??
            item.universeID ??
            item.placeId ??
            item.placeID ??
            item.contentId ??
            item.contentID ??
            item.id;

        const contentType =
            String(
                item.contentType ??
                item.type ??
                ""
            ).toLowerCase();

        if (
            possibleId &&
            (
                !contentType ||
                contentType.includes("game") ||
                contentType.includes("experience") ||
                contentType.includes("universe")
            )
        ) {
            ids.push(
                String(possibleId)
            );
        }

        for (const key of Object.keys(item)) {
            const child =
                item[key];

            if (
                child &&
                typeof child === "object"
            ) {
                walk(child);
            }
        }
    }

    walk(value);

    return [
        ...new Set(ids)
    ];
}

/* =========================================================
   DISCOVERY
========================================================= */

async function getDiscovery() {
    const sid =
        sessionId();

    const url =
        ROBLOX_EXPLORE +
        "/get-sorts" +
        "?sessionId=" +
        encodeURIComponent(sid) +
        "&device=computer" +
        "&country=all";

    return robloxFetch(url);
}

/*
  Roblox's Explore API returns sorts. We search through
  those sorts for actual game/universe IDs.
*/

async function getPopularGames() {
    const discovery =
        await getDiscovery();

    console.log(
        "[Discovery] Received discovery response."
    );

    const universeIds =
        extractUniverseIds(
            discovery
        );

    console.log(
        "[Discovery] Universe IDs found:",
        universeIds.length
    );

    if (!universeIds.length) {
        return [];
    }

    /*
      Get real game metadata from the official games API.
    */

    const details =
        await getGameDetails(
            universeIds.slice(0, 50)
        );

    const thumbnails =
        await getThumbnails(
            details.map(
                game =>
                    game.id ??
                    game.universeId
            )
        );

    return details
        .map(
            game =>
                normalizeGame(
                    game,
                    thumbnails
                )
        )
        .filter(Boolean)
        .filter(
            game =>
                game.name &&
                game.universeId
        );
}

/* =========================================================
   SEARCH
========================================================= */

async function searchRobloxGames(query) {
    const clean =
        String(query || "")
            .trim();

    if (!clean) {
        return [];
    }

    const sid =
        sessionId();

    const url =
        ROBLOX_SEARCH +
        "/omni-search" +
        "?searchQuery=" +
        encodeURIComponent(clean) +
        "&sessionId=" +
        encodeURIComponent(sid) +
        "&pageType=all";

    const data =
        await robloxFetch(url);

    console.log(
        "[Search] Roblox search response received."
    );

    const universeIds =
        extractUniverseIds(
            data
        );

    console.log(
        "[Search] Universe IDs:",
        universeIds.length
    );

    if (!universeIds.length) {
        return [];
    }

    const details =
        await getGameDetails(
            universeIds.slice(0, 50)
        );

    const thumbnails =
        await getThumbnails(
            details.map(
                game =>
                    game.id ??
                    game.universeId
            )
        );

    return details
        .map(
            game =>
                normalizeGame(
                    game,
                    thumbnails
                )
        )
        .filter(Boolean);
}

/* =========================================================
   HOME
========================================================= */

app.get(
    "/api/home",
    async (req, res) => {
        try {
            console.log(
                "[WebBlox] Loading Roblox discovery..."
            );

            const games =
                await getPopularGames();

            /*
              Keep actual Roblox games only.
              Absolutely no fake fallback games.
            */

            const popular =
                games
                    .slice()
                    .sort(
                        (a, b) =>
                            b.playing -
                            a.playing
                    )
                    .slice(0, 24);

            const recommended =
                games.slice(0, 12);

            res.json({
                success: true,
                recommended:
                    recommended,
                popular:
                    popular
            });

        } catch (error) {
            console.error(
                "[/api/home]",
                error
            );

            res.status(502).json({
                success: false,
                error:
                    "Could not load Roblox discovery data.",
                details:
                    error.message
            });
        }
    }
);

/* =========================================================
   POPULAR
========================================================= */

app.get(
    "/api/popular",
    async (req, res) => {
        try {
            const games =
                await getPopularGames();

            const popular =
                games
                    .slice()
                    .sort(
                        (a, b) =>
                            b.playing -
                            a.playing
                    )
                    .slice(0, 50);

            res.json({
                success: true,
                games: popular
            });

        } catch (error) {
            console.error(
                "[/api/popular]",
                error
            );

            res.status(502).json({
                success: false,
                error:
                    "Could not load Roblox popular games.",
                details:
                    error.message
            });
        }
    }
);

/* =========================================================
   SEARCH
========================================================= */

app.get(
    "/api/search",
    async (req, res) => {
        try {
            const query =
                req.query.q;

            if (
                !query ||
                !String(query).trim()
            ) {
                return res.json({
                    success: true,
                    games: []
                });
            }

            console.log(
                "[WebBlox] Roblox search:",
                query
            );

            const games =
                await searchRobloxGames(
                    query
                );

            res.json({
                success: true,
                games:
                    games.slice(0, 50)
            });

        } catch (error) {
            console.error(
                "[/api/search]",
                error
            );

            res.status(502).json({
                success: false,
                error:
                    "Could not search Roblox experiences.",
                details:
                    error.message
            });
        }
    }
);

/* =========================================================
   SINGLE GAME
========================================================= */

app.get(
    "/api/game/:id",
    async (req, res) => {
        try {
            const id =
                String(
                    req.params.id
                );

            const details =
                await getGameDetails([
                    id
                ]);

            if (!details.length) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Roblox experience not found."
                });
            }

            const thumbnails =
                await getThumbnails([
                    id
                ]);

            const game =
                normalizeGame(
                    details[0],
                    thumbnails
                );

            res.json({
                success: true,
                game: game
            });

        } catch (error) {
            console.error(
                "[/api/game/:id]",
                error
            );

            res.status(502).json({
                success: false,
                error:
                    "Could not load Roblox experience.",
                details:
                    error.message
            });
        }
    }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/",
    (req, res) => {
        res.json({
            success: true,
            name: "WebBlox Backend",
            status: "online",
            source: "Roblox APIs"
        });
    }
);

app.get(
    "/health",
    (req, res) => {
        res.json({
            success: true,
            status: "ok"
        });
    }
);

/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {
        res.status(404).json({
            success: false,
            error:
                "WebBlox backend route not found."
        });
    }
);

/* =========================================================
   START
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `WebBlox backend running on port ${PORT}`
        );

        console.log(
            "Roblox discovery/search integration enabled."
        );
    }
);
