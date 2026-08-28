const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

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
   ROBLOX API URLS
========================================= */

const GAMES_API =
    "https://games.roblox.com";

const THUMBNAILS_API =
    "https://thumbnails.roblox.com";

const EXPLORE_API =
    "https://apis.roblox.com/explore-api";

const SEARCH_API =
    "https://apis.roblox.com/search-api";


/* =========================================
   REQUEST HELPER
========================================= */

async function robloxFetch(url) {

    console.log("[WebBlox] Roblox request:", url);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    if (!response.ok) {
        console.error(
            "[WebBlox] Roblox HTTP",
            response.status,
            text.slice(0, 500)
        );

        throw new Error(
            `Roblox API returned HTTP ${response.status}`
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


/* =========================================
   GAME DETAILS
========================================= */

async function getGameDetails(ids) {

    const cleanIds = [
        ...new Set(
            ids
                .map(Number)
                .filter(Number.isSafeInteger)
                .filter(id => id > 0)
        )
    ].slice(0, 50);

    if (!cleanIds.length) {
        return [];
    }

    const data = await robloxFetch(
        `${GAMES_API}/v1/games?universeIds=${cleanIds.join(",")}`
    );

    return Array.isArray(data.data)
        ? data.data
        : [];
}


/* =========================================
   THUMBNAILS
========================================= */

async function getThumbnails(ids) {

    const cleanIds = [
        ...new Set(
            ids
                .map(Number)
                .filter(Number.isSafeInteger)
                .filter(id => id > 0)
        )
    ].slice(0, 50);

    if (!cleanIds.length) {
        return new Map();
    }

    const url =
        `${THUMBNAILS_API}/v1/games/multiget/thumbnails` +
        `?universeIds=${cleanIds.join(",")}` +
        `&countPerUniverse=1` +
        `&size=768x432` +
        `&format=Png` +
        `&isCircular=false`;

    const data = await robloxFetch(url);

    const result = new Map();

    for (const item of data.data || []) {

        if (item.targetId) {
            result.set(
                String(item.targetId),
                item.imageUrl || null
            );
        }
    }

    return result;
}


/* =========================================
   ICONS
========================================= */

async function getIcons(ids) {

    const cleanIds = [
        ...new Set(
            ids
                .map(Number)
                .filter(Number.isSafeInteger)
                .filter(id => id > 0)
        )
    ].slice(0, 50);

    if (!cleanIds.length) {
        return new Map();
    }

    const url =
        `${THUMBNAILS_API}/v1/games/icons` +
        `?universeIds=${cleanIds.join(",")}` +
        `&size=420x420` +
        `&format=Png` +
        `&isCircular=false`;

    const data = await robloxFetch(url);

    const result = new Map();

    for (const item of data.data || []) {

        if (item.targetId) {
            result.set(
                String(item.targetId),
                item.imageUrl || null
            );
        }
    }

    return result;
}


/* =========================================
   FORMAT GAMES
========================================= */

async function formatGames(games) {

    if (!games.length) {
        return [];
    }

    const ids = games
        .map(game => game.id)
        .filter(Boolean);

    const [
        thumbnails,
        icons
    ] = await Promise.all([
        getThumbnails(ids),
        getIcons(ids)
    ]);

    return games.map(game => {

        const id = Number(game.id);

        return {
            universeId: id,

            placeId:
                game.rootPlaceId ||
                game.placeId ||
                null,

            name:
                game.name ||
                "Unknown Game",

            description:
                game.description ||
                "",

            creator:
                game.creator?.name ||
                game.creatorName ||
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
                thumbnails.get(String(id)) ||
                null,

            icon:
                icons.get(String(id)) ||
                null
        };
    });
}


/* =========================================
   RECURSIVE GAME ID FINDER
========================================= */

function collectGameIds(value, output = []) {

    if (!value) {
        return output;
    }

    if (Array.isArray(value)) {

        for (const item of value) {
            collectGameIds(item, output);
        }

        return output;
    }

    if (typeof value !== "object") {
        return output;
    }


    /*
       Roblox APIs can return games nested
       inside several different objects.
    */

    const possibleIds = [
        value.universeId,
        value.universeID,
        value.id
    ];

    for (const id of possibleIds) {

        const number = Number(id);

        if (
            Number.isSafeInteger(number) &&
            number > 0
        ) {
            output.push(number);
        }
    }


    /*
       Some responses use:
       rootPlaceId / placeId
       but those aren't universe IDs,
       so we DON'T treat them as game IDs.
    */


    for (const key of Object.keys(value)) {

        const child = value[key];

        if (
            child &&
            typeof child === "object"
        ) {
            collectGameIds(
                child,
                output
            );
        }
    }

    return output;
}


/* =========================================
   SESSION ID
========================================= */

function sessionId() {

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2)
    );
}


/* =========================================
   ROBLOX SEARCH
========================================= */

async function robloxSearch(query) {

    const url =
        `${SEARCH_API}/omni-search` +
        `?searchQuery=${encodeURIComponent(query)}` +
        `&sessionId=${encodeURIComponent(sessionId())}` +
        `&pageType=all`;

    const data =
        await robloxFetch(url);

    return data;
}


/* =========================================
   EXTRACT SEARCH GAMES
========================================= */

function extractSearchGames(data) {

    const found = [];

    function walk(value) {

        if (!value) {
            return;
        }

        if (Array.isArray(value)) {

            for (const item of value) {
                walk(item);
            }

            return;
        }

        if (
            typeof value !== "object"
        ) {
            return;
        }


        /*
           Search results commonly contain
           an item with universeId/type.
        */

        const universeId =
            Number(
                value.universeId ??
                value.universeID
            );

        const name =
            value.name ||
            value.title;


        if (
            Number.isSafeInteger(universeId) &&
            universeId > 0 &&
            typeof name === "string"
        ) {

            found.push({
                id: universeId,

                name,

                description:
                    value.description ||
                    "",

                creator:
                    value.creator?.name ||
                    value.creatorName ||
                    "",

                rootPlaceId:
                    value.rootPlaceId ||
                    value.placeId ||
                    null,

                playing:
                    Number(
                        value.playing ??
                        value.playerCount ??
                        0
                    ) || 0,

                visits:
                    Number(
                        value.visits ??
                        0
                    ) || 0
            });
        }


        for (const key of Object.keys(value)) {

            if (
                value[key] &&
                typeof value[key] === "object"
            ) {
                walk(value[key]);
            }
        }
    }

    walk(data);


    /*
       Remove duplicate universes.
    */

    const unique = new Map();

    for (const game of found) {

        if (!unique.has(game.id)) {
            unique.set(
                game.id,
                game
            );
        }
    }

    return [
        ...unique.values()
    ].slice(0, 40);
}


/* =========================================
   EXPLORE SORTS
========================================= */

async function getExploreSorts() {

    const url =
        `${EXPLORE_API}/v1/get-sorts` +
        `?sessionId=${encodeURIComponent(sessionId())}` +
        `&device=computer` +
        `&country=all`;

    return await robloxFetch(url);
}


/* =========================================
   EXTRACT SORTS
========================================= */

function extractSorts(data) {

    const sorts = [];

    function walk(value) {

        if (!value) {
            return;
        }

        if (Array.isArray(value)) {

            for (const item of value) {
                walk(item);
            }

            return;
        }

        if (
            typeof value !== "object"
        ) {
            return;
        }


        /*
           Sort IDs are what we need to call
           get-sort-content.
        */

        const sortId =
            value.sortId ??
            value.id;

        const title =
            value.title ??
            value.name ??
            value.displayName;


        if (
            sortId &&
            typeof title === "string"
        ) {

            sorts.push({
                id: String(sortId),
                title
            });
        }


        for (const key of Object.keys(value)) {

            if (
                value[key] &&
                typeof value[key] === "object"
            ) {
                walk(value[key]);
            }
        }
    }

    walk(data);

    const unique = new Map();

    for (const sort of sorts) {

        if (!unique.has(sort.id)) {
            unique.set(
                sort.id,
                sort
            );
        }
    }

    return [
        ...unique.values()
    ];
}


/* =========================================
   GET SORT CONTENT
========================================= */

async function getSortContent(sortId) {

    const url =
        `${EXPLORE_API}/v1/get-sort-content` +
        `?sessionId=${encodeURIComponent(sessionId())}` +
        `&sortId=${encodeURIComponent(sortId)}`;

    return await robloxFetch(url);
}


/* =========================================
   HOME DISCOVERY
========================================= */

async function getDiscoveryGames() {

    const sortsData =
        await getExploreSorts();

    const sorts =
        extractSorts(sortsData);

    console.log(
        "[WebBlox] Roblox sorts:",
        sorts
    );


    /*
       Prefer actual popular / engagement
       sorts instead of inventing games.
    */

    const preferred =
        sorts.filter(sort => {

            const title =
                sort.title.toLowerCase();

            return (
                title.includes("popular") ||
                title.includes("engaging") ||
                title.includes("top") ||
                title.includes("trending")
            );
        });


    const selected =
        preferred.length
            ? preferred
            : sorts.slice(0, 3);


    const ids = [];


    for (
        const sort of selected.slice(0, 5)
    ) {

        try {

            const content =
                await getSortContent(
                    sort.id
                );

            const found =
                collectGameIds(
                    content
                );

            ids.push(...found);

        } catch (error) {

            console.error(
                "[WebBlox] Sort failed:",
                sort.title,
                error.message
            );
        }
    }


    const uniqueIds = [
        ...new Set(ids)
    ].slice(0, 50);


    if (!uniqueIds.length) {
        return [];
    }


    const games =
        await getGameDetails(
            uniqueIds
        );


    return formatGames(
        games
    );
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


            /*
               Until the player-login system exists,
               "recommended" uses public discovery
               games instead of fake personalized data.
            */

            const recommended =
                games.slice(0, 12);

            const popular =
                games.slice(0, 24);


            res.json({
                success: true,

                recommended,

                popular
            });

        } catch (error) {

            console.error(
                "[WebBlox] Home error:",
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


            res.json({

                success: true,

                games:
                    games.slice(0, 40)
            });

        } catch (error) {

            console.error(
                "[WebBlox] Popular error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Unable to load popular Roblox games."
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
                req.query.q ||
                ""
            ).trim();


        if (!query) {

            return res.status(400).json({

                success: false,

                error:
                    "Search query is required."
            });
        }


        try {

            console.log(
                "[WebBlox] Searching Roblox:",
                query
            );


            const searchData =
                await robloxSearch(
                    query
                );


            const searchGames =
                extractSearchGames(
                    searchData
                );


            if (!searchGames.length) {

                return res.json({

                    success: true,

                    games: []
                });
            }


            /*
               Fetch the official Roblox game
               metadata for the search results.
            */

            const ids =
                searchGames.map(
                    game => game.id
                );


            const officialGames =
                await getGameDetails(
                    ids
                );


            const games =
                await formatGames(
                    officialGames
                );


            res.json({

                success: true,

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
                    "Unable to search Roblox."
            });
        }
    }
);


/* =========================================
   GAME
========================================= */

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

                    error:
                        "Invalid universe ID."
                });
            }


            const games =
                await getGameDetails([
                    id
                ]);


            if (!games.length) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox experience not found."
                });
            }


            const formatted =
                await formatGames(
                    games
                );


            res.json({

                success: true,

                game:
                    formatted[0]
            });

        } catch (error) {

            console.error(
                "[WebBlox] Game error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Unable to retrieve Roblox game."
            });
        }
    }
);


/* =========================================
   HEALTH
========================================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            status: "online",

            source: "Roblox",

            fakeGames: false
        });
    }
);


/* =========================================
   ROOT
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


/* =========================================
   START
========================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `WebBlox backend running on port ${PORT}`
        );

    }
);
