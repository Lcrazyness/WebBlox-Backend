"use strict";

/*
============================================================
 WebBlox Backend
============================================================

 Frontend:
 https://lcrazyness.github.io/WebBlox/

 Backend:
 https://webblox-backend.onrender.com/

 IMPORTANT:
 - Does NOT require the "cors" npm package.
 - Uses native fetch from Node 18+.
 - Never treats a random "id" as a universeId.
 - Validates universe IDs before requesting game details.
 - Uses Roblox's current Explore/Search APIs.
 - Gets real game names.
 - Gets real creators.
 - Gets real thumbnails.
 - Gets real player counts.
 - Gets real visit counts.
 - Keeps the existing WebBlox API routes.

============================================================
*/

const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

/*
============================================================
 CONFIG
============================================================
*/

const ROBLOX_GAMES =
    "https://games.roblox.com";

const ROBLOX_THUMBNAILS =
    "https://thumbnails.roblox.com";

const ROBLOX_EXPLORE =
    "https://apis.roblox.com/explore-api";

const ROBLOX_SEARCH =
    "https://apis.roblox.com/search-api";

/*
 Maximum IDs per Roblox request.

 Roblox has had recent protective behavior around
 large/mixed universe-ID requests, so we deliberately
 keep these small.
*/

const SAFE_BATCH_SIZE = 10;

/*
 How many games WebBlox returns in each section.
*/

const HOME_LIMIT = 20;

const SEARCH_LIMIT = 40;

/*
 Simple in-memory cache.

 This prevents Render from hammering Roblox every
 time somebody refreshes the page.
*/

const cache = new Map();

const CACHE_TIME = 45 * 1000;


/*
============================================================
 CORS
============================================================

 We do this manually instead of requiring the "cors"
 package. That means package.json does NOT need cors.
============================================================
*/

app.use((req, res, next) => {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

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


/*
============================================================
 BASIC HELPERS
============================================================
*/

function sleep(ms) {

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


function makeSessionId() {

    return (
        "webblox-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 12)
    );

}


function cacheGet(key) {

    const item =
        cache.get(key);

    if (!item) {

        return null;

    }

    if (
        Date.now() -
        item.time >
        CACHE_TIME
    ) {

        cache.delete(key);

        return null;

    }

    return item.value;

}


function cacheSet(key, value) {

    cache.set(
        key,
        {
            time: Date.now(),
            value
        }
    );

}


/*
============================================================
 ROBLOX FETCH
============================================================
*/

async function robloxFetch(
    url,
    options = {}
) {

    console.log(
        "[WebBlox] Roblox request:",
        url
    );

    let response;

    try {

        response =
            await fetch(
                url,
                {
                    method: "GET",

                    headers: {
                        "Accept":
                            "application/json",

                        "User-Agent":
                            "WebBlox/1.0"
                    },

                    ...options
                }
            );

    } catch (error) {

        console.error(
            "[WebBlox] Roblox connection error:",
            error
        );

        throw new Error(
            "Could not connect to Roblox."
        );

    }


    const text =
        await response.text();


    let data = null;


    if (text) {

        try {

            data =
                JSON.parse(text);

        } catch {

            throw new Error(
                "Roblox returned invalid JSON."
            );

        }

    }


    if (!response.ok) {

        const robloxError =
            data &&
            data.errors &&
            data.errors[0]
                ? data.errors[0]
                : null;


        const message =
            robloxError &&
            robloxError.message
                ? robloxError.message
                : (
                    "Roblox HTTP " +
                    response.status
                );


        const error =
            new Error(message);


        error.status =
            response.status;


        error.roblox =
            data;


        throw error;

    }


    return data;

}


/*
============================================================
 ID VALIDATION
============================================================

 THIS IS THE IMPORTANT CODE-8 FIX.

 We NEVER do:

 item.id

 when looking for a universe ID.

 We only accept explicit universeId fields.

 Then we ask Roblox for the universe itself.

 If Roblox doesn't return it, we throw it away.
============================================================
*/

function normalizeUniverseId(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return null;

    }


    const text =
        String(value).trim();


    /*
      Universe IDs are numeric.
    */

    if (
        !/^\d+$/.test(text)
    ) {

        return null;

    }


    const number =
        Number(text);


    if (
        !Number.isSafeInteger(number) ||
        number <= 0
    ) {

        return null;

    }


    return String(number);

}


function getExplicitUniverseId(item) {

    if (
        !item ||
        typeof item !== "object"
    ) {

        return null;

    }


    /*
      ONLY these fields are accepted.

      Notice that "id" is intentionally NOT here.
    */

    const candidates = [

        item.universeId,

        item.universeID,

        item.UniverseId,

        item.UniverseID

    ];


    for (
        const candidate of candidates
    ) {

        const id =
            normalizeUniverseId(
                candidate
            );


        if (id) {

            return id;

        }

    }


    return null;

}


/*
============================================================
 EXTRACT EXPLICIT UNIVERSE IDS
============================================================

 Explore/Search responses have changed shape over time.

 Instead of assuming one exact response structure,
 we recursively inspect objects.

 BUT:

 We only accept explicit universeId fields.

 We never use a generic "id".
============================================================
*/

function extractUniverseIds(
    value,
    output = [],
    seen = new Set()
) {

    if (
        value === null ||
        value === undefined
    ) {

        return output;

    }


    if (
        typeof value !== "object"
    ) {

        return output;

    }


    if (
        seen.has(value)
    ) {

        return output;

    }


    seen.add(value);


    if (Array.isArray(value)) {

        for (
            const item of value
        ) {

            extractUniverseIds(
                item,
                output,
                seen
            );

        }

        return output;

    }


    const explicitId =
        getExplicitUniverseId(
            value
        );


    if (explicitId) {

        output.push(
            explicitId
        );

    }


    for (
        const key of Object.keys(value)
    ) {

        /*
          Skip giant unrelated fields when possible.
        */

        if (
            key === "description" ||
            key === "localizedDescription"
        ) {

            continue;

        }


        extractUniverseIds(
            value[key],
            output,
            seen
        );

    }


    return output;

}


/*
============================================================
 UNIQUE IDS
============================================================
*/

function uniqueIds(ids) {

    return [
        ...new Set(
            ids
                .map(
                    normalizeUniverseId
                )
                .filter(Boolean)
        )
    ];

}


/*
============================================================
 BATCH ARRAY
============================================================
*/

function batches(
    array,
    size = SAFE_BATCH_SIZE
) {

    const result = [];


    for (
        let i = 0;
        i < array.length;
        i += size
    ) {

        result.push(
            array.slice(
                i,
                i + size
            )
        );

    }


    return result;

}


/*
============================================================
 GET GAME DETAILS
============================================================

 Roblox:
 GET /v1/games?universeIds=...

 We send only validated IDs.
============================================================
*/

async function getGameDetails(
    universeIds
) {

    const ids =
        uniqueIds(
            universeIds
        );


    if (
        ids.length === 0
    ) {

        return [];

    }


    const results = [];


    for (
        const batch of batches(
            ids,
            SAFE_BATCH_SIZE
        )
    ) {

        const query =
            batch.join(",");


        const url =
            ROBLOX_GAMES +
            "/v1/games?universeIds=" +
            encodeURIComponent(
                query
            );


        try {

            const data =
                await robloxFetch(
                    url
                );


            if (
                data &&
                Array.isArray(
                    data.data
                )
            ) {

                results.push(
                    ...data.data
                );

            }

        } catch (error) {

            console.error(
                "[WebBlox] Game detail batch failed:",
                error.message
            );

            /*
              Do NOT kill the entire page because
              one Roblox batch failed.
            */

        }


        /*
          Small delay between batches.
        */

        await sleep(100);

    }


    return results;

}


/*
============================================================
 THUMBNAILS
============================================================

 We use universe IDs only.

 Roblox documents the multiget game-thumbnail
 endpoint for universe IDs.
============================================================
*/

async function getThumbnails(
    universeIds
) {

    const ids =
        uniqueIds(
            universeIds
        );


    const map =
        new Map();


    if (
        ids.length === 0
    ) {

        return map;

    }


    for (
        const batch of batches(
            ids,
            SAFE_BATCH_SIZE
        )
    ) {

        const url =
            ROBLOX_THUMBNAILS +
            "/v1/games/multiget/thumbnails" +
            "?universeIds=" +
            encodeURIComponent(
                batch.join(",")
            ) +
            "&size=768x432" +
            "&format=Png" +
            "&isCircular=false";


        try {

            const data =
                await robloxFetch(
                    url
                );


            if (
                data &&
                Array.isArray(
                    data.data
                )
            ) {

                for (
                    const thumbnail
                    of data.data
                ) {

                    const id =
                        normalizeUniverseId(
                            thumbnail.universeId
                        );


                    if (
                        id &&
                        thumbnail.imageUrl
                    ) {

                        map.set(
                            id,
                            thumbnail.imageUrl
                        );

                    }

                }

            }

        } catch (error) {

            console.error(
                "[WebBlox] Thumbnail batch failed:",
                error.message
            );

        }


        await sleep(100);

    }


    return map;

}


/*
============================================================
 ICON FALLBACK
============================================================
*/

async function getIcons(
    universeIds
) {

    const ids =
        uniqueIds(
            universeIds
        );


    const map =
        new Map();


    if (
        ids.length === 0
    ) {

        return map;

    }


    for (
        const batch of batches(
            ids,
            SAFE_BATCH_SIZE
        )
    ) {

        const url =
            ROBLOX_THUMBNAILS +
            "/v1/games/icons" +
            "?universeIds=" +
            encodeURIComponent(
                batch.join(",")
            ) +
            "&size=512x512" +
            "&format=Png" +
            "&isCircular=false";


        try {

            const data =
                await robloxFetch(
                    url
                );


            if (
                data &&
                Array.isArray(
                    data.data
                )
            ) {

                for (
                    const icon
                    of data.data
                ) {

                    const id =
                        normalizeUniverseId(
                            icon.targetId
                        );


                    if (
                        id &&
                        icon.imageUrl
                    ) {

                        map.set(
                            id,
                            icon.imageUrl
                        );

                    }

                }

            }

        } catch (error) {

            console.error(
                "[WebBlox] Icon batch failed:",
                error.message
            );

        }


        await sleep(100);

    }


    return map;

}


/*
============================================================
 FORMAT GAME
============================================================
*/

function formatGame(
    game,
    thumbnailMap,
    iconMap
) {

    if (
        !game ||
        typeof game !== "object"
    ) {

        return null;

    }


    const universeId =
        normalizeUniverseId(
            game.id
        );


    /*
      Roblox's /v1/games endpoint returns
      the universe itself as "id".

      That is SAFE here because this object
      came directly from the universe-details
      endpoint.

      We never use discovery/search "id".
    */

    if (!universeId) {

        return null;

    }


    const rootPlaceId =
        game.rootPlaceId
            ? String(
                game.rootPlaceId
            )
            : null;


    const creator =
        game.creator &&
        typeof game.creator === "object"
            ? game.creator
            : {};


    const creatorName =
        creator.name ||
        "Unknown Creator";


    const creatorId =
        creator.id
            ? String(
                creator.id
            )
            : null;


    const thumbnail =
        thumbnailMap.get(
            universeId
        ) ||
        null;


    const icon =
        iconMap.get(
            universeId
        ) ||
        null;


    return {

        id:
            universeId,

        universeId:
            universeId,

        placeId:
            rootPlaceId,

        rootPlaceId:
            rootPlaceId,

        name:
            game.name ||
            "Untitled Roblox Experience",

        description:
            game.description ||
            "",

        creator:
            creatorName,

        creatorId:
            creatorId,

        creatorType:
            creator.type ||
            null,

        playing:
            Number(
                game.playing
            ) || 0,

        visits:
            Number(
                game.visits
            ) || 0,

        favorites:
            Number(
                game.favoritedCount
            ) || 0,

        maxPlayers:
            Number(
                game.maxPlayers
            ) || 0,

        thumbnail:
            thumbnail,

        icon:
            icon,

        genre:
            game.genre ||
            null,

        updated:
            game.updated ||
            null,

        created:
            game.created ||
            null,

        robloxUrl:
            rootPlaceId
                ? (
                    "https://www.roblox.com/games/" +
                    encodeURIComponent(
                        rootPlaceId
                    )
                )
                : (
                    "https://www.roblox.com/games/"
                    +
                    encodeURIComponent(
                        universeId
                    )
                )

    };

}


/*
============================================================
 ENRICH GAMES
============================================================
*/

async function enrichGames(
    universeIds,
    limit = HOME_LIMIT
) {

    const ids =
        uniqueIds(
            universeIds
        )
        .slice(
            0,
            limit
        );


    if (
        ids.length === 0
    ) {

        return [];

    }


    console.log(
        "[WebBlox] Validating",
        ids.length,
        "universe IDs"
    );


    const details =
        await getGameDetails(
            ids
        );


    if (
        details.length === 0
    ) {

        return [];

    }


    /*
      Only IDs that Roblox actually returned
      are allowed to continue.
    */

    const validDetails =
        details.filter(
            game =>
                normalizeUniverseId(
                    game &&
                    game.id
                )
        );


    const validIds =
        validDetails.map(
            game =>
                normalizeUniverseId(
                    game.id
                )
        );


    const thumbnails =
        await getThumbnails(
            validIds
        );


    const icons =
        await getIcons(
            validIds
        );


    const games =
        validDetails
            .map(
                game =>
                    formatGame(
                        game,
                        thumbnails,
                        icons
                    )
            )
            .filter(
                Boolean
            );


    return games;

}


/*
============================================================
 EXPLORE API
============================================================
*/

async function getExploreSorts() {

    const sessionId =
        makeSessionId();


    const url =
        ROBLOX_EXPLORE +
        "/v1/get-sorts?sessionId=" +
        encodeURIComponent(
            sessionId
        );


    try {

        return await robloxFetch(
            url
        );

    } catch (error) {

        console.error(
            "[WebBlox] Explore sorts error:",
            error.message
        );


        return null;

    }

}


/*
============================================================
 FIND SORTS
============================================================

 Roblox can return different names/orderings.

 We recursively inspect the result and find objects
 that have sort IDs.
============================================================
*/

function findSortObjects(
    value,
    output = [],
    seen = new Set()
) {

    if (
        !value ||
        typeof value !== "object"
    ) {

        return output;

    }


    if (
        seen.has(value)
    ) {

        return output;

    }


    seen.add(value);


    if (Array.isArray(value)) {

        for (
            const item of value
        ) {

            findSortObjects(
                item,
                output,
                seen
            );

        }

        return output;

    }


    const possibleId =
        value.sortId ||
        value.id ||
        value.sortID;


    if (
        possibleId !== undefined &&
        possibleId !== null
    ) {

        output.push(
            value
        );

    }


    for (
        const key of Object.keys(value)
    ) {

        findSortObjects(
            value[key],
            output,
            seen
        );

    }


    return output;

}


/*
============================================================
 GET SORT CONTENT
============================================================
*/

async function getSortContent(
    sessionId,
    sortId
) {

    const url =
        ROBLOX_EXPLORE +
        "/v1/get-sort-content" +
        "?sessionId=" +
        encodeURIComponent(
            sessionId
        ) +
        "&sortId=" +
        encodeURIComponent(
            sortId
        );


    try {

        return await robloxFetch(
            url
        );

    } catch (error) {

        console.error(
            "[WebBlox] Sort content error:",
            error.message
        );


        return null;

    }

}


/*
============================================================
 DISCOVER HOME UNIVERSE IDS
============================================================
*/

async function discoverHomeIds() {

    const sorts =
        await getExploreSorts();


    if (!sorts) {

        return {

            recommended: [],

            popular: []

        };

    }


    const sortObjects =
        findSortObjects(
            sorts
        );


    console.log(
        "[WebBlox] Explore sorts found:",
        sortObjects.length
    );


    const sessionId =
        makeSessionId();


    const recommendedIds =
        [];


    const popularIds =
        [];


    /*
      We inspect the names so the backend can adapt
      if Roblox changes the ordering.
    */

    for (
        const sort
        of sortObjects.slice(0, 12)
    ) {

        const sortId =
            sort.sortId ||
            sort.id ||
            sort.sortID;


        if (
            sortId === undefined ||
            sortId === null
        ) {

            continue;

        }


        const name =
            String(
                sort.name ||
                sort.title ||
                sort.displayName ||
                ""
            )
            .toLowerCase();


        const content =
            await getSortContent(
                sessionId,
                sortId
            );


        if (!content) {

            continue;

        }


        const ids =
            extractUniverseIds(
                content
            );


        if (
            name.includes(
                "recommend"
            )
        ) {

            recommendedIds.push(
                ...ids
            );

        }


        if (
            name.includes(
                "popular"
            ) ||
            name.includes(
                "playing"
            ) ||
            name.includes(
                "top"
            )
        ) {

            popularIds.push(
                ...ids
            );

        }

    }


    /*
      If Roblox doesn't label the sorts as expected,
      use the first sort results as a fallback.
    */

    if (
        recommendedIds.length === 0 &&
        popularIds.length === 0
    ) {

        for (
            const sort
            of sortObjects.slice(0, 3)
        ) {

            const sortId =
                sort.sortId ||
                sort.id ||
                sort.sortID;


            if (
                sortId === undefined ||
                sortId === null
            ) {

                continue;

            }


            const content =
                await getSortContent(
                    sessionId,
                    sortId
                );


            if (!content) {

                continue;

            }


            popularIds.push(
                ...extractUniverseIds(
                    content
                )
            );

        }

    }


    return {

        recommended:
            uniqueIds(
                recommendedIds
            ),

        popular:
            uniqueIds(
                popularIds
            )

    };

}


/*
============================================================
 SEARCH ROBLOX
============================================================
*/

async function searchRoblox(
    query
) {

    const cleanQuery =
        String(
            query || ""
        ).trim();


    if (!cleanQuery) {

        return [];

    }


    const sessionId =
        makeSessionId();


    const url =
        ROBLOX_SEARCH +
        "/omni-search" +
        "?SearchQuery=" +
        encodeURIComponent(
            cleanQuery
        ) +
        "&searchQuery=" +
        encodeURIComponent(
            cleanQuery
        ) +
        "&SessionId=" +
        encodeURIComponent(
            sessionId
        ) +
        "&sessionId=" +
        encodeURIComponent(
            sessionId
        ) +
        "&pageType=all";


    console.log(
        "[WebBlox] Roblox search:",
        cleanQuery
    );


    const data =
        await robloxFetch(
            url
        );


    /*
      Again, only explicit universeId values
      are accepted.
    */

    const ids =
        uniqueIds(
            extractUniverseIds(
                data
            )
        );


    console.log(
        "[WebBlox] Search universe IDs:",
        ids.length
    );


    return enrichGames(
        ids,
        SEARCH_LIMIT
    );

}


/*
============================================================
 HOME
============================================================
*/

async function buildHome() {

    const discovered =
        await discoverHomeIds();


    let recommended =
        await enrichGames(
            discovered.recommended,
            HOME_LIMIT
        );


    let popular =
        await enrichGames(
            discovered.popular,
            HOME_LIMIT
        );


    /*
      Remove duplicate universes from popular if they
      are already in recommended.
    */

    const recommendedSet =
        new Set(
            recommended.map(
                game =>
                    game.universeId
            )
        );


    popular =
        popular.filter(
            game =>
                !recommendedSet.has(
                    game.universeId
                )
        );


    /*
      If one section is empty, use the other section's
      valid games rather than showing broken cards.
    */

    if (
        recommended.length === 0 &&
        popular.length > 0
    ) {

        recommended =
            popular.slice(
                0,
                HOME_LIMIT
            );

    }


    if (
        popular.length === 0 &&
        recommended.length > 0
    ) {

        popular =
            recommended.slice(
                0,
                HOME_LIMIT
            );

    }


    return {

        success: true,

        recommended,

        popular

    };

}


/*
============================================================
 API: HOME
============================================================
*/

app.get(
    "/api/home",
    async (req, res) => {

        try {

            const cached =
                cacheGet(
                    "home"
                );


            if (cached) {

                return res.json(
                    cached
                );

            }


            console.log(
                "[WebBlox] Building home..."
            );


            const data =
                await buildHome();


            cacheSet(
                "home",
                data
            );


            res.json(
                data
            );

        } catch (error) {

            console.error(
                "[WebBlox] /api/home error:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Failed to load Roblox experiences."

            });

        }

    }
);


/*
============================================================
 API: POPULAR
============================================================
*/

app.get(
    "/api/popular",
    async (req, res) => {

        try {

            const data =
                await buildHome();


            res.json({

                success: true,

                games:
                    data.popular,

                popular:
                    data.popular

            });

        } catch (error) {

            console.error(
                "[WebBlox] /api/popular error:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Failed to load popular Roblox experiences."

            });

        }

    }
);


/*
============================================================
 API: SEARCH
============================================================
*/

app.get(
    "/api/search",
    async (req, res) => {

        const query =
            String(
                req.query.q ||
                req.query.query ||
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

            const games =
                await searchRoblox(
                    query
                );


            res.json({

                success: true,

                query,

                count:
                    games.length,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox] /api/search error:",
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


/*
============================================================
 API: SINGLE GAME
============================================================

 /api/game/UNIVERSE_ID

 IMPORTANT:
 This route accepts a universe ID only.
============================================================
*/

app.get(
    "/api/game/:universeId",
    async (req, res) => {

        const universeId =
            normalizeUniverseId(
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

            const games =
                await enrichGames(
                    [universeId],
                    1
                );


            if (
                games.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox could not find that universe."

                });

            }


            res.json({

                success: true,

                game:
                    games[0]

            });

        } catch (error) {

            console.error(
                "[WebBlox] /api/game error:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Failed to load Roblox experience."

            });

        }

    }
);


/*
============================================================
 HEALTH CHECK
============================================================
*/

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            name:
                "WebBlox Backend",

            status:
                "online",

            version:
                "4.0.0",

            frontend:
                "https://lcrazyness.github.io/WebBlox/",

            endpoints: {

                home:
                    "/api/home",

                popular:
                    "/api/popular",

                search:
                    "/api/search?q=YOUR_SEARCH",

                game:
                    "/api/game/UNIVERSE_ID"

            }

        });

    }
);


/*
============================================================
 HEALTH API
============================================================
*/

app.get(
    "/health",
    (req, res) => {

        res.json({

            success: true,

            status:
                "online",

            service:
                "WebBlox Backend",

            timestamp:
                new Date().toISOString()

        });

    }
);


/*
============================================================
 404
============================================================
*/

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "WebBlox API route not found.",

            path:
                req.path

        });

    }
);


/*
============================================================
 ERROR HANDLER
============================================================
*/

app.use(
    (error, req, res, next) => {

        console.error(
            "[WebBlox] Server error:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }


        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Internal server error."

        });

    }
);


/*
============================================================
 START SERVER
============================================================
*/

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "[WebBlox] Backend started"
        );

        console.log(
            "[WebBlox] Port:",
            PORT
        );

        console.log(
            "[WebBlox] Frontend:",
            "https://lcrazyness.github.io/WebBlox/"
        );

        console.log(
            "[WebBlox] API:",
            "https://webblox-backend.onrender.com"
        );

        console.log(
            "[WebBlox] Home:",
            "https://webblox-backend.onrender.com/api/home"
        );

        console.log(
            "[WebBlox] Search:",
            "https://webblox-backend.onrender.com/api/search?q=adopt"
        );

        console.log(
            "[WebBlox] Status: ONLINE"
        );

        console.log(
            "======================================"
        );

    }
);
