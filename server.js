const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =========================================
   CORS
========================================= */

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});


/* =========================================
   ROBLOX ENDPOINTS
========================================= */

const GAMES_API =
    "https://games.roblox.com";

const THUMBNAILS_API =
    "https://thumbnails.roblox.com";

const ROBLOX_SEARCH_API =
    "https://apis.roblox.com/search-api/omni-search";


/* =========================================
   FETCH ROBLOX
========================================= */

async function fetchJSON(url) {

    console.log("[Roblox]", url);

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Roblox returned HTTP ${response.status}`
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


/* =========================================
   GET GAME DETAILS
========================================= */

async function getGameDetails(universeIds) {

    const ids = universeIds
        .map(Number)
        .filter(id => Number.isSafeInteger(id))
        .slice(0, 50);

    if (!ids.length) {
        return [];
    }

    const url =
        `${GAMES_API}/v1/games?universeIds=${ids.join(",")}`;

    const data = await fetchJSON(url);

    return Array.isArray(data.data)
        ? data.data
        : [];
}


/* =========================================
   GET THUMBNAILS
========================================= */

async function getThumbnails(universeIds) {

    const ids = universeIds
        .map(Number)
        .filter(id => Number.isSafeInteger(id))
        .slice(0, 50);

    if (!ids.length) {
        return new Map();
    }

    const url =
        `${THUMBNAILS_API}/v1/games/multiget/thumbnails` +
        `?universeIds=${ids.join(",")}` +
        `&size=768x432` +
        `&format=Png` +
        `&isCircular=false`;

    const data = await fetchJSON(url);

    const map = new Map();

    for (const item of data.data || []) {

        map.set(
            String(item.targetId),
            item.imageUrl || null
        );
    }

    return map;
}


/* =========================================
   GET ICONS
========================================= */

async function getIcons(universeIds) {

    const ids = universeIds
        .map(Number)
        .filter(id => Number.isSafeInteger(id))
        .slice(0, 50);

    if (!ids.length) {
        return new Map();
    }

    const url =
        `${THUMBNAILS_API}/v1/games/icons` +
        `?universeIds=${ids.join(",")}` +
        `&size=420x420` +
        `&format=Png` +
        `&isCircular=false`;

    const data = await fetchJSON(url);

    const map = new Map();

    for (const item of data.data || []) {

        map.set(
            String(item.targetId),
            item.imageUrl || null
        );
    }

    return map;
}


/* =========================================
   FORMAT ROBLOX GAMES
========================================= */

async function formatGames(games) {

    if (!games.length) {
        return [];
    }

    const ids =
        games.map(game => Number(game.id));

    const [
        thumbnails,
        icons
    ] = await Promise.all([
        getThumbnails(ids),
        getIcons(ids)
    ]);

    return games.map(game => {

        const universeId =
            Number(game.id);

        return {

            universeId,

            placeId:
                game.rootPlaceId || null,

            name:
                game.name || "Unknown Experience",

            description:
                game.description || "",

            creator:
                game.creator?.name ||
                "Unknown Creator",

            creatorId:
                game.creator?.id ||
                null,

            playing:
                Number(game.playing) || 0,

            visits:
                Number(game.visits) || 0,

            favorites:
                Number(game.favoritedCount) || 0,

            thumbnail:
                thumbnails.get(
                    String(universeId)
                ) || null,

            icon:
                icons.get(
                    String(universeId)
                ) || null
        };
    });
}


/* =========================================
   DISCOVERY
========================================= */

async function getDiscoveryGames() {

    /*
     * Roblox's games/list endpoint is used
     * as a discovery source.
     *
     * No hardcoded/fake games are inserted.
     */

    const urls = [

        `${GAMES_API}/v1/games/list?model.startRows=0&model.maxRows=40`,

        `${GAMES_API}/v1/games/list?startRows=0&maxRows=40`

    ];

    for (const url of urls) {

        try {

            const data =
                await fetchJSON(url);

            if (
                Array.isArray(data.games) &&
                data.games.length
            ) {

                return data.games;
            }

        } catch (error) {

            console.log(
                "[Discovery fallback]",
                error.message
            );
        }
    }

    return [];
}


/* =========================================
   SEARCH ROBLOX
========================================= */

async function searchRoblox(query) {

    const cleanQuery =
        String(query || "").trim();

    if (!cleanQuery) {
        return [];
    }


    /*
     * Roblox's search API.
     */

    try {

        const sessionId =
            `webblox-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`;

        const url =
            `${ROBLOX_SEARCH_API}` +
            `?searchQuery=${encodeURIComponent(cleanQuery)}` +
            `&pageToken=` +
            `&sessionId=${encodeURIComponent(sessionId)}` +
            `&pageType=all`;

        const data =
            await fetchJSON(url);

        const results =
            Array.isArray(data.searchResults)
                ? data.searchResults
                : [];

        const games = [];

        for (const result of results) {

            const contents =
                Array.isArray(result.contents)
                    ? result.contents
                    : [];

            for (const item of contents) {

                /*
                 * Only accept results that
                 * actually look like Roblox
                 * experiences.
                 */

                const universeId =
                    Number(
                        item.universeId ||
                        item.id ||
                        item.rootPlaceId
                    );

                const placeId =
                    Number(
                        item.placeId ||
                        item.rootPlaceId
                    );

                if (
                    !Number.isSafeInteger(
                        universeId
                    )
                ) {
                    continue;
                }

                games.push({
                    id: universeId,
                    rootPlaceId:
                        Number.isSafeInteger(placeId)
                            ? placeId
                            : null,
                    name:
                        item.name ||
                        item.title ||
                        "Roblox Experience",
                    description:
                        item.description || "",
                    creator: {
                        name:
                            item.creatorName ||
                            item.creator?.name ||
                            "Unknown Creator",
                        id:
                            item.creatorId ||
                            item.creator?.id ||
                            null
                    },
                    playing:
                        item.playerCount ||
                        item.playing ||
                        0,
                    visits:
                        item.visits ||
                        0
                });
            }
        }

        /*
         * Remove duplicates.
         */

        const unique =
            new Map();

        for (const game of games) {

            unique.set(
                String(game.id),
                game
            );
        }

        const ids =
            [...unique.keys()]
                .map(Number)
                .slice(0, 40);

        if (!ids.length) {
            return [];
        }

        /*
         * Get authoritative Roblox
         * game information.
         */

        const details =
            await getGameDetails(ids);

        return details;

    } catch (error) {

        console.error(
            "[Roblox Search]",
            error
        );

        return [];
    }
}


/* =========================================
   HOME
========================================= */

app.get(
    "/api/home",
    async (req, res) => {

        try {

            const games =
                await getDiscoveryGames();

            const formatted =
                await formatGames(games);

            /*
             * Use the same real Roblox
             * discovery results for both
             * sections until personalized
             * recommendations are available.
             */

            res.json({

                success: true,

                recommended:
                    formatted.slice(0, 12),

                popular:
                    formatted.slice(0, 24)

            });

        } catch (error) {

            console.error(
                "[HOME]",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Unable to load Roblox discovery."

            });
        }
    }
);


/* =========================================
   POPULAR
========================================= */

app.get(
    "/api/popular",
    async (req, res) => {

        try {

            const games =
                await getDiscoveryGames();

            const formatted =
                await formatGames(games);

            res.json({

                success: true,

                games:
                    formatted.slice(0, 40)

            });

        } catch (error) {

            console.error(
                "[POPULAR]",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Unable to load popular Roblox experiences."

            });
        }
    }
);


/* =========================================
   SEARCH
========================================= */

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

            console.log(
                `[SEARCH] ${query}`
            );

            const games =
                await searchRoblox(query);

            const formatted =
                await formatGames(games);

            res.json({

                success: true,

                games:
                    formatted.slice(0, 40)

            });

        } catch (error) {

            console.error(
                "[SEARCH]",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Roblox search failed."

            });
        }
    }
);


/* =========================================
   SINGLE GAME
========================================= */

app.get(
    "/api/game/:universeId",
    async (req, res) => {

        const id =
            Number(
                req.params.universeId
            );

        if (
            !Number.isSafeInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid Roblox universe ID."

            });
        }

        try {

            const games =
                await getGameDetails([id]);

            if (!games.length) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox experience not found."

                });
            }

            const formatted =
                await formatGames(games);

            res.json({

                success: true,

                game:
                    formatted[0]

            });

        } catch (error) {

            console.error(
                "[GAME]",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Unable to retrieve Roblox experience."

            });
        }
    }
);


/* =========================================
   HEALTH
========================================= */

app.get(
    "/",
    (req, res) => {

        res.json({

            service:
                "WebBlox Backend",

            status:
                "online",

            source:
                "Roblox",

            fakeGames:
                false

        });
    }
);


app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success:
                true,

            status:
                "online"

        });
    }
);


/* =========================================
   START
========================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `WebBlox backend running on port ${PORT}`
        );

    }
);
