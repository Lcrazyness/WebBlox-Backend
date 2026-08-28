
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});


/* =========================
   ROBLOX APIs
========================= */

const GAMES_API =
    "https://games.roblox.com";

const THUMBNAILS_API =
    "https://thumbnails.roblox.com";


/* =========================
   ROBLOX REQUEST
========================= */

async function robloxFetch(url) {

    console.log("Roblox request:", url);

    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Roblox API returned ${response.status}`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            "Roblox returned invalid JSON"
        );
    }
}


/* =========================
   GAME DETAILS
========================= */

async function getGameDetails(ids) {

    ids = ids
        .map(Number)
        .filter(Number.isFinite)
        .slice(0, 50);

    if (!ids.length) {
        return [];
    }

    const url =
        `${GAMES_API}/v1/games?universeIds=${ids.join(",")}`;

    const data =
        await robloxFetch(url);

    return Array.isArray(data.data)
        ? data.data
        : [];
}


/* =========================
   THUMBNAILS
========================= */

async function getThumbnails(ids) {

    ids = ids
        .map(Number)
        .filter(Number.isFinite)
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

    const data =
        await robloxFetch(url);

    const thumbnails = new Map();

    for (const item of data.data || []) {

        thumbnails.set(
            String(item.targetId),
            item.imageUrl || null
        );

    }

    return thumbnails;
}


/* =========================
   GAME ICONS
========================= */

async function getIcons(ids) {

    ids = ids
        .map(Number)
        .filter(Number.isFinite)
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

    const data =
        await robloxFetch(url);

    const icons = new Map();

    for (const item of data.data || []) {

        icons.set(
            String(item.targetId),
            item.imageUrl || null
        );

    }

    return icons;
}


/* =========================
   FORMAT GAME
========================= */

async function formatGames(games) {

    if (!games.length) {
        return [];
    }

    const ids =
        games.map(game => game.id);

    const [
        thumbnails,
        icons
    ] = await Promise.all([
        getThumbnails(ids),
        getIcons(ids)
    ]);

    return games.map(game => {

        const id =
            Number(game.id);

        return {

            universeId: id,

            placeId:
                game.rootPlaceId || null,

            name:
                game.name || "Unknown Game",

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
                    String(id)
                ) || null,

            icon:
                icons.get(
                    String(id)
                ) || null

        };

    });
}


/* =========================
   GAME LOOKUP
========================= */

app.get(
    "/api/game/:universeId",
    async (req, res) => {

        try {

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
                    error: "Invalid universe ID."
                });

            }

            const games =
                await getGameDetails([id]);

            if (!games.length) {

                return res.status(404).json({
                    success: false,
                    error:
                        "Roblox experience not found."
                });

            }

            const result =
                await formatGames(games);

            res.json({
                success: true,
                game: result[0]
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    "Unable to retrieve Roblox game."
            });

        }
    }
);


/* =========================
   HOME
========================= */

app.get(
    "/api/home",
    async (req, res) => {

        /*
         * This endpoint is ready for the
         * Roblox discovery source.
         *
         * We return an empty list instead
         * of fake games if discovery fails.
         */

        try {

            res.json({
                success: true,
                recommended: [],
                popular: []
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    "Unable to load Roblox discovery."
            });

        }
    }
);


/* =========================
   POPULAR
========================= */

app.get(
    "/api/popular",
    async (req, res) => {

        res.json({
            success: true,
            games: []
        });

    }
);


/* =========================
   SEARCH
========================= */

app.get(
    "/api/search",
    async (req, res) => {

        /*
         * No fake search results.
         *
         * Search will be connected to
         * the appropriate Roblox discovery
         * endpoint.
         */

        res.json({
            success: true,
            games: []
        });

    }
);


/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {

    res.json({
        service: "WebBlox Backend",
        status: "online",
        source: "Roblox",
        fakeGames: false
    });

});


app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        status: "online"
    });

});


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

    console.log(
        `WebBlox backend running on port ${PORT}`
    );

});
