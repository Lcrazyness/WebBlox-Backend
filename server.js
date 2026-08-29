"use strict";

/*
============================================================
 WebBlox Backend
============================================================

Frontend:
https://lcrazyness.github.io/WebBlox/

Backend:
https://webblox-backend.onrender.com/

============================================================
*/

const express = require("express");
const crypto = require("crypto");

const webbloxGames = require("./games/games.js");

const app = express();

const PORT = process.env.PORT || 10000;


/*
============================================================
 CORS
============================================================
*/

app.use((req, res, next) => {

    res.header(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();

});


app.use(express.json());


/*
============================================================
 ROBLOX API URLS
============================================================
*/

const ROBLOX = {

    explore:
        "https://apis.roblox.com/explore-api",

    search:
        "https://apis.roblox.com/search-api",

    games:
        "https://games.roblox.com",

    thumbnails:
        "https://thumbnails.roblox.com",

    users:
        "https://users.roblox.com"

};


/*
============================================================
 SESSION
============================================================
*/

const SESSION_ID = crypto.randomUUID();


/*
============================================================
 HTTP HELPER
============================================================
*/

async function robloxFetch(url) {

    console.log("[Roblox] GET:", url);

    let response;

    try {

        response = await fetch(
            url,
            {
                method: "GET",

                headers: {
                    "Accept": "application/json",
                    "User-Agent": "WebBlox/1.0"
                }
            }
        );

    } catch (error) {

        console.error(
            "[Roblox] Network error:",
            error.message
        );

        throw new Error(
            "Could not connect to Roblox."
        );

    }


    const text = await response.text();

    let data = {};

    try {

        data = text
            ? JSON.parse(text)
            : {};

    } catch {

        throw new Error(
            "Roblox returned invalid JSON."
        );

    }


    if (!response.ok) {

        console.error(
            "[Roblox] HTTP",
            response.status,
            text
        );

        const message =
            data?.errors?.[0]?.message ||
            data?.error ||
            `Roblox HTTP ${response.status}`;

        throw new Error(
            `Roblox HTTP ${response.status}: ${message}`
        );

    }


    return data;

}


/*
============================================================
 ROBLOX SORTS
============================================================
*/

async function getRobloxSorts() {

    const url = new URL(
        ROBLOX.explore + "/v1/get-sorts"
    );

    url.searchParams.set(
        "sessionId",
        SESSION_ID
    );

    url.searchParams.set(
        "device",
        "computer"
    );

    url.searchParams.set(
        "country",
        "all"
    );

    return robloxFetch(
        url.toString()
    );

}


/*
============================================================
 FIND SORT ID
============================================================
*/

async function findSortId(preferredId) {

    const knownSorts = [

        "top-trending",
        "top-playing-now",
        "up-and-coming",
        "top-revisited",
        "fun-with-friends"

    ];


    if (
        knownSorts.includes(
            preferredId
        )
    ) {

        return preferredId;

    }


    try {

        const data =
            await getRobloxSorts();


        const possibleArrays = [

            data?.sorts,
            data?.Sorts,
            data?.data?.sorts,
            data?.data?.Sorts

        ];


        let sorts = [];


        for (
            const array
            of possibleArrays
        ) {

            if (
                Array.isArray(array)
            ) {

                sorts = array;

                break;

            }

        }


        const wanted =
            String(
                preferredId || ""
            ).toLowerCase();


        const found =
            sorts.find(sort => {

                const id =
                    String(
                        sort?.id ||
                        sort?.sortId ||
                        sort?.SortId ||
                        ""
                    ).toLowerCase();


                const name =
                    String(
                        sort?.name ||
                        sort?.title ||
                        sort?.displayName ||
                        ""
                    ).toLowerCase();


                return (
                    id === wanted ||
                    name.includes(wanted)
                );

            });


        if (found) {

            return (
                found.id ||
                found.sortId ||
                found.SortId
            );

        }

    } catch (error) {

        console.warn(
            "[Roblox] Could not retrieve sort list:",
            error.message
        );

    }


    return preferredId;

}


/*
============================================================
 GET SORT CONTENT
============================================================
*/

async function getSortContent(sortId) {

    if (!sortId) {

        throw new Error(
            "Roblox sortId is missing."
        );

    }


    const validSortId =
        await findSortId(sortId);


    if (!validSortId) {

        throw new Error(
            "Could not determine a Roblox sortId."
        );

    }


    const url = new URL(
        ROBLOX.explore +
        "/v1/get-sort-content"
    );


    url.searchParams.set(
        "sessionId",
        SESSION_ID
    );

    url.searchParams.set(
        "sortId",
        validSortId
    );

    url.searchParams.set(
        "device",
        "computer"
    );

    url.searchParams.set(
        "country",
        "all"
    );


    console.log(
        "[Roblox] Using sortId:",
        validSortId
    );


    return robloxFetch(
        url.toString()
    );

}


/*
============================================================
 EXTRACT SORT GAMES
============================================================
*/

function extractSortGames(data) {

    const possible = [

        data?.games,
        data?.Games,

        data?.experiences,
        data?.Experiences,

        data?.contents,
        data?.Contents,

        data?.sort?.games,
        data?.sort?.contents,

        data?.data?.games,
        data?.data?.contents,
        data?.data?.experiences

    ];


    for (
        const value
        of possible
    ) {

        if (
            Array.isArray(value)
        ) {

            return value;

        }

    }


    const results = [];


    function walk(value) {

        if (
            !value ||
            typeof value !== "object"
        ) {

            return;

        }


        if (
            Array.isArray(value)
        ) {

            for (
                const item
                of value
            ) {

                walk(item);

            }

            return;

        }


        if (
            value.universeId ||
            value.UniverseId
        ) {

            results.push(value);

        }


        for (
            const key
            of Object.keys(value)
        ) {

            const child = value[key];

            if (
                child &&
                typeof child === "object"
            ) {

                walk(child);

            }

        }

    }


    walk(data);


    const unique = new Map();


    for (
        const game
        of results
    ) {

        const id =
            String(
                game.universeId ||
                game.UniverseId
            );


        if (
            id &&
            id !== "undefined"
        ) {

            unique.set(
                id,
                game
            );

        }

    }


    return Array.from(
        unique.values()
    );

}


/*
============================================================
 ROBLOX GAME DETAILS
============================================================
*/

async function getGameDetails(universeIds) {

    const ids =
        universeIds
            .map(id => String(id))
            .filter(id => /^\d+$/.test(id));


    if (!ids.length) {
        return [];
    }


    /*
     * Roblox limits universeIds.
     * Keep requests at 50 or less.
     */

    const output = [];


    for (
        let i = 0;
        i < ids.length;
        i += 50
    ) {

        const chunk =
            ids.slice(i, i + 50);


        const url = new URL(
            ROBLOX.games +
            "/v1/games"
        );


        url.searchParams.set(
            "universeIds",
            chunk.join(",")
        );


        const data =
            await robloxFetch(
                url.toString()
            );


        if (
            Array.isArray(
                data?.data
            )
        ) {

            output.push(
                ...data.data
            );

        }

    }


    return output;

}


/*
============================================================
 ROBLOX GAME ICONS
============================================================
*/

async function getThumbnails(universeIds) {

    const ids =
        universeIds
            .map(id => String(id))
            .filter(id => /^\d+$/.test(id));


    if (!ids.length) {
        return {};
    }


    const map = {};


    for (
        let i = 0;
        i < ids.length;
        i += 50
    ) {

        const chunk =
            ids.slice(i, i + 50);


        const url = new URL(
            ROBLOX.thumbnails +
            "/v1/games/icons"
        );


        url.searchParams.set(
            "universeIds",
            chunk.join(",")
        );

        url.searchParams.set(
            "returnPolicy",
            "PlaceHolder"
        );

        url.searchParams.set(
            "size",
            "512x512"
        );

        url.searchParams.set(
            "format",
            "Png"
        );

        url.searchParams.set(
            "isCircular",
            "false"
        );


        try {

            const data =
                await robloxFetch(
                    url.toString()
                );


            if (
                Array.isArray(
                    data?.data
                )
            ) {

                for (
                    const item
                    of data.data
                ) {

                    if (
                        item.targetId
                    ) {

                        map[
                            String(
                                item.targetId
                            )
                        ] =
                            item.imageUrl || "";

                    }

                }

            }

        } catch (error) {

            console.warn(
                "[Roblox] Thumbnail error:",
                error.message
            );

        }

    }


    return map;

}


/*
============================================================
 NORMALIZE ROBLOX GAME
============================================================
*/

function normalizeGame(
    raw = {},
    details = {},
    thumbnailMap = {}
) {

    const universeId =
        String(
            details?.id ||
            details?.universeId ||
            raw?.universeId ||
            raw?.id ||
            ""
        );


    const placeId =
        String(
            details?.rootPlaceId ||
            details?.placeId ||
            raw?.placeId ||
            ""
        );


    const name =
        details?.name ||
        raw?.name ||
        raw?.displayName ||
        "Unknown Roblox Experience";


    const description =
        details?.description ||
        raw?.description ||
        "";


    const creator =
        details?.creator?.name ||
        details?.creator?.username ||
        raw?.creator?.name ||
        raw?.creator?.username ||
        raw?.creator ||
        "Unknown Creator";


    const creatorId =
        String(
            details?.creator?.id ||
            raw?.creatorId ||
            ""
        );


    const playing =
        Number(
            details?.playing ||
            raw?.playing ||
            raw?.playerCount ||
            0
        );


    const visits =
        Number(
            details?.visits ||
            raw?.visits ||
            raw?.placeVisits ||
            0
        );


    const favorites =
        Number(
            details?.favoritedCount ||
            details?.favorites ||
            raw?.favorites ||
            0
        );


    const maxPlayers =
        Number(
            details?.maxPlayers ||
            raw?.maxPlayers ||
            0
        );


    const thumbnail =
        thumbnailMap?.[universeId] ||
        raw?.thumbnail ||
        raw?.imageUrl ||
        raw?.thumbnailUrl ||
        "";


    const robloxUrl =
        placeId
            ? `https://www.roblox.com/games/${placeId}`
            : "";


    return {

        id: universeId,

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

        icon: thumbnail,

        robloxUrl,

        genre:
            details?.genre ||
            raw?.genre ||
            "",

        updated:
            details?.updated ||
            raw?.updated ||
            null

    };

}


/*
============================================================
 ENRICH ROBLOX GAMES
============================================================
*/

async function enrichGames(rawGames) {

    const universeIds =
        rawGames
            .map(game =>
                String(
                    game?.universeId ||
                    game?.UniverseId ||
                    game?.id ||
                    ""
                )
            )
            .filter(id =>
                /^\d+$/.test(id)
            );


    const uniqueIds =
        Array.from(
            new Set(universeIds)
        );


    if (!uniqueIds.length) {
        return [];
    }


    const details =
        await getGameDetails(
            uniqueIds
        );


    const thumbnailMap =
        await getThumbnails(
            uniqueIds
        );


    const rawMap = new Map();


    for (
        const raw
        of rawGames
    ) {

        const id =
            String(
                raw?.universeId ||
                raw?.UniverseId ||
                raw?.id ||
                ""
            );


        if (id) {
            rawMap.set(id, raw);
        }

    }


    return details.map(detail => {

        const id =
            String(
                detail.id || ""
            );


        return normalizeGame(
            rawMap.get(id) || {},
            detail,
            thumbnailMap
        );

    });

}


/*
============================================================
 ROBLOX HOME
============================================================
*/

app.get(
    "/api/home",
    async (req, res) => {

        try {

            const recommendedRaw =
                await getSortContent(
                    "up-and-coming"
                );


            const popularRaw =
                await getSortContent(
                    "top-playing-now"
                );


            const recommended =
                await enrichGames(
                    extractSortGames(
                        recommendedRaw
                    ).slice(0, 24)
                );


            const popular =
                await enrichGames(
                    extractSortGames(
                        popularRaw
                    ).slice(0, 24)
                );


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

                error: error.message

            });

        }

    }
);


/*
============================================================
 ROBLOX POPULAR
============================================================
*/

app.get(
    "/api/popular",
    async (req, res) => {

        try {

            const raw =
                await getSortContent(
                    "top-playing-now"
                );


            const games =
                await enrichGames(
                    extractSortGames(raw)
                        .slice(0, 50)
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


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 ROBLOX SEARCH
============================================================
*/

function extractSearchGames(data) {

    const possible = [

        data?.games,
        data?.Games,

        data?.experiences,
        data?.Experiences,

        data?.data,

        data?.results,
        data?.Results

    ];


    for (
        const value
        of possible
    ) {

        if (
            Array.isArray(value)
        ) {

            return value;

        }

    }


    return [];

}


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


            const url =
                new URL(
                    ROBLOX.search +
                    "/v1/search"
                );


            url.searchParams.set(
                "keyword",
                query
            );


            url.searchParams.set(
                "sessionId",
                SESSION_ID
            );


            url.searchParams.set(
                "pageType",
                "all"
            );


            url.searchParams.set(
                "pageToken",
                ""
            );


            const data =
                await robloxFetch(
                    url.toString()
                );


            const rawGames =
                extractSearchGames(data);


            const games =
                await enrichGames(
                    rawGames.slice(0, 40)
                );


            res.json({

                success: true,

                games,

                nextPageToken:
                    data?.nextPageToken ||
                    null

            });

        } catch (error) {

            console.error(
                "[WebBlox] Search error:",
                error
            );


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 WEBBLOX GAMES
============================================================

 IMPORTANT:
 The specific routes MUST come before:

 /api/webblox/games/:id

 Otherwise "trending", "new", "popular", etc.
 get interpreted as a game ID.
============================================================
*/


/*
------------------------------------------------------------
 GET ALL
------------------------------------------------------------
*/

app.get(
    "/api/webblox/games",
    (req, res) => {

        try {

            const games =
                webbloxGames.getAllGames();


            res.json({

                success: true,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox Games] Get all error:",
                error
            );


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
------------------------------------------------------------
 SEARCH
------------------------------------------------------------
*/

app.get(
    "/api/webblox/games/search",
    (req, res) => {

        try {

            const games =
                webbloxGames.searchGames(
                    req.query.q || ""
                );


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


/*
------------------------------------------------------------
 POPULAR
------------------------------------------------------------
*/

app.get(
    "/api/webblox/games/popular",
    (req, res) => {

        try {

            const limit =
                Math.min(
                    Number(
                        req.query.limit || 50
                    ) || 50,
                    100
                );


            const games =
                webbloxGames.getPopularGames(
                    limit
                );


            res.json({

                success: true,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox Games] Popular error:",
                error
            );


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
------------------------------------------------------------
 TRENDING
------------------------------------------------------------
*/

app.get(
    "/api/webblox/games/trending",
    (req, res) => {

        try {

            const limit =
                Math.min(
                    Number(
                        req.query.limit || 50
                    ) || 50,
                    100
                );


            const games =
                webbloxGames.getTrendingGames(
                    limit
                );


            res.json({

                success: true,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox Games] Trending error:",
                error
            );


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
------------------------------------------------------------
 NEW
------------------------------------------------------------
*/

app.get(
    "/api/webblox/games/new",
    (req, res) => {

        try {

            const limit =
                Math.min(
                    Number(
                        req.query.limit || 50
                    ) || 50,
                    100
                );


            const games =
                webbloxGames.getNewGames(
                    limit
                );


            res.json({

                success: true,

                games

            });

        } catch (error) {

            console.error(
                "[WebBlox Games] New error:",
                error
            );


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
------------------------------------------------------------
 MOST PLAYED
------------------------------------------------------------
*/

app.get(
    "/api/webblox/games/most-played",
    (req, res) => {

        try {

            const limit =
                Math.min(
                    Number(
                        req.query.limit || 50
                    ) || 50,
                    100
                );


            const games =
                webbloxGames.getMostPlayedGames(
                    limit
                );


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


/*
------------------------------------------------------------
 CREATOR GAMES
------------------------------------------------------------
*/

app.get(
    "/api/webblox/creator/:creatorId/games",
    (req, res) => {

        try {

            const games =
                webbloxGames.getGamesByCreator(
                    req.params.creatorId
                );


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


/*
============================================================
 SINGLE WEBBLOX GAME
============================================================

 THIS MUST BE AFTER:
 - popular
 - trending
 - new
 - most-played
 - search

============================================================
*/

app.get(
    "/api/webblox/games/:id",
    (req, res) => {

        try {

            const game =
                webbloxGames.getGame(
                    req.params.id
                );


            if (
                !game ||
                !game.public ||
                !game.published
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "WebBlox game not found."

                });

            }


            res.json({

                success: true,

                game

            });

        } catch (error) {

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 CREATE WEBBLOX GAME
============================================================
*/

app.post(
    "/api/webblox/games",
    (req, res) => {

        try {

            const game =
                webbloxGames.createGame(
                    req.body || {}
                );


            res.status(201).json({

                success: true,

                game

            });

        } catch (error) {

            res.status(400).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 UPDATE WEBBLOX GAME
============================================================
*/

app.patch(
    "/api/webblox/games/:id",
    (req, res) => {

        try {

            const game =
                webbloxGames.updateGame(
                    req.params.id,
                    req.body || {}
                );


            if (!game) {

                return res.status(404).json({

                    success: false,

                    error:
                        "WebBlox game not found."

                });

            }


            res.json({

                success: true,

                game

            });

        } catch (error) {

            res.status(400).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 DELETE WEBBLOX GAME
============================================================
*/

app.delete(
    "/api/webblox/games/:id",
    (req, res) => {

        try {

            const deleted =
                webbloxGames.deleteGame(
                    req.params.id
                );


            if (!deleted) {

                return res.status(404).json({

                    success: false,

                    error:
                        "WebBlox game not found."

                });

            }


            res.json({

                success: true

            });

        } catch (error) {

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 PUBLISH
============================================================
*/

app.post(
    "/api/webblox/games/:id/publish",
    (req, res) => {

        const game =
            webbloxGames.publishGame(
                req.params.id
            );


        if (!game) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        res.json({

            success: true,

            game

        });

    }
);


/*
============================================================
 UNPUBLISH
============================================================
*/

app.post(
    "/api/webblox/games/:id/unpublish",
    (req, res) => {

        const game =
            webbloxGames.unpublishGame(
                req.params.id
            );


        if (!game) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        res.json({

            success: true,

            game

        });

    }
);


/*
============================================================
 LIKE
============================================================
*/

app.post(
    "/api/webblox/games/:id/like",
    (req, res) => {

        const game =
            webbloxGames.likeGame(
                req.params.id
            );


        if (!game) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        res.json({

            success: true,

            game

        });

    }
);


/*
============================================================
 UNLIKE
============================================================
*/

app.post(
    "/api/webblox/games/:id/unlike",
    (req, res) => {

        const game =
            webbloxGames.unlikeGame(
                req.params.id
            );


        if (!game) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        res.json({

            success: true,

            game

        });

    }
);


/*
============================================================
 VISIT
============================================================
*/

app.post(
    "/api/webblox/games/:id/visit",
    (req, res) => {

        const game =
            webbloxGames.addVisit(
                req.params.id
            );


        if (!game) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        res.json({

            success: true,

            game

        });

    }
);


/*
============================================================
 PLAYER JOIN
============================================================
*/

app.post(
    "/api/webblox/games/:id/join",
    (req, res) => {

        const result =
            webbloxGames.playerJoin(
                req.params.id
            );


        if (!result) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        if (!result.success) {

            return res.status(409).json(
                result
            );

        }


        res.json(result);

    }
);


/*
============================================================
 PLAYER LEAVE
============================================================
*/

app.post(
    "/api/webblox/games/:id/leave",
    (req, res) => {

        const game =
            webbloxGames.playerLeave(
                req.params.id
            );


        if (!game) {

            return res.status(404).json({

                success: false,

                error:
                    "WebBlox game not found."

            });

        }


        res.json({

            success: true,

            game

        });

    }
);


/*
============================================================
 WEBBLOX STATS
============================================================
*/

app.get(
    "/api/webblox/stats",
    (req, res) => {

        try {

            res.json({

                success: true,

                games:
                    webbloxGames.getGameCount(),

                publicGames:
                    webbloxGames.getPublicGameCount()

            });

        } catch (error) {

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 ROBLOX GAME DETAILS
============================================================
*/

app.get(
    "/api/game/:universeId",
    async (req, res) => {

        try {

            const universeId =
                String(
                    req.params.universeId || ""
                );


            if (
                !/^\d+$/.test(universeId)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid universe ID."

                });

            }


            const games =
                await getGameDetails([
                    universeId
                ]);


            if (!games.length) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox experience not found."

                });

            }


            const thumbnailMap =
                await getThumbnails([
                    universeId
                ]);


            const game =
                normalizeGame(
                    {},
                    games[0],
                    thumbnailMap
                );


            res.json({

                success: true,

                game

            });

        } catch (error) {

            console.error(
                "[WebBlox] Game details error:",
                error
            );


            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


/*
============================================================
 HEALTH / ROOT
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

            frontend:
                "https://lcrazyness.github.io/WebBlox/",

            backend:
                "https://webblox-backend.onrender.com/",

            endpoints: {

                home:
                    "/api/home",

                popular:
                    "/api/popular",

                search:
                    "/api/search?q=roblox",

                game:
                    "/api/game/:universeId",

                webbloxGames:
                    "/api/webblox/games",

                webbloxSearch:
                    "/api/webblox/games/search?q=test",

                webbloxPopular:
                    "/api/webblox/games/popular",

                webbloxTrending:
                    "/api/webblox/games/trending",

                webbloxNew:
                    "/api/webblox/games/new",

                webbloxMostPlayed:
                    "/api/webblox/games/most-played",

                webbloxStats:
                    "/api/webblox/stats"

            }

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
                "WebBlox API route not found."

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
    () => {

        console.log(
            "===================================="
        );

        console.log(
            "[WebBlox] Backend started."
        );

        console.log(
            "[WebBlox] Port:",
            PORT
        );

        console.log(
            "[WebBlox] Session:",
            SESSION_ID
        );

        console.log(
            "[WebBlox] Explore API:",
            ROBLOX.explore
        );

        console.log(
            "[WebBlox] Search API:",
            ROBLOX.search
        );

        console.log(
            "[WebBlox] Games API:",
            ROBLOX.games
        );

        console.log(
            "[WebBlox] WebBlox Games: ENABLED"
        );

        console.log(
            "[WebBlox] Server ready."
        );

        console.log(
            "===================================="
        );

    }
);
