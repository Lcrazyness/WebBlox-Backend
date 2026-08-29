"use strict";

const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

/* ============================================================
   WEBBLOX BACKEND
   ============================================================ */

const ROBLOX_GAMES = "https://games.roblox.com";
const ROBLOX_THUMBNAILS = "https://thumbnails.roblox.com";
const ROBLOX_SEARCH = "https://apis.roblox.com/search-api/omni-search";

/* ============================================================
   CORS
   ============================================================ */

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Accept");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.use(express.json());

/* ============================================================
   HELPERS
   ============================================================ */

async function fetchJSON(url, timeout = 15000) {
    console.log("[WebBlox] Roblox request:", url);

    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, timeout);

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "WebBlox/1.0"
            },
            signal: controller.signal
        });

        const text = await response.text();

        if (!response.ok) {
            throw new Error(
                `Roblox HTTP ${response.status}: ${text.slice(0, 500)}`
            );
        }

        if (!text) {
            throw new Error("Roblox returned an empty response.");
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new Error(
                "Roblox returned invalid JSON."
            );
        }

    } finally {
        clearTimeout(timer);
    }
}


/* ============================================================
   NUMBER HELPERS
   ============================================================ */

function uniqueNumbers(values) {
    return [
        ...new Set(
            values
                .map(Number)
                .filter(Number.isFinite)
                .filter(id => id > 0)
        )
    ];
}


/* ============================================================
   THUMBNAILS
   ============================================================ */

/*
   Roblox has limits on how many universe IDs can be sent
   in one thumbnail request.

   We deliberately keep this small to avoid the
   "Too many universe IDs were requested" error.
*/

async function getThumbnails(universeIds) {

    const ids = uniqueNumbers(universeIds);

    const result = new Map();

    const CHUNK_SIZE = 20;

    for (
        let i = 0;
        i < ids.length;
        i += CHUNK_SIZE
    ) {

        const chunk =
            ids.slice(
                i,
                i + CHUNK_SIZE
            );

        if (!chunk.length) {
            continue;
        }

        const url =
            ROBLOX_THUMBNAILS +
            "/v1/games/multiget/thumbnails" +
            "?universeIds=" +
            encodeURIComponent(
                chunk.join(",")
            ) +
            "&size=768x432" +
            "&format=Png" +
            "&isCircular=false";

        try {

            const data =
                await fetchJSON(url);

            if (
                data &&
                Array.isArray(data.data)
            ) {

                for (const item of data.data) {

                    if (
                        item &&
                        item.targetId
                    ) {

                        if (
                            item.state === "Completed" &&
                            item.imageUrl
                        ) {

                            result.set(
                                Number(item.targetId),
                                item.imageUrl
                            );

                        }

                    }

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


/* ============================================================
   GAME NORMALIZER
   ============================================================ */

function normalizeGame(game, thumbnailMap) {

    if (!game) {
        return null;
    }

    const universeId =
        Number(
            game.id ||
            game.universeId
        );

    const placeId =
        Number(
            game.rootPlaceId ||
            game.placeId
        );

    if (
        !universeId ||
        !placeId
    ) {
        return null;
    }

    const creator =
        game.creator || {};

    const creatorName =
        creator.name ||
        game.creatorName ||
        "Unknown Creator";

    const thumbnail =
        thumbnailMap.get(universeId) ||
        null;

    return {

        id: universeId,

        universeId: universeId,

        placeId: placeId,

        name:
            String(
                game.name ||
                "Untitled Roblox Experience"
            ).trim(),

        description:
            String(
                game.description ||
                ""
            ).trim(),

        creator:
            creatorName,

        creatorId:
            Number(
                creator.id ||
                game.creatorId ||
                0
            ),

        creatorType:
            creator.type ||
            "Unknown",

        playing:
            Number(
                game.playing || 0
            ),

        visits:
            Number(
                game.visits || 0
            ),

        favorites:
            Number(
                game.favoritedCount || 0
            ),

        maxPlayers:
            Number(
                game.maxPlayers || 0
            ),

        genre:
            game.genre ||
            "All",

        updated:
            game.updated ||
            null,

        created:
            game.created ||
            null,

        thumbnail:
            thumbnail,

        icon:
            null,

        robloxUrl:
            `https://www.roblox.com/games/${placeId}`
    };
}


/* ============================================================
   GET UNIVERSE DETAILS
   ============================================================ */

async function getUniverseDetails(universeIds) {

    const ids =
        uniqueNumbers(
            universeIds
        );

    if (!ids.length) {
        return [];
    }

    const games = [];

    /*
       Keep universe requests small too.
    */

    const CHUNK_SIZE = 25;

    for (
        let i = 0;
        i < ids.length;
        i += CHUNK_SIZE
    ) {

        const chunk =
            ids.slice(
                i,
                i + CHUNK_SIZE
            );

        const url =
            ROBLOX_GAMES +
            "/v1/games?universeIds=" +
            encodeURIComponent(
                chunk.join(",")
            );

        try {

            const data =
                await fetchJSON(url);

            if (
                data &&
                Array.isArray(data.data)
            ) {

                games.push(
                    ...data.data
                );

            }

        } catch (error) {

            console.error(
                "[WebBlox] Universe error:",
                error.message
            );

        }

    }

    return games;
}


/* ============================================================
   BUILD GAME LIST
   ============================================================ */

async function buildGames(rawGames) {

    if (
        !Array.isArray(rawGames) ||
        rawGames.length === 0
    ) {
        return [];
    }

    /*
       Remove duplicates.
    */

    const unique = new Map();

    for (const game of rawGames) {

        const id =
            Number(
                game.id ||
                game.universeId
            );

        if (id) {
            unique.set(
                id,
                game
            );
        }

    }

    const games =
        [...unique.values()];

    const universeIds =
        games.map(
            game =>
                Number(
                    game.id ||
                    game.universeId
                )
        );

    const thumbnails =
        await getThumbnails(
            universeIds
        );

    return games
        .map(
            game =>
                normalizeGame(
                    game,
                    thumbnails
                )
        )
        .filter(Boolean);
}


/* ============================================================
   POPULAR ROBLOX GAMES
   ============================================================ */

async function getPopularGames() {

    /*
       Roblox's games endpoint returns current
       experience information including player count.
    */

    const url =
        ROBLOX_GAMES +
        "/v1/games" +
        "?sortOrder=Desc" +
        "&limit=50";

    const data =
        await fetchJSON(url);

    const raw =
        Array.isArray(data.data)
            ? data.data
            : [];

    /*
       Sort locally by current players so the
       cards are actually "Popular Right Now".
    */

    raw.sort(
        (a, b) =>
            Number(b.playing || 0) -
            Number(a.playing || 0)
    );

    return buildGames(
        raw.slice(0, 20)
    );
}


/* ============================================================
   SEARCH ROBLOX
   ============================================================ */

async function searchRobloxGames(query) {

    const cleanQuery =
        String(query || "")
            .trim()
            .slice(0, 100);

    if (!cleanQuery) {
        return [];
    }

    const sessionId =
        `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

    const url =
        ROBLOX_SEARCH +
        "?searchQuery=" +
        encodeURIComponent(
            cleanQuery
        ) +
        "&pageToken=" +
        "&sessionId=" +
        encodeURIComponent(
            sessionId
        ) +
        "&pageType=all";

    const data =
        await fetchJSON(url);

    const results =
        Array.isArray(
            data.searchResults
        )
            ? data.searchResults
            : [];

    const rawGames = [];

    /*
       Roblox search returns groups such as
       Games, Users, etc.

       Only take actual game content.
    */

    for (const group of results) {

        const contents =
            Array.isArray(
                group.contents
            )
                ? group.contents
                : [];

        for (const item of contents) {

            /*
               Ignore users and unrelated results.
            */

            const universeId =
                Number(
                    item.universeId ||
                    item.universeID ||
                    item.id
                );

            const placeId =
                Number(
                    item.placeId ||
                    item.rootPlaceId
                );

            const name =
                item.name ||
                item.displayName;

            if (
                !universeId ||
                !placeId ||
                !name
            ) {
                continue;
            }

            rawGames.push({
                id: universeId,
                universeId: universeId,
                rootPlaceId: placeId,
                name: name,
                description:
                    item.description || "",
                creator:
                    item.creator || {
                        name:
                            item.creatorName ||
                            "Unknown Creator",
                        id:
                            item.creatorId || 0
                    },
                playing:
                    item.playing || 0,
                visits:
                    item.visits || 0
            });

        }
    }

    /*
       If search gives us universe IDs but incomplete
       metadata, fetch the real Roblox game data.
    */

    const ids =
        uniqueNumbers(
            rawGames.map(
                game =>
                    game.universeId
            )
        );

    if (!ids.length) {
        return [];
    }

    const detailed =
        await getUniverseDetails(
            ids.slice(0, 25)
        );

    if (detailed.length) {

        return buildGames(
            detailed
        );

    }

    return buildGames(
        rawGames.slice(0, 20)
    );
}


/* ============================================================
   HOME
   ============================================================ */

app.get(
    "/api/home",
    async (req, res) => {

        try {

            console.log(
                "[WebBlox] Loading home..."
            );

            const popular =
                await getPopularGames();

            /*
               Recommended currently uses a different
               ordering of the real Roblox games instead
               of inventing games.

               Later we can connect this to actual
               personalized recommendations.
            */

            const recommended =
                [...popular]
                    .sort(
                        (a, b) =>
                            Number(b.visits || 0) -
                            Number(a.visits || 0)
                    )
                    .slice(0, 12);

            res.json({
                success: true,

                recommended:
                    recommended,

                popular:
                    popular.slice(0, 20)
            });

        } catch (error) {

            console.error(
                "[WebBlox] HOME ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Failed to load Roblox games."
            });

        }

    }
);


/* ============================================================
   POPULAR
   ============================================================ */

app.get(
    "/api/popular",
    async (req, res) => {

        try {

            const games =
                await getPopularGames();

            res.json({
                success: true,
                games: games
            });

        } catch (error) {

            console.error(
                "[WebBlox] POPULAR ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Failed to load popular games."
            });

        }

    }
);


/* ============================================================
   SEARCH
   ============================================================ */

app.get(
    "/api/search",
    async (req, res) => {

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
                "[WebBlox] Searching Roblox:",
                query
            );

            const games =
                await searchRobloxGames(
                    query
                );

            res.json({
                success: true,
                query: query,
                games: games
            });

        } catch (error) {

            console.error(
                "[WebBlox] SEARCH ERROR:",
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


/* ============================================================
   SINGLE GAME
   ============================================================ */

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
                ) ||
                universeId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid universe ID."
                });

            }

            const games =
                await getUniverseDetails([
                    universeId
                ]);

            if (!games.length) {

                return res.status(404).json({
                    success: false,
                    error:
                        "Roblox experience not found."
                });

            }

            const thumbnails =
                await getThumbnails([
                    universeId
                ]);

            const game =
                normalizeGame(
                    games[0],
                    thumbnails
                );

            res.json({
                success: true,
                game: game
            });

        } catch (error) {

            console.error(
                "[WebBlox] GAME ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Failed to load game."
            });

        }

    }
);


/* ============================================================
   HEALTH CHECK
   ============================================================ */

app.get(
    "/",
    (req, res) => {

        res.json({
            success: true,
            name: "WebBlox Backend",
            status: "online",
            version: "4.0.0"
        });

    }
);


app.get(
    "/api/health",
    (req, res) => {

        res.json({
            success: true,
            status: "online"
        });

    }
);


/* ============================================================
   START
   ============================================================ */

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
            "[WebBlox] Roblox games API:",
            ROBLOX_GAMES
        );

        console.log(
            "[WebBlox] Roblox thumbnails API:",
            ROBLOX_THUMBNAILS
        );

        console.log(
            "===================================="
        );

    }
);
