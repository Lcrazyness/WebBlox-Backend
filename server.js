"use strict";

const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const ROBLOX_GAMES =
    "https://games.roblox.com";

const ROBLOX_THUMBNAILS =
    "https://thumbnails.roblox.com";

const ROBLOX_USERS =
    "https://users.roblox.com";

/* =========================================================
   EXPRESS
   ========================================================= */

app.use(express.json());

/*
   Manual CORS.
   This means we DO NOT need the "cors" npm package.
*/

app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin) {
        res.setHeader(
            "Access-Control-Allow-Origin",
            origin
        );
    } else {
        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );
    }

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );

    res.setHeader(
        "Access-Control-Max-Age",
        "86400"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

/* =========================================================
   HELPERS
   ========================================================= */

async function robloxFetch(url) {
    console.log("[Roblox API]", url);

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Roblox HTTP ${response.status}: ${text.substring(0, 300)}`
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

/*
   Safely turn ANY Roblox value into a string.

   This prevents malformed Unicode from causing:
   URIError: URI malformed
*/

function safeString(value, fallback = "") {
    try {
        return String(value ?? fallback)
            .replace(
                /[\uD800-\uDFFF]/g,
                ""
            );
    } catch {
        return fallback;
    }
}

function safeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
}

/* =========================================================
   THUMBNAILS
   ========================================================= */

async function getThumbnails(universeIds) {
    const ids = universeIds
        .map(id => Number(id))
        .filter(Number.isFinite);

    if (!ids.length) {
        return {};
    }

    const uniqueIds = [
        ...new Set(ids)
    ];

    const chunks = [];

    for (
        let i = 0;
        i < uniqueIds.length;
        i += 50
    ) {
        chunks.push(
            uniqueIds.slice(i, i + 50)
        );
    }

    const output = {};

    for (const chunk of chunks) {
        try {
            const url =
                ROBLOX_THUMBNAILS +
                "/v1/games/multiget/thumbnails" +
                "?universeIds=" +
                chunk.join(",") +
                "&countPerUniverse=1" +
                "&defaults=true" +
                "&size=768x432" +
                "&format=Png";

            const data =
                await robloxFetch(url);

            for (const item of data.data || []) {
                const universeId =
                    Number(item.universeId);

                if (!Number.isFinite(universeId)) {
                    continue;
                }

                output[universeId] =
                    item.imageUrl || null;
            }
        } catch (error) {
            console.error(
                "[Thumbnails] Failed:",
                error.message
            );
        }
    }

    return output;
}

/* =========================================================
   CREATOR LOOKUP
   ========================================================= */

async function getCreators(games) {
    const userIds = games
        .map(game =>
            Number(game.creatorId)
        )
        .filter(Number.isFinite);

    const uniqueIds = [
        ...new Set(userIds)
    ];

    if (!uniqueIds.length) {
        return {};
    }

    const creators = {};

    /*
       Roblox user lookup is limited,
       so do small batches.
    */

    for (
        let i = 0;
        i < uniqueIds.length;
        i += 50
    ) {
        const chunk =
            uniqueIds.slice(i, i + 50);

        try {
            const url =
                ROBLOX_USERS +
                "/v1/users" +
                "?userIds=" +
                chunk.join(",");

            const data =
                await robloxFetch(url);

            for (const user of data.data || []) {
                creators[user.id] = {
                    name: safeString(
                        user.displayName ||
                        user.name,
                        "Unknown Creator"
                    ),

                    username: safeString(
                        user.name,
                        ""
                    ),

                    id: user.id
                };
            }
        } catch (error) {
            console.error(
                "[Creators] Failed:",
                error.message
            );
        }
    }

    return creators;
}

/* =========================================================
   NORMALIZE GAMES
   ========================================================= */

async function normalizeGames(games) {
    if (!Array.isArray(games)) {
        return [];
    }

    const cleanGames =
        games
            .filter(Boolean)
            .map(game => ({
                universeId:
                    safeNumber(
                        game.id ||
                        game.universeId
                    ),

                placeId:
                    safeNumber(
                        game.rootPlaceId ||
                        game.placeId
                    ),

                name:
                    safeString(
                        game.name,
                        "Roblox Experience"
                    ),

                description:
                    safeString(
                        game.description,
                        ""
                    ),

                creatorId:
                    safeNumber(
                        game.creator?.id ||
                        game.creatorId
                    ),

                creator:
                    safeString(
                        game.creator?.name ||
                        game.creator?.creatorName ||
                        game.creatorName,
                        "Unknown Creator"
                    ),

                playing:
                    safeNumber(
                        game.playing
                    ),

                visits:
                    safeNumber(
                        game.visits
                    ),

                favorites:
                    safeNumber(
                        game.favoritedCount ||
                        game.favoritesCount ||
                        game.favorites
                    ),

                genre:
                    safeString(
                        game.genre,
                        ""
                    ),

                updated:
                    game.updated || null
            }))
            .filter(game =>
                game.universeId > 0
            );

    const thumbnailMap =
        await getThumbnails(
            cleanGames.map(
                game => game.universeId
            )
        );

    const creatorMap =
        await getCreators(
            cleanGames
        );

    return cleanGames.map(game => {
        const creator =
            creatorMap[game.creatorId];

        return {
            ...game,

            creator:
                creator?.name ||
                game.creator ||
                "Unknown Creator",

            creatorUsername:
                creator?.username ||
                "",

            creatorId:
                game.creatorId,

            thumbnail:
                thumbnailMap[
                    game.universeId
                ] || null,

            robloxUrl:
                game.placeId
                    ? `https://www.roblox.com/games/${game.placeId}`
                    : (
                        game.universeId
                            ? `https://www.roblox.com/games/?universeId=${game.universeId}`
                            : null
                    )
        };
    });
}

/* =========================================================
   POPULAR EXPERIENCES
   =========================================================

   IMPORTANT:

   This endpoint is intentionally NOT generating random
   universe IDs.

   We ask Roblox for game data and then rank returned
   experiences by live player count.

*/

async function getPopularGames() {
    /*
       Roblox's public games endpoint can return game
       information. We request a larger pool and rank it
       ourselves by current playing count.

       This is much safer than inventing IDs.
    */

    const urls = [
        ROBLOX_GAMES +
        "/v1/games" +
        "?sortOrder=Desc" +
        "&limit=100",

        ROBLOX_GAMES +
        "/v1/games" +
        "?sortOrder=Desc" +
        "&limit=50"
    ];

    let data = null;

    for (const url of urls) {
        try {
            data =
                await robloxFetch(url);

            if (
                data &&
                Array.isArray(data.data)
            ) {
                break;
            }
        } catch (error) {
            console.error(
                "[Popular] Request failed:",
                error.message
            );
        }
    }

    if (
        !data ||
        !Array.isArray(data.data)
    ) {
        throw new Error(
            "Roblox did not return a popular game list."
        );
    }

    const games =
        await normalizeGames(
            data.data
        );

    /*
       Sort by LIVE player count.

       This prevents low-player random experiences
       from appearing ahead of actually popular games.
    */

    games.sort(
        (a, b) =>
            b.playing - a.playing
    );

    return games.slice(0, 24);
}

/* =========================================================
   TRENDING
   =========================================================

   Trending is based on current player activity relative
   to total visits. It is intentionally different from
   simply copying the Popular list.
*/

async function getTrendingGames() {
    const popular =
        await getPopularGames();

    const trending =
        [...popular].sort((a, b) => {

            /*
               Activity score.

               Current players are weighted heavily.
               Visits provide a small normalization factor.
            */

            const aScore =
                a.playing * 100 +
                Math.log10(
                    Math.max(
                        1,
                        a.visits
                    )
                );

            const bScore =
                b.playing * 100 +
                Math.log10(
                    Math.max(
                        1,
                        b.visits
                    )
                );

            return bScore - aScore;
        });

    return trending.slice(0, 24);
}

/* =========================================================
   SEARCH
   ========================================================= */

async function searchRoblox(query) {
    const keyword =
        safeString(query).trim();

    if (!keyword) {
        return [];
    }

    const url =
        ROBLOX_GAMES +
        "/v1/games" +
        "?keyword=" +
        encodeURIComponent(keyword) +
        "&sortOrder=Desc" +
        "&limit=50";

    const data =
        await robloxFetch(url);

    const games =
        await normalizeGames(
            data.data || []
        );

    /*
       Search results are sorted by live players.
       This makes the most active matching games appear first.
    */

    games.sort(
        (a, b) =>
            b.playing - a.playing
    );

    return games;
}

/* =========================================================
   HOME
   ========================================================= */

app.get("/api/home", async (req, res) => {
    try {
        console.log(
            "[WebBlox] Loading home..."
        );

        const popular =
            await getPopularGames();

        /*
           Recommended currently uses the strongest
           popular experiences rather than random games.
           We can build the personalized recommendation
           system later.
        */

        const recommended =
            [...popular]
                .sort(
                    (a, b) =>
                        b.playing - a.playing
                )
                .slice(0, 12);

        const trending =
            [...popular]
                .sort(
                    (a, b) =>
                        b.playing - a.playing
                )
                .slice(0, 12);

        res.json({
            success: true,

            recommended,

            popular,

            trending
        });

    } catch (error) {
        console.error(
            "[WebBlox] Home error:",
            error
        );

        res.status(500).json({
            success: false,
            error:
                error.message ||
                "Unable to load Roblox experiences."
        });
    }
});

/* =========================================================
   POPULAR
   ========================================================= */

app.get(
    "/api/popular",
    async (req, res) => {
        try {
            const games =
                await getPopularGames();

            res.json({
                success: true,
                games
            });

        } catch (error) {
            console.error(
                "[WebBlox] Popular error:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to load popular Roblox experiences."
            });
        }
    }
);

/* =========================================================
   TRENDING
   ========================================================= */

app.get(
    "/api/trending",
    async (req, res) => {
        try {
            const games =
                await getTrendingGames();

            res.json({
                success: true,
                games
            });

        } catch (error) {
            console.error(
                "[WebBlox] Trending error:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to load trending Roblox experiences."
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
                safeString(
                    req.query.q
                ).trim();

            if (!query) {
                return res.json({
                    success: true,
                    games: []
                });
            }

            console.log(
                "[WebBlox] Search:",
                query
            );

            const games =
                await searchRoblox(
                    query
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
                error:
                    error.message ||
                    "Roblox search failed."
            });
        }
    }
);

/* =========================================================
   SINGLE GAME
   ========================================================= */

app.get(
    "/api/game/:universeId",
    async (req, res) => {
        try {
            const universeId =
                Number(
                    req.params.universeId
                );

            if (
                !Number.isFinite(
                    universeId
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid universe ID."
                });
            }

            const url =
                ROBLOX_GAMES +
                "/v1/games" +
                "?universeIds=" +
                universeId;

            const data =
                await robloxFetch(url);

            const games =
                await normalizeGames(
                    data.data || []
                );

            if (!games.length) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Roblox experience not found."
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
                error:
                    error.message ||
                    "Unable to load game."
            });
        }
    }
);

/* =========================================================
   HEALTH
   ========================================================= */

app.get(
    "/",
    (req, res) => {
        res.json({
            success: true,
            service: "WebBlox Backend",
            status: "online"
        });
    }
);

app.get(
    "/health",
    (req, res) => {
        res.json({
            success: true,
            status: "online"
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
            "===================================="
        );

        console.log(
            "[WebBlox] Backend started"
        );

        console.log(
            "[WebBlox] Port:",
            PORT
        );

        console.log(
            "[WebBlox] API:"
        );

        console.log(
            `http://localhost:${PORT}/api/home`
        );

        console.log(
            "===================================="
        );
    }
);
