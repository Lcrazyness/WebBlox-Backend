```js
"use strict";

const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =========================================================
   CONFIG
========================================================= */

const ROBLOX = {
    explore: "https://apis.roblox.com/explore-api/v1",
    search: "https://apis.roblox.com/search-api",
    games: "https://games.roblox.com/v1",
    thumbnails: "https://thumbnails.roblox.com/v1"
};

const USER_AGENT = "WebBlox/1.0";

/* =========================================================
   HELPERS
========================================================= */

function sessionId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return [
        Date.now().toString(16),
        Math.random().toString(16).slice(2),
        Math.random().toString(16).slice(2)
    ].join("-");
}

async function robloxFetch(url) {
    console.log("[WebBlox] Roblox:", url);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json",
            "User-Agent": USER_AGENT
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Roblox HTTP ${response.status}: ${text.slice(0, 500)}`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error("Roblox returned invalid JSON.");
    }
}

/* =========================================================
   GAME NORMALIZER
========================================================= */

function normalizeGame(game) {
    if (!game) return null;

    const universeId =
        Number(
            game.universeId ??
            game.id ??
            game.rootPlaceId ??
            game.placeId ??
            0
        );

    const placeId =
        Number(
            game.placeId ??
            game.rootPlaceId ??
            0
        );

    const name =
        game.name ||
        game.displayName ||
        game.title ||
        "Roblox Experience";

    const description =
        game.description ||
        "";

    const creator =
        game.creator?.name ||
        game.creatorName ||
        game.creator?.displayName ||
        game.creator ||
        "Roblox Creator";

    const creatorId =
        Number(
            game.creator?.id ||
            game.creatorId ||
            0
        );

    const playing =
        Number(
            game.playing ??
            game.playerCount ??
            game.concurrentPlayers ??
            0
        );

    const visits =
        Number(
            game.visits ??
            game.placeVisits ??
            0
        );

    const favorites =
        Number(
            game.favoritedCount ??
            game.favorites ??
            game.favoriteCount ??
            0
        );

    const maxPlayers =
        Number(
            game.maxPlayers ??
            game.maxPlayersPerServer ??
            0
        );

    const thumbnail =
        game.thumbnail ||
        game.thumbnailUrl ||
        game.imageUrl ||
        game.icon ||
        "";

    const icon =
        game.icon ||
        game.iconUrl ||
        thumbnail ||
        "";

    if (!universeId && !placeId) {
        return null;
    }

    return {
        id: universeId || placeId,
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
                : "https://www.roblox.com/discover",
        genre:
            game.genre ||
            game.genreName ||
            "All",
        updated:
            game.updated ||
            game.updatedUtc ||
            null
    };
}

/* =========================================================
   FILTER BAD / DEFAULT EXPERIENCES
========================================================= */

function isRealExperience(game) {
    if (!game) return false;

    const name = String(game.name || "").toLowerCase();
    const description = String(
        game.description || ""
    ).toLowerCase();

    /*
       Remove obvious automatically-created empty
       starter experiences.

       We do NOT require a game to have players.
       Small legitimate games can still appear.
    */

    const starterPatterns = [
        "this is your very first roblox creation",
        "this is your first creation on roblox",
        "esta es tu primera creación de roblox",
        "esta é a sua primeira criação na roblox",
        "هذا هو أول تصميم لك على roblox",
        "your very first creation"
    ];

    if (
        starterPatterns.some(
            pattern =>
                description.includes(pattern)
        )
    ) {
        return false;
    }

    /*
       Filter obvious placeholder names.
    */

    if (
        /^place$/.test(name) ||
        /^my place$/.test(name) ||
        /^untitled$/i.test(name)
    ) {
        return false;
    }

    return true;
}

/* =========================================================
   GET DETAILS + THUMBNAILS
========================================================= */

async function enrichGames(games) {
    const clean = games
        .map(normalizeGame)
        .filter(Boolean);

    if (!clean.length) {
        return [];
    }

    /*
       Roblox's thumbnail API supports batches,
       so never send hundreds of IDs at once.
    */

    const batches = [];

    for (let i = 0; i < clean.length; i += 50) {
        batches.push(
            clean.slice(i, i + 50)
        );
    }

    for (const batch of batches) {
        const universeIds = batch
            .map(game => game.universeId)
            .filter(id => id > 0);

        if (!universeIds.length) {
            continue;
        }

        try {
            const url =
                `${ROBLOX.thumbnails}/games/multiget/thumbnails` +
                `?universeIds=${universeIds.join(",")}` +
                `&countPerUniverse=1` +
                `&defaults=true` +
                `&size=768x432`;

            const data =
                await robloxFetch(url);

            const rows =
                Array.isArray(data.data)
                    ? data.data
                    : [];

            for (const row of rows) {
                const game =
                    batch.find(
                        item =>
                            Number(item.universeId) ===
                            Number(row.universeId)
                    );

                if (!game) continue;

                const image =
                    row.thumbnails?.[0]?.imageUrl ||
                    row.imageUrl ||
                    "";

                if (image) {
                    game.thumbnail = image;
                }
            }
        } catch (error) {
            console.warn(
                "[WebBlox] Thumbnail batch failed:",
                error.message
            );
        }
    }

    /*
       Icons are fetched separately because thumbnails
       and icons are different Roblox resources.
    */

    for (const batch of batches) {
        const universeIds = batch
            .map(game => game.universeId)
            .filter(id => id > 0);

        if (!universeIds.length) {
            continue;
        }

        try {
            const url =
                `${ROBLOX.thumbnails}/games/icons` +
                `?universeIds=${universeIds.join(",")}` +
                `&size=420x420` +
                `&format=Png` +
                `&isCircular=false`;

            const data =
                await robloxFetch(url);

            const rows =
                Array.isArray(data.data)
                    ? data.data
                    : [];

            for (const row of rows) {
                const game =
                    batch.find(
                        item =>
                            Number(item.universeId) ===
                            Number(row.targetId)
                    );

                if (!game) continue;

                const image =
                    row.imageUrl ||
                    "";

                if (image) {
                    game.icon = image;
                }
            }
        } catch (error) {
            console.warn(
                "[WebBlox] Icon batch failed:",
                error.message
            );
        }
    }

    return clean;
}

/* =========================================================
   EXPLORE API
========================================================= */

async function getExploreSorts() {
    const id = sessionId();

    const url =
        `${ROBLOX.explore}/get-sorts` +
        `?sessionId=${encodeURIComponent(id)}` +
        `&device=computer` +
        `&country=all`;

    return robloxFetch(url);
}

async function getSortContent(sortId) {
    const id = sessionId();

    const url =
        `${ROBLOX.explore}/get-sort-content` +
        `?sessionId=${encodeURIComponent(id)}` +
        `&sortId=${encodeURIComponent(sortId)}`;

    return robloxFetch(url);
}

/* =========================================================
   EXTRACT GAMES FROM EXPLORE RESPONSE
========================================================= */

function extractGames(value, output = []) {
    if (!value) {
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            extractGames(item, output);
        }

        return output;
    }

    if (typeof value !== "object") {
        return output;
    }

    /*
       A game-like object.
    */

    if (
        value.universeId ||
        value.placeId ||
        value.rootPlaceId
    ) {
        const game =
            normalizeGame(value);

        if (game) {
            output.push(game);
        }
    }

    for (const key of Object.keys(value)) {
        const child = value[key];

        if (
            child &&
            typeof child === "object"
        ) {
            extractGames(
                child,
                output
            );
        }
    }

    return output;
}

/* =========================================================
   POPULAR / DISCOVER
========================================================= */

async function getPopularGames() {
    try {
        const sorts =
            await getExploreSorts();

        console.log(
            "[WebBlox] Explore sorts loaded."
        );

        const sortList =
            sorts.sorts ||
            sorts.data ||
            sorts.items ||
            [];

        /*
           Prefer sorts whose names indicate
           popular/trending/top activity.
        */

        const preferred =
            sortList.find(sort => {
                const text =
                    `${sort.name || ""} ${sort.title || ""} ${sort.sortId || ""}`
                        .toLowerCase();

                return (
                    text.includes("popular") ||
                    text.includes("trending") ||
                    text.includes("top")
                );
            });

        const selected =
            preferred ||
            sortList[0];

        if (!selected) {
            throw new Error(
                "Roblox returned no discovery sorts."
            );
        }

        const sortId =
            selected.sortId ||
            selected.id ||
            selected.sortToken;

        if (!sortId) {
            throw new Error(
                "Roblox returned a discovery sort without an ID."
            );
        }

        console.log(
            "[WebBlox] Using sort:",
            sortId
        );

        const content =
            await getSortContent(
                sortId
            );

        let games =
            extractGames(
                content
            );

        games =
            games.filter(
                isRealExperience
            );

        /*
           Remove duplicates.
        */

        const seen =
            new Set();

        games =
            games.filter(game => {
                const key =
                    game.universeId ||
                    game.placeId;

                if (seen.has(key)) {
                    return false;
                }

                seen.add(key);

                return true;
            });

        /*
           The explore API can contain many nested
           recommendation objects. Limit before
           thumbnail enrichment.
        */

        games =
            games.slice(0, 24);

        return enrichGames(
            games
        );
    } catch (error) {
        console.error(
            "[WebBlox] Popular error:",
            error
        );

        return [];
    }
}

/* =========================================================
   SEARCH API
========================================================= */

async function searchRoblox(query) {
    const id =
        sessionId();

    const url =
        `${ROBLOX.search}/omni-search` +
        `?searchQuery=${encodeURIComponent(query)}` +
        `&sessionId=${encodeURIComponent(id)}` +
        `&pageType=all`;

    const data =
        await robloxFetch(url);

    let games =
        extractGames(
            data
        );

    games =
        games.filter(
            isRealExperience
        );

    const seen =
        new Set();

    games =
        games.filter(game => {
            const key =
                game.universeId ||
                game.placeId;

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);

            return true;
        });

    return enrichGames(
        games.slice(0, 24)
    );
}

/* =========================================================
   HOME
========================================================= */

app.get(
    "/api/home",
    async (req, res) => {
        try {
            const popular =
                await getPopularGames();

            /*
               Recommended currently uses the real
               Roblox discovery results as a fallback.

               Personalized recommendations require a
               Roblox player identity/authentication.
            */

            const recommended =
                popular.slice(
                    0,
                    12
                );

            res.json({
                success: true,
                recommended,
                popular
            });
        } catch (error) {
            console.error(
                "[WebBlox] /api/home:",
                error
            );

            res.status(500).json({
                success: false,
                error: error.message
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

            res.json({
                success: true,
                games
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
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
        const query =
            String(
                req.query.q ||
                ""
            ).trim();

        if (!query) {
            return res.json({
                success: true,
                games: []
            });
        }

        try {
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
                "[WebBlox] Search:",
                error
            );

            res.status(500).json({
                success: false,
                error: error.message
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
        const universeId =
            Number(
                req.params.universeId
            );

        if (
            !Number.isInteger(universeId) ||
            universeId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid universe ID."
            });
        }

        try {
            const data =
                await robloxFetch(
                    `${ROBLOX.games}?universeIds=${universeId}`
                );

            const raw =
                Array.isArray(data.data)
                    ? data.data[0]
                    : null;

            if (!raw) {
                return res.status(404).json({
                    success: false,
                    error: "Roblox experience not found."
                });
            }

            const games =
                await enrichGames([
                    normalizeGame(raw)
                ]);

            res.json({
                success: true,
                game:
                    games[0] || null
            });
        } catch (error) {
            console.error(
                "[WebBlox] Game:",
                error
            );

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            success: true,
            service: "WebBlox Backend",
            roblox: true,
            time: new Date().toISOString()
        });
    }
);

/* =========================================================
   START
========================================================= */

app.listen(
    PORT,
    () => {
        console.log(
            `WebBlox backend running on port ${PORT}`
        );
    }
);
```
