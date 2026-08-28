"use strict";

const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const FRONTEND_ORIGIN = "https://lcrazyness.github.io";

const ROBLOX_GAMES = "https://games.roblox.com";
const ROBLOX_THUMBNAILS = "https://thumbnails.roblox.com";
const ROBLOX_APIS = "https://apis.roblox.com";

app.disable("x-powered-by");

/* ============================================================
   CORS
   No cors npm package required.
   ============================================================ */

app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (
        !origin ||
        origin === FRONTEND_ORIGIN ||
        origin === "http://localhost:3000" ||
        origin === "http://localhost:5500"
    ) {
        res.setHeader(
            "Access-Control-Allow-Origin",
            origin || "*"
        );
    } else {
        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );
    }

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
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

app.use(express.json());

/* ============================================================
   HELPERS
   ============================================================ */

function sessionId() {
    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

async function robloxJSON(url) {
    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
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
        throw new Error(
            "Roblox returned invalid JSON."
        );
    }
}

function chunks(array, size) {
    const result = [];

    for (
        let i = 0;
        i < array.length;
        i += size
    ) {
        result.push(
            array.slice(i, i + size)
        );
    }

    return result;
}

/* ============================================================
   THUMBNAILS
   Roblox currently limits these requests, so batch them.
   ============================================================ */

async function getThumbnails(universeIds) {
    const ids = [
        ...new Set(
            universeIds
                .map(Number)
                .filter(Boolean)
        )
    ];

    const output = {};

    for (const batch of chunks(ids, 10)) {
        try {
            const url =
                ROBLOX_THUMBNAILS +
                "/v1/games/icons" +
                "?universeIds=" +
                batch.join(",") +
                "&size=512x512" +
                "&format=Webp" +
                "&isCircular=false" +
                "&returnPolicy=PlaceHolder";

            const data =
                await robloxJSON(url);

            for (const item of data.data || []) {
                if (
                    item.targetId &&
                    item.imageUrl
                ) {
                    output[
                        String(item.targetId)
                    ] = item.imageUrl;
                }
            }
        } catch (error) {
            console.error(
                "[WebBlox] Thumbnail batch failed:",
                error.message
            );
        }
    }

    return output;
}

/* ============================================================
   GAME DETAILS
   ============================================================ */

async function getGameDetails(universeIds) {
    const ids = [
        ...new Set(
            universeIds
                .map(Number)
                .filter(Boolean)
        )
    ];

    const games = [];

    for (const batch of chunks(ids, 10)) {
        try {
            const url =
                ROBLOX_GAMES +
                "/v1/games?universeIds=" +
                batch.join(",");

            const data =
                await robloxJSON(url);

            if (Array.isArray(data.data)) {
                games.push(...data.data);
            }
        } catch (error) {
            console.error(
                "[WebBlox] Game details failed:",
                error.message
            );
        }
    }

    return games;
}

/* ============================================================
   NORMALIZE GAME
   This makes sure creator/title/place IDs are REAL.
   ============================================================ */

function normalizeGame(game, thumbnailMap = {}) {
    if (!game) {
        return null;
    }

    const universeId =
        Number(
            game.universeId ??
            game.id ??
            game.universeID
        ) || 0;

    const placeId =
        Number(
            game.rootPlaceId ??
            game.placeId ??
            game.rootPlaceID
        ) || 0;

    const creatorObject =
        game.creator &&
        typeof game.creator === "object"
            ? game.creator
            : null;

    const creator =
        game.creatorName ||
        game.creatorDisplayName ||
        creatorObject?.name ||
        creatorObject?.displayName ||
        "";

    const creatorId =
        Number(
            game.creatorId ||
            creatorObject?.id ||
            0
        ) || 0;

    const name =
        typeof game.name === "string"
            ? game.name.trim()
            : "";

    /*
     * Do NOT allow random records through.
     */

    if (
        !name ||
        name === "Unknown Roblox Experience" ||
        !universeId ||
        !placeId
    ) {
        return null;
    }

    return {
        id: universeId,

        universeId,

        placeId,

        name,

        description:
            game.description || "",

        creator:
            creator ||
            "Roblox Creator",

        creatorId,

        playing:
            Number(
                game.playing ??
                game.playerCount ??
                0
            ) || 0,

        visits:
            Number(
                game.visits ??
                0
            ) || 0,

        favorites:
            Number(
                game.favoritedCount ??
                game.favorites ??
                0
            ) || 0,

        maxPlayers:
            Number(
                game.maxPlayers ??
                0
            ) || 0,

        thumbnail:
            thumbnailMap[
                String(universeId)
            ] || "",

        icon:
            thumbnailMap[
                String(universeId)
            ] || "",

        robloxUrl:
            `https://www.roblox.com/games/${placeId}`,

        genre:
            game.genre ||
            game.genreL1 ||
            "",

        updated:
            game.updated ||
            ""
    };
}

/* ============================================================
   DISCOVER / CHARTS
   ============================================================ */

async function getPopularUniverseIds() {
    const sid = sessionId();

    const sortsUrl =
        ROBLOX_APIS +
        "/explore-api/v1/get-sorts" +
        "?sessionId=" +
        encodeURIComponent(sid) +
        "&device=computer" +
        "&country=all";

    const sorts =
        await robloxJSON(sortsUrl);

    let sortId =
        "top-playing-now";

    /*
     * Prefer top-playing-now.
     */

    const sortList =
        Array.isArray(sorts)
            ? sorts
            : (
                sorts.sorts ||
                sorts.data ||
                []
            );

    for (const sort of sortList) {
        const id =
            sort.sortId ||
            sort.id;

        if (
            id === "top-playing-now"
        ) {
            sortId = id;
            break;
        }
    }

    const contentUrl =
        ROBLOX_APIS +
        "/explore-api/v1/get-sort-content" +
        "?sessionId=" +
        encodeURIComponent(sid) +
        "&sortId=" +
        encodeURIComponent(sortId) +
        "&device=computer" +
        "&country=all";

    const content =
        await robloxJSON(contentUrl);

    const ids = [];

    function scan(value) {
        if (!value) {
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                scan(item);
            }

            return;
        }

        if (
            typeof value !== "object"
        ) {
            return;
        }

        if (
            value.universeId &&
            Number(value.universeId)
        ) {
            ids.push(
                Number(value.universeId)
            );
        }

        if (
            value.rootPlaceId &&
            value.universeId
        ) {
            ids.push(
                Number(value.universeId)
            );
        }

        for (
            const key of Object.keys(value)
        ) {
            scan(value[key]);
        }
    }

    scan(content);

    return [
        ...new Set(ids)
    ].slice(0, 50);
}

/* ============================================================
   HOME
   ============================================================ */

let homeCache = null;
let homeCacheTime = 0;

async function buildHome() {
    const now = Date.now();

    if (
        homeCache &&
        now - homeCacheTime < 60_000
    ) {
        return homeCache;
    }

    let universeIds = [];

    try {
        universeIds =
            await getPopularUniverseIds();
    } catch (error) {
        console.error(
            "[WebBlox] Discover API failed:",
            error.message
        );
    }

    /*
     * These are REAL Roblox experiences.
     * They are only a safety fallback if Roblox's
     * discovery endpoint temporarily fails.
     */

    if (universeIds.length === 0) {
        universeIds = [
            383310974,
            2753915549,
            1962086868,
            6284583030,
            920587237,
            4924922222,
            537413528,
            6516141723,
            17625359962,
            8737602449,
            142823291,
            189707,
            606849621,
            286090429,
            109983668079237
        ];
    }

    const details =
        await getGameDetails(
            universeIds
        );

    const thumbnails =
        await getThumbnails(
            details.map(
                game =>
                    game.id
            )
        );

    const games =
        details
            .map(game =>
                normalizeGame(
                    game,
                    thumbnails
                )
            )
            .filter(Boolean);

    /*
     * Sort by actual current players.
     */

    games.sort(
        (a, b) =>
            b.playing -
            a.playing
    );

    const result = {
        success: true,

        recommended:
            games.slice(0, 20),

        popular:
            games.slice(0, 50)
    };

    homeCache = result;
    homeCacheTime = now;

    return result;
}

/* ============================================================
   HOME ROUTE
   ============================================================ */

app.get(
    "/api/home",
    async (req, res) => {
        try {
            const result =
                await buildHome();

            res.json(result);
        } catch (error) {
            console.error(
                "[WebBlox] /api/home:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Could not load Roblox experiences.",
                details:
                    error.message
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
            const home =
                await buildHome();

            res.json({
                success: true,
                games:
                    home.popular || []
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error:
                    error.message
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

        try {
            const sid =
                sessionId();

            const url =
                ROBLOX_APIS +
                "/search-api/omni-search" +
                "?searchQuery=" +
                encodeURIComponent(query) +
                "&pageToken=" +
                "&sessionId=" +
                encodeURIComponent(sid) +
                "&pageType=all";

            const data =
                await robloxJSON(url);

            const candidates = [];

            function scan(value) {
                if (!value) {
                    return;
                }

                if (Array.isArray(value)) {
                    for (const item of value) {
                        scan(item);
                    }

                    return;
                }

                if (
                    typeof value !== "object"
                ) {
                    return;
                }

                /*
                 * Search results normally contain
                 * universeId/rootPlaceId.
                 */

                if (
                    (
                        value.universeId ||
                        value.rootPlaceId
                    ) &&
                    value.name
                ) {
                    candidates.push(value);
                }

                for (
                    const key of Object.keys(value)
                ) {
                    if (
                        key === "thumbnail" ||
                        key === "imageUrl"
                    ) {
                        continue;
                    }

                    scan(value[key]);
                }
            }

            scan(data);

            /*
             * Convert search records into IDs.
             */

            const ids = [
                ...new Set(
                    candidates
                        .map(item =>
                            Number(
                                item.universeId ||
                                item.id
                            )
                        )
                        .filter(Boolean)
                )
            ].slice(0, 50);

            if (ids.length === 0) {
                return res.json({
                    success: true,
                    games: []
                });
            }

            /*
             * Get authoritative details.
             * This fixes the creator/title problem.
             */

            const details =
                await getGameDetails(ids);

            const thumbnails =
                await getThumbnails(
                    details.map(
                        game =>
                            game.id
                    )
                );

            const games =
                details
                    .map(game =>
                        normalizeGame(
                            game,
                            thumbnails
                        )
                    )
                    .filter(Boolean);

            /*
             * Keep search relevance first when possible.
             */

            const lower =
                query.toLowerCase();

            games.sort(
                (a, b) => {
                    const aName =
                        a.name.toLowerCase();

                    const bName =
                        b.name.toLowerCase();

                    const aExact =
                        aName === lower
                            ? 0
                            : aName.startsWith(lower)
                                ? 1
                                : 2;

                    const bExact =
                        bName === lower
                            ? 0
                            : bName.startsWith(lower)
                                ? 1
                                : 2;

                    if (
                        aExact !==
                        bExact
                    ) {
                        return (
                            aExact -
                            bExact
                        );
                    }

                    return (
                        b.playing -
                        a.playing
                    );
                }
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
                    "Roblox search failed.",
                details:
                    error.message
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
        const universeId =
            Number(
                req.params.universeId
            );

        if (!universeId) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid universe ID."
            });
        }

        try {
            const details =
                await getGameDetails([
                    universeId
                ]);

            if (
                details.length === 0
            ) {
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
                    details[0],
                    thumbnails
                );

            if (!game) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Roblox experience information was incomplete."
                });
            }

            res.json({
                success: true,
                game
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

/* ============================================================
   HEALTH
   ============================================================ */

app.get(
    "/",
    (req, res) => {
        res.json({
            success: true,
            name: "WebBlox Backend",
            status: "online"
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
            "[WebBlox] Backend online"
        );

        console.log(
            "[WebBlox] Port:",
            PORT
        );

        console.log(
            "[WebBlox] CORS enabled"
        );

        console.log(
            "===================================="
        );
    }
);
