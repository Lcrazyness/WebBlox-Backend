const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ============================================================
   CORS
   ============================================================ */

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Accept");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});


/* ============================================================
   CACHE
   ============================================================ */

const cache = new Map();

const CACHE_TIME = 30 * 1000;


/* ============================================================
   HELPERS
   ============================================================ */

function getCached(key) {

    const item = cache.get(key);

    if (!item) {
        return null;
    }

    if (Date.now() - item.time > CACHE_TIME) {
        cache.delete(key);
        return null;
    }

    return item.data;
}


function setCached(key, data) {

    cache.set(key, {
        time: Date.now(),
        data
    });

}


/* ============================================================
   ROBLOX REQUEST
   ============================================================ */

async function robloxFetch(url) {

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    if (!response.ok) {

        throw new Error(
            `Roblox HTTP ${response.status}: ${text}`
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


/* ============================================================
   GAME NORMALIZER
   ============================================================ */

function normalizeGame(game, universeInfo = null) {

    const universeId =
        Number(
            game.universeId ||
            game.id ||
            universeInfo?.id ||
            0
        );

    const placeId =
        Number(
            game.placeId ||
            universeInfo?.rootPlaceId ||
            0
        );

    const name =
        game.name ||
        universeInfo?.name ||
        "Roblox Experience";

    const creator =
        game.creator?.name ||
        game.creatorName ||
        game.creator ||
        universeInfo?.creator?.name ||
        "Unknown Creator";

    const creatorId =
        Number(
            game.creator?.id ||
            game.creatorId ||
            universeInfo?.creator?.id ||
            0
        );

    return {

        id: universeId,

        universeId,

        placeId,

        name,

        description:
            game.description ||
            universeInfo?.description ||
            "",

        creator,

        creatorId,

        playing:
            Number(
                game.playing ||
                game.playerCount ||
                universeInfo?.playing ||
                0
            ),

        visits:
            Number(
                game.visits ||
                game.placeVisits ||
                universeInfo?.visits ||
                0
            ),

        favorites:
            Number(
                game.favorites ||
                game.favoriteCount ||
                universeInfo?.favorites ||
                0
            ),

        likes:
            Number(
                game.likes ||
                universeInfo?.likes ||
                0
            ),

        dislikes:
            Number(
                game.dislikes ||
                universeInfo?.dislikes ||
                0
            ),

        maxPlayers:
            Number(
                game.maxPlayers ||
                universeInfo?.maxPlayers ||
                50
            ),

        thumbnail:
            game.thumbnail ||
            game.thumbnailUrl ||
            "",

        icon:
            game.icon ||
            game.iconUrl ||
            "",

        genre:
            game.genre ||
            universeInfo?.genre ||
            "All",

        updated:
            game.updated ||
            game.updatedAt ||
            universeInfo?.updatedAt ||
            null,

        robloxUrl:
            placeId
                ? `https://www.roblox.com/games/${placeId}`
                : universeId
                    ? `https://www.roblox.com/games/${universeId}`
                    : "#"

    };

}


/* ============================================================
   GET UNIVERSE DETAILS
   ============================================================ */

async function getUniverseDetails(universeIds) {

    if (!Array.isArray(universeIds)) {
        return [];
    }

    const ids = [
        ...new Set(
            universeIds
                .map(Number)
                .filter(Boolean)
        )
    ].slice(0, 50);

    if (!ids.length) {
        return [];
    }

    const cacheKey =
        "universes:" +
        ids.join(",");

    const cached =
        getCached(cacheKey);

    if (cached) {
        return cached;
    }

    const url =
        "https://games.roblox.com/v1/games" +
        "?universeIds=" +
        ids.join(",");

    const data =
        await robloxFetch(url);

    const games =
        Array.isArray(data.data)
            ? data.data
            : [];

    setCached(
        cacheKey,
        games
    );

    return games;

}


/* ============================================================
   THUMBNAILS
   ============================================================ */

async function getThumbnails(universeIds) {

    const ids = [
        ...new Set(
            universeIds
                .map(Number)
                .filter(Boolean)
        )
    ].slice(0, 50);

    if (!ids.length) {
        return {};
    }

    const cacheKey =
        "thumbnails:" +
        ids.join(",");

    const cached =
        getCached(cacheKey);

    if (cached) {
        return cached;
    }

    const url =
        "https://thumbnails.roblox.com/v1/games/icons" +
        "?universeIds=" +
        ids.join(",") +
        "&returnPolicy=PlaceHolder" +
        "&size=512x512" +
        "&format=Png" +
        "&isCircular=false";

    const data =
        await robloxFetch(url);

    const result = {};

    for (const item of data.data || []) {

        if (
            item &&
            item.targetId &&
            item.imageUrl
        ) {

            result[
                String(item.targetId)
            ] =
                item.imageUrl;

        }

    }

    setCached(
        cacheKey,
        result
    );

    return result;

}


/* ============================================================
   ATTACH REAL ROBLOX DATA
   ============================================================ */

async function enrichGames(games) {

    if (!Array.isArray(games) || !games.length) {
        return [];
    }

    const universeIds =
        games
            .map(game =>
                Number(
                    game.universeId ||
                    game.id
                )
            )
            .filter(Boolean);

    let details = [];

    try {

        details =
            await getUniverseDetails(
                universeIds
            );

    } catch (error) {

        console.error(
            "[WebBlox] Universe details error:",
            error.message
        );

    }

    const detailMap = new Map();

    for (const item of details) {

        detailMap.set(
            Number(item.id),
            item
        );

    }

    let thumbnails = {};

    try {

        thumbnails =
            await getThumbnails(
                universeIds
            );

    } catch (error) {

        console.error(
            "[WebBlox] Thumbnail error:",
            error.message
        );

    }

    return games.map(game => {

        const universeId =
            Number(
                game.universeId ||
                game.id ||
                0
            );

        const detail =
            detailMap.get(
                universeId
            ) || null;

        const normalized =
            normalizeGame(
                game,
                detail
            );

        if (
            thumbnails[
                String(universeId)
            ]
        ) {

            normalized.thumbnail =
                thumbnails[
                    String(universeId)
                ];

        }

        return normalized;

    });

}


/* ============================================================
   HOME
   ============================================================ */

app.get("/api/home", async (req, res) => {

    try {

        const cacheKey =
            "home";

        const cached =
            getCached(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        /*
         * We use the Roblox discovery endpoint through
         * Roblox's games API.
         *
         * The existing WebBlox frontend expects:
         *
         * recommended[]
         * popular[]
         */

        const popularUrl =
            "https://games.roblox.com/v1/games/list" +
            "?sortOrder=Desc" +
            "&model.keyword=" +
            "&model.maxRows=30";

        let raw = [];

        try {

            const data =
                await robloxFetch(
                    popularUrl
                );

            raw =
                Array.isArray(data)
                    ? data
                    : Array.isArray(data.games)
                        ? data.games
                        : Array.isArray(data.data)
                            ? data.data
                            : [];

        } catch (error) {

            console.error(
                "[WebBlox] Discovery endpoint:",
                error.message
            );

        }


        /*
         * If discovery endpoint doesn't return
         * the expected structure, use a small
         * real-game fallback list from Roblox IDs.
         *
         * These are only real Roblox experiences.
         */

        if (!raw.length) {

            const knownIds = [
                4924922222,
                2753915549,
                920587237,
                142823291,
                9391468976,
                8737899170,
                7041939546,
                10449761463
            ];

            const details =
                await getUniverseDetails(
                    knownIds
                );

            raw =
                details.map(item => ({
                    id: item.id,
                    universeId: item.id,
                    placeId: item.rootPlaceId,
                    name: item.name,
                    description: item.description,
                    creator: item.creator,
                    playing: item.playing,
                    visits: item.visits,
                    favorites: item.favoritedCount,
                    maxPlayers: item.maxPlayers,
                    updatedAt: item.updated
                }));

        }


        const games =
            await enrichGames(
                raw
            );


        const sorted =
            [...games]
                .sort(
                    (a, b) =>
                        Number(b.playing || 0) -
                        Number(a.playing || 0)
                );


        const result = {

            success: true,

            recommended:
                sorted.slice(0, 12),

            popular:
                sorted.slice(0, 18)

        };


        setCached(
            cacheKey,
            result
        );


        res.json(result);

    } catch (error) {

        console.error(
            "[WebBlox] /api/home:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Failed to load Roblox experiences."

        });

    }

});


/* ============================================================
   POPULAR
   ============================================================ */

app.get("/api/popular", async (req, res) => {

    try {

        const data =
            await robloxFetch(
                "https://games.roblox.com/v1/games/list" +
                "?sortOrder=Desc" +
                "&model.keyword=" +
                "&model.maxRows=30"
            );

        let games =
            Array.isArray(data)
                ? data
                : Array.isArray(data.games)
                    ? data.games
                    : Array.isArray(data.data)
                        ? data.data
                        : [];

        games =
            await enrichGames(
                games
            );

        games.sort(
            (a, b) =>
                Number(b.playing || 0) -
                Number(a.playing || 0)
        );

        res.json({

            success: true,

            games:
                games.slice(0, 30)

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Failed to load popular games."

        });

    }

});


/* ============================================================
   SEARCH
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


        /*
         * Roblox search.
         *
         * This endpoint returns real
         * Roblox experiences matching
         * the user's search.
         */

        const url =
            "https://games.roblox.com/v1/games/list" +
            "?sortOrder=Desc" +
            "&model.keyword=" +
            encodeURIComponent(query) +
            "&model.maxRows=50";


        let data =
            await robloxFetch(
                url
            );


        let games =
            Array.isArray(data)
                ? data
                : Array.isArray(data.games)
                    ? data.games
                    : Array.isArray(data.data)
                        ? data.data
                        : [];


        /*
         * Some Roblox responses use
         * different property names.
         */

        games =
            games.filter(Boolean);


        games =
            await enrichGames(
                games
            );


        res.json({

            success: true,

            query,

            games

        });

    } catch (error) {

        console.error(
            "[WebBlox] Search:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Roblox search failed."

        });

    }

});


/* ============================================================
   SINGLE GAME
   ============================================================ */

app.get("/api/game/:id", async (req, res) => {

    try {

        const id =
            Number(
                req.params.id
            );

        if (!id) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid Roblox universe ID."

            });

        }


        const games =
            await getUniverseDetails([
                id
            ]);


        if (!games.length) {

            return res.status(404).json({

                success: false,

                error:
                    "Roblox experience not found."

            });

        }


        const result =
            await enrichGames(
                games
            );


        res.json({

            success: true,

            game:
                result[0]

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Failed to load Roblox experience."

        });

    }

});


/* ============================================================
   HEALTH
   ============================================================ */

app.get("/", (req, res) => {

    res.json({

        success: true,

        name: "WebBlox Backend",

        status: "online",

        version: "4.0.0"

    });

});


app.get("/health", (req, res) => {

    res.json({

        success: true,

        status: "online"

    });

});


/* ============================================================
   START
   ============================================================ */

app.listen(
    PORT,
    () => {

        console.log(
            "===================================="
        );

        console.log(
            "WebBlox Backend"
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "Status: ONLINE"
        );

        console.log(
            "===================================="
        );

    }
);
