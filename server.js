const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

const ROBLOX_EXPLORE =
    "https://apis.roblox.com/explore-api/v1";

const ROBLOX_SEARCH =
    "https://apis.roblox.com/search-api";

const ROBLOX_GAMES =
    "https://games.roblox.com/v1";

const ROBLOX_THUMBNAILS =
    "https://thumbnails.roblox.com/v1";

const SESSION_ID =
    "webblox-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Date.now();


/* ============================================================
   CORS
   ============================================================ */

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


app.use(express.json());


/* ============================================================
   HELPERS
   ============================================================ */

async function robloxFetch(url) {

    console.log("[WebBlox] Roblox request:");
    console.log(url);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Roblox API HTTP ${response.status}: ${text.slice(0, 500)}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            "Roblox returned invalid JSON."
        );
    }

    return data;
}


/* ============================================================
   FIND UNIVERSE OBJECTS
   ============================================================

   Roblox has changed the internal shape of the Explore API
   several times.

   This walks the response and finds objects containing
   universeId instead of assuming one exact response shape.
   ============================================================ */

function collectUniverseObjects(value, output = []) {

    if (!value) {
        return output;
    }

    if (Array.isArray(value)) {

        for (const item of value) {
            collectUniverseObjects(item, output);
        }

        return output;
    }

    if (typeof value !== "object") {
        return output;
    }

    if (
        value.universeId !== undefined &&
        value.universeId !== null
    ) {
        output.push(value);
    }

    for (const key of Object.keys(value)) {
        collectUniverseObjects(
            value[key],
            output
        );
    }

    return output;
}


/* ============================================================
   NUMBER
   ============================================================ */

function number(value) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : 0;
}


/* ============================================================
   BATCH ARRAY
   ============================================================ */

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
   GET CHART
   ============================================================ */

async function getChart(sortId) {

    const url =
        `${ROBLOX_EXPLORE}/get-sort-content` +
        `?sessionId=${encodeURIComponent(SESSION_ID)}` +
        `&sortId=${encodeURIComponent(sortId)}` +
        `&device=computer` +
        `&country=all`;

    const data =
        await robloxFetch(url);

    const raw =
        collectUniverseObjects(data);

    /*
       Remove duplicate universe IDs.
    */

    const unique = new Map();

    for (const item of raw) {

        const id =
            String(item.universeId);

        if (!unique.has(id)) {
            unique.set(id, item);
        }
    }

    const result =
        Array.from(unique.values());

    console.log(
        `[WebBlox] ${sortId}: ${result.length} chart entries`
    );

    return result;
}


/* ============================================================
   GAME DETAILS
   ============================================================ */

async function getGameDetails(universeIds) {

    if (!universeIds.length) {
        return [];
    }

    const details = [];

    /*
       Roblox has batch limits on this endpoint.

       Keep this at 10 per request.
    */

    const batches =
        chunks(universeIds, 10);

    for (const batch of batches) {

        const url =
            `${ROBLOX_GAMES}/games?universeIds=` +
            batch.join(",");

        try {

            const data =
                await robloxFetch(url);

            if (
                data &&
                Array.isArray(data.data)
            ) {

                details.push(
                    ...data.data
                );

            }

        } catch (error) {

            console.error(
                "[WebBlox] Game detail batch failed:",
                error.message
            );

        }
    }

    return details;
}


/* ============================================================
   THUMBNAILS
   ============================================================ */

async function getThumbnails(universeIds) {

    if (!universeIds.length) {
        return new Map();
    }

    const map =
        new Map();

    const batches =
        chunks(universeIds, 10);

    for (const batch of batches) {

        const url =
            `${ROBLOX_THUMBNAILS}/games/multiget/thumbnails` +
            `?universeIds=${batch.join(",")}` +
            `&size=768x432` +
            `&format=Png` +
            `&isCircular=false`;

        try {

            const data =
                await robloxFetch(url);

            const rows =
                Array.isArray(data.data)
                    ? data.data
                    : [];

            for (const row of rows) {

                const id =
                    String(
                        row.universeId ??
                        row.targetId ??
                        ""
                    );

                const image =
                    row.imageUrl ||
                    row.thumbnailUrl ||
                    row.url ||
                    "";

                if (
                    id &&
                    image
                ) {
                    map.set(
                        id,
                        image
                    );
                }
            }

        } catch (error) {

            console.error(
                "[WebBlox] Thumbnail batch failed:",
                error.message
            );

        }
    }

    return map;
}


/* ============================================================
   NORMALIZE GAME
   ============================================================ */

function normalizeGame(
    chartItem,
    detail,
    thumbnail
) {

    const universeId =
        String(
            detail?.id ??
            chartItem?.universeId ??
            ""
        );

    const creator =
        detail?.creator || {};

    const creatorName =
        creator.name ||
        detail?.creatorName ||
        chartItem?.creatorName ||
        "Unknown Creator";

    const creatorId =
        creator.id ||
        detail?.creatorId ||
        chartItem?.creatorId ||
        null;

    const placeId =
        detail?.rootPlaceId ||
        chartItem?.placeId ||
        chartItem?.rootPlaceId ||
        null;

    const playing =
        number(
            detail?.playing ??
            chartItem?.playerCount ??
            chartItem?.playing ??
            0
        );

    const visits =
        number(
            detail?.visits ??
            chartItem?.visits ??
            0
        );

    const favorites =
        number(
            detail?.favoritedCount ??
            detail?.favorites ??
            chartItem?.favorites ??
            0
        );

    const name =
        detail?.name ||
        chartItem?.name ||
        chartItem?.displayName ||
        "Roblox Experience";

    const description =
        detail?.description ||
        chartItem?.description ||
        "";

    const genre =
        detail?.genre ||
        chartItem?.genre ||
        "";

    return {

        id: universeId,

        universeId,

        placeId,

        name,

        description,

        creator: creatorName,

        creatorId,

        creatorType:
            creator.type ||
            detail?.creatorType ||
            null,

        playing,

        visits,

        favorites,

        genre,

        thumbnail:
            thumbnail || "",

        icon:
            thumbnail || "",

        robloxUrl:
            placeId
                ? `https://www.roblox.com/games/${placeId}`
                : `https://www.roblox.com/games/`,

        updated:
            detail?.updated ||
            null

    };
}


/* ============================================================
   BUILD CHART GAMES
   ============================================================ */

async function buildChart(sortId) {

    const chart =
        await getChart(sortId);

    if (!chart.length) {

        throw new Error(
            `Roblox returned no games for ${sortId}.`
        );

    }

    const universeIds =
        chart
            .map(item =>
                String(item.universeId)
            )
            .filter(Boolean);

    const details =
        await getGameDetails(
            universeIds
        );

    const detailMap =
        new Map();

    for (const game of details) {

        detailMap.set(
            String(game.id),
            game
        );

    }

    const thumbnails =
        await getThumbnails(
            universeIds
        );

    /*
       IMPORTANT:

       Preserve Roblox's chart order.

       We do NOT sort these randomly.
       We do NOT inject games from somewhere else.
    */

    const games = [];

    for (const chartItem of chart) {

        const id =
            String(chartItem.universeId);

        const detail =
            detailMap.get(id);

        /*
           If Roblox's detail endpoint didn't return
           the game, skip it rather than creating
           fake/incomplete games.
        */

        if (!detail) {
            continue;
        }

        games.push(
            normalizeGame(
                chartItem,
                detail,
                thumbnails.get(id) || ""
            )
        );

    }

    return games;
}


/* ============================================================
   HOME
   ============================================================ */

app.get(
    "/api/home",
    async (req, res) => {

        try {

            console.log(
                "[WebBlox] Loading REAL Roblox charts..."
            );

            const [
                popular,
                trending
            ] = await Promise.all([
                buildChart("top-playing-now"),
                buildChart("top-trending")
            ]);

            res.json({

                success: true,

                popular,

                trending,

                /*
                   Keep recommended for compatibility
                   with older frontend code.
                */

                recommended:
                    popular.slice(0, 12)

            });

        } catch (error) {

            console.error(
                "[WebBlox] Home error:",
                error
            );

            res.status(502).json({

                success: false,

                error:
                    "Roblox Charts could not be loaded: " +
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

            const games =
                await buildChart(
                    "top-playing-now"
                );

            res.json({

                success: true,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox] Popular error:",
                error
            );

            res.status(502).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


/* ============================================================
   TRENDING
   ============================================================ */

app.get(
    "/api/trending",
    async (req, res) => {

        try {

            const games =
                await buildChart(
                    "top-trending"
                );

            res.json({

                success: true,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox] Trending error:",
                error
            );

            res.status(502).json({

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

            const url =
                `${ROBLOX_SEARCH}/omni-search` +
                `?searchQuery=${encodeURIComponent(query)}` +
                `&sessionId=${encodeURIComponent(SESSION_ID)}` +
                `&pageType=all`;

            const data =
                await robloxFetch(url);

            /*
               Search API response structures can change.

               Recursively locate universe IDs.
            */

            const raw =
                collectUniverseObjects(data);

            const unique =
                new Map();

            for (const item of raw) {

                const id =
                    String(item.universeId);

                if (!unique.has(id)) {
                    unique.set(id, item);
                }

            }

            const searchItems =
                Array.from(
                    unique.values()
                );

            const universeIds =
                searchItems.map(
                    item =>
                        String(item.universeId)
                );

            const details =
                await getGameDetails(
                    universeIds
                );

            const detailMap =
                new Map();

            for (const game of details) {

                detailMap.set(
                    String(game.id),
                    game
                );

            }

            const thumbnails =
                await getThumbnails(
                    universeIds
                );

            const games = [];

            for (
                const item
                of searchItems
            ) {

                const id =
                    String(item.universeId);

                const detail =
                    detailMap.get(id);

                if (!detail) {
                    continue;
                }

                games.push(
                    normalizeGame(
                        item,
                        detail,
                        thumbnails.get(id) || ""
                    )
                );

            }

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

            res.status(502).json({

                success: false,

                error:
                    "Roblox search failed: " +
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
            String(
                req.params.universeId
            );

        if (
            !/^\d+$/.test(
                universeId
            )
        ) {

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

            if (!details.length) {

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
                    {
                        universeId
                    },
                    details[0],
                    thumbnails.get(universeId) || ""
                );

            res.json({

                success: true,

                game

            });

        } catch (error) {

            console.error(
                "[WebBlox] Game error:",
                error
            );

            res.status(502).json({

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

            service:
                "WebBlox Backend",

            status:
                "online",

            charts: {

                popular:
                    "top-playing-now",

                trending:
                    "top-trending"

            }

        });

    }
);


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
            "[WebBlox] Backend started"
        );

        console.log(
            "[WebBlox] Port:",
            PORT
        );

        console.log(
            "[WebBlox] Popular:",
            "/api/popular"
        );

        console.log(
            "[WebBlox] Trending:",
            "/api/trending"
        );

        console.log(
            "[WebBlox] Home:",
            "/api/home"
        );

        console.log(
            "[WebBlox] Search:",
            "/api/search?q=brookhaven"
        );

        console.log(
            "===================================="
        );

    }
);
