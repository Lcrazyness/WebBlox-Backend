"use strict";

/*
============================================================
 WebBlox Backend
============================================================

Frontend:
https://lcrazyness.github.io/WebBlox/

Backend:
https://webblox-backend.onrender.com/

Roblox systems:
- Explore API
- Search API
- Games API
- Thumbnails API
- Users API

WebBlox Games:
- Native WebBlox game database
- Publishing
- Searching
- Popular
- Trending
- New
- Most played
- Likes
- Visits
- Player counts

============================================================
*/

const express = require("express");
const crypto = require("crypto");

const webbloxGames =
    require("./games/games.js");

const app = express();

const PORT =
    process.env.PORT || 10000;


/*
============================================================
 CORS
============================================================
*/

app.use(
    (req, res, next) => {

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

        if (
            req.method === "OPTIONS"
        ) {

            return res.sendStatus(
                204
            );

        }

        next();

    }
);


app.use(
    express.json()
);


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

const SESSION_ID =
    crypto.randomUUID();


/*
============================================================
 HTTP HELPER
============================================================
*/

async function robloxFetch(url) {

    console.log(
        "[Roblox] GET:",
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


    const text =
        await response.text();


    let data;


    try {

        data =
            text
                ? JSON.parse(text)
                : {};

    } catch {

        throw new Error(
            "Roblox returned invalid JSON."
        );

    }


    if (
        !response.ok
    ) {

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
 GET ROBLOX SORTS
============================================================
*/

async function getRobloxSorts() {

    const url =
        new URL(
            ROBLOX.explore +
            "/v1/get-sorts"
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

async function findSortId(
    preferredId
) {

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


        console.log(
            "[Roblox] Sort response:",
            JSON.stringify(
                data
            ).substring(
                0,
                5000
            )
        );


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
                Array.isArray(
                    array
                )
            ) {

                sorts =
                    array;

                break;

            }

        }


        const wanted =
            String(
                preferredId || ""
            )
            .toLowerCase();


        const found =
            sorts.find(
                sort => {

                    const id =
                        String(
                            sort?.id ||
                            sort?.sortId ||
                            sort?.SortId ||
                            ""
                        )
                        .toLowerCase();


                    const name =
                        String(
                            sort?.name ||
                            sort?.title ||
                            sort?.displayName ||
                            ""
                        )
                        .toLowerCase();


                    return (
                        id === wanted ||
                        name.includes(
                            wanted
                        )
                    );

                }
            );


        if (
            found
        ) {

            return (
                found.id ||
                found.sortId ||
                found.SortId
            );

        }

    } catch (
        error
    ) {

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

async function getSortContent(
    sortId
) {

    if (
        !sortId
    ) {

        throw new Error(
            "Roblox sortId is missing."
        );

    }


    const validSortId =
        await findSortId(
            sortId
        );


    if (
        !validSortId
    ) {

        throw new Error(
            "Could not determine a Roblox sortId."
        );

    }


    const url =
        new URL(
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

function extractSortGames(
    data
) {

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
            Array.isArray(
                value
            )
        ) {

            return value;

        }

    }


    const results = [];


    function walk(
        value
    ) {

        if (
            !value ||
            typeof value !== "object"
        ) {

            return;

        }


        if (
            Array.isArray(
                value
            )
        ) {

            for (
                const item
                of value
            ) {

                walk(
                    item
                );

            }

            return;

        }


        if (
            value.universeId ||
            value.UniverseId
        ) {

            results.push(
                value
            );

        }


        for (
            const key
            of Object.keys(
                value
            )
        ) {

            const child =
                value[key];


            if (
                child &&
                typeof child === "object"
            ) {

                walk(
                    child
                );

            }

        }

    }


    walk(
        data
    );


    const unique =
        new Map();


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
 GET GAME DETAILS
============================================================
*/

async function getGameDetails(
    universeIds
) {

    const ids =
        universeIds
            .map(
                id =>
                    String(
                        id
                    )
            )
            .filter(
                id =>
                    /^\d+$/.test(
                        id
                    )
            );


    if (
        ids.length === 0
    ) {

        return [];

    }


    /*
       Roblox limits this endpoint.

       Keep requests small to prevent:

       HTTP 400
       Too many universe IDs
    */

    const chunks = [];


    for (
        let i = 0;
        i < ids.length;
        i += 50
    ) {

        chunks.push(
            ids.slice(
                i,
                i + 50
            )
        );

    }


    const output = [];


    for (
        const chunk
        of chunks
    ) {

        const url =
            new URL(
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
 GET THUMBNAILS
============================================================
*/

async function getThumbnails(
    universeIds
) {

    const ids =
        universeIds
            .map(
                id =>
                    String(
                        id
                    )
            )
            .filter(
                id =>
                    /^\d+$/.test(
                        id
                    )
            );


    if (
        ids.length === 0
    ) {

        return {};

    }


    const map = {};


    for (
        let i = 0;
        i < ids.length;
        i += 50
    ) {

        const chunk =
            ids.slice(
                i,
                i + 50
            );


        const url =
            new URL(
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
                            item.imageUrl ||
                            "";

                    }

                }

            }

        } catch (
            error
        ) {

            console.warn(
                "[Roblox] Thumbnail request failed:",
                error.message
            );

        }

    }


    return map;

}


/*
============================================================
 GET GAME THUMBNAILS
============================================================
*/

async function getGameThumbnails(
    universeIds
) {

    const ids =
        universeIds
            .map(
                id =>
                    String(
                        id
                    )
            )
            .filter(
                id =>
                    /^\d+$/.test(
                        id
                    )
            );


    if (
        ids.length === 0
    ) {

        return {};

    }


    const map = {};


    for (
        let i = 0;
        i < ids.length;
        i += 50
    ) {

        const chunk =
            ids.slice(
                i,
                i + 50
            );


        const url =
            new URL(
                ROBLOX.thumbnails +
                "/v1/games/multiget/thumbnails"
            );


        url.searchParams.set(
            "universeIds",
            chunk.join(",")
        );


        url.searchParams.set(
            "countPerUniverse",
            "1"
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

                    const universeId =
                        String(
                            item.universeId ||
                            item.targetId ||
                            ""
                        );


                    const thumbnails =
                        item.thumbnails ||
                        [];


                    if (
                        universeId &&
                        thumbnails.length
                    ) {

                        map[
                            universeId
                        ] =
                            thumbnails[0]?.imageUrl ||
                            "";

                    }

                }

            }

        } catch (
            error
        ) {

            console.warn(
                "[Roblox] Game thumbnail error:",
                error.message
            );

        }

    }


    return map;

}


/*
============================================================
 NORMALIZE GAME
============================================================
*/

function normalizeGame(
    raw,
    details,
    thumbnailMap
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
        thumbnailMap?.[
            universeId
        ] ||
        raw?.thumbnail ||
        raw?.imageUrl ||
        raw?.thumbnailUrl ||
        "";


    const robloxUrl =
        placeId
            ? `https://www.roblox.com/games/${placeId}`
            : "";


    return {

        id:
            universeId,

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

        icon:
            thumbnail,

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
 ENRICH GAMES
============================================================
*/

async function enrichGames(
    rawGames
) {

    const universeIds =
        rawGames
            .map(
                game =>
                    String(
                        game?.universeId ||
                        game?.UniverseId ||
                        game?.id ||
                        ""
                    )
            )
            .filter(
                id =>
                    /^\d+$/.test(
                        id
                    )
            );


    if (
        universeIds.length === 0
    ) {

        return [];

    }


    const uniqueIds =
        Array.from(
            new Set(
                universeIds
            )
        );


    const details =
        await getGameDetails(
            uniqueIds
        );


    const thumbnailMap =
        await getThumbnails(
            uniqueIds
        );


    const rawMap =
        new Map();


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


        if (
            id
        ) {

            rawMap.set(
                id,
                raw
            );

        }

    }


    return details.map(
        detail => {

            const id =
                String(
                    detail.id ||
                    ""
                );


            return normalizeGame(
                rawMap.get(
                    id
                ) || {},
                detail,
                thumbnailMap
            );

        }
    );

}


/*
============================================================
 HOME
============================================================
*/

app.get(
    "/api/home",
    async (
        req,
        res
    ) => {

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
                    )
                    .slice(
                        0,
                        24
                    )
                );


            const popular =
                await enrichGames(
                    extractSortGames(
                        popularRaw
                    )
                    .slice(
                        0,
                        24
                    )
                );


            res.json({

                success:
                    true,

                recommended,

                popular

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Home error:",
                error
            );


            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
============================================================
 POPULAR
============================================================
*/

app.get(
    "/api/popular",
    async (
        req,
        res
    ) => {

        try {

            const raw =
                await getSortContent(
                    "top-playing-now"
                );


            const games =
                await enrichGames(
                    extractSortGames(
                        raw
                    )
                    .slice(
                        0,
                        50
                    )
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Popular error:",
                error
            );


            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
============================================================
 SEARCH
============================================================
*/

function extractSearchGames(
    data
) {

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
            Array.isArray(
                value
            )
        ) {

            return value;

        }

    }


    return [];

}


app.get(
    "/api/search",
    async (
        req,
        res
    ) => {

        try {

            const query =
                String(
                    req.query.q ||
                    ""
                )
                .trim();


            if (
                !query
            ) {

                return res.json({

                    success:
                        true,

                    games:
                        []

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


            console.log(
                "[WebBlox] Search response received."
            );


            const rawGames =
                extractSearchGames(
                    data
                );


            const games =
                await enrichGames(
                    rawGames.slice(
                        0,
                        40
                    )
                );


            res.json({

                success:
                    true,

                games,

                nextPageToken:
                    data?.nextPageToken ||
                    null

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Search error:",
                error
            );


            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

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
    async (
        req,
        res
    ) => {

        try {

            const universeId =
                String(
                    req.params.universeId ||
                    ""
                );


            if (
                !/^\d+$/.test(
                    universeId
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        error:
                            "Invalid universe ID."

                    });

            }


            const games =
                await getGameDetails([
                    universeId
                ]);


            if (
                games.length === 0
            ) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

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

                success:
                    true,

                game

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Game error:",
                error
            );


            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
============================================================
 HEALTH
============================================================
*/

app.get(
    "/",
    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            name:
                "WebBlox Backend",

            status:
                "online",

            frontend:
                "https://lcrazyness.github.io/WebBlox/",

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

                webbloxPopular:
                    "/api/webblox/games/popular",

                webbloxTrending:
                    "/api/webblox/games/trending",

                webbloxNew:
                    "/api/webblox/games/new"

            }

        });

    }
);


/*
============================================================
 WEBBLOX GAMES
============================================================
*/

/*
 GET ALL PUBLIC GAMES
*/

app.get(
    "/api/webblox/games",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.getAllGames();


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 GET SINGLE PUBLIC GAME
*/

app.get(
    "/api/webblox/games/:id",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.getGame(
                req.params.id
            );


        if (
            !game ||
            !game.public ||
            !game.published
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 SEARCH WEBBLOX GAMES
*/

app.get(
    "/api/webblox/games/search",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.searchGames(
                    req.query.q || ""
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 POPULAR WEBBLOX GAMES
*/

app.get(
    "/api/webblox/games/popular",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.getPopularGames(
                    req.query.limit ||
                    50
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 TRENDING WEBBLOX GAMES
*/

app.get(
    "/api/webblox/games/trending",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.getTrendingGames(
                    req.query.limit ||
                    50
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 NEW WEBBLOX GAMES
*/

app.get(
    "/api/webblox/games/new",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.getNewGames(
                    req.query.limit ||
                    50
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 MOST PLAYED WEBBLOX GAMES
*/

app.get(
    "/api/webblox/games/most-played",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.getMostPlayedGames(
                    req.query.limit ||
                    50
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 CREATE WEBBLOX GAME
*/

app.post(
    "/api/webblox/games",
    (
        req,
        res
    ) => {

        try {

            const game =
                webbloxGames.createGame(
                    req.body || {}
                );


            res
                .status(201)
                .json({

                    success:
                        true,

                    game

                });

        } catch (
            error
        ) {

            res
                .status(400)
                .json({

                    success:
                        false,

                    error:
                        error.message

                });

        }

    }
);


/*
 UPDATE WEBBLOX GAME
*/

app.patch(
    "/api/webblox/games/:id",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.updateGame(
                req.params.id,
                req.body || {}
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 DELETE WEBBLOX GAME
*/

app.delete(
    "/api/webblox/games/:id",
    (
        req,
        res
    ) => {

        const deleted =
            webbloxGames.deleteGame(
                req.params.id
            );


        if (
            !deleted
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true

        });

    }
);


/*
 PUBLISH GAME
*/

app.post(
    "/api/webblox/games/:id/publish",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.publishGame(
                req.params.id
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 UNPUBLISH GAME
*/

app.post(
    "/api/webblox/games/:id/unpublish",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.unpublishGame(
                req.params.id
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 LIKE GAME
*/

app.post(
    "/api/webblox/games/:id/like",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.likeGame(
                req.params.id
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 UNLIKE GAME
*/

app.post(
    "/api/webblox/games/:id/unlike",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.unlikeGame(
                req.params.id
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 ADD VISIT
*/

app.post(
    "/api/webblox/games/:id/visit",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.addVisit(
                req.params.id
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 PLAYER JOIN
*/

app.post(
    "/api/webblox/games/:id/join",
    (
        req,
        res
    ) => {

        const result =
            webbloxGames.playerJoin(
                req.params.id
            );


        if (
            !result
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        if (
            !result.success
        ) {

            return res
                .status(409)
                .json(
                    result
                );

        }


        res.json(
            result
        );

    }
);


/*
 PLAYER LEAVE
*/

app.post(
    "/api/webblox/games/:id/leave",
    (
        req,
        res
    ) => {

        const game =
            webbloxGames.playerLeave(
                req.params.id
            );


        if (
            !game
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    error:
                        "WebBlox game not found."

                });

        }


        res.json({

            success:
                true,

            game

        });

    }
);


/*
 CREATOR GAMES
*/

app.get(
    "/api/webblox/creator/:creatorId/games",
    (
        req,
        res
    ) => {

        try {

            const games =
                webbloxGames.getGamesByCreator(
                    req.params.creatorId
                );


            res.json({

                success:
                    true,

                games

            });

        } catch (
            error
        ) {

            res.status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


/*
 WEBBLOX GAME STATS
*/

app.get(
    "/api/webblox/stats",
    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            games:
                webbloxGames.getGameCount(),

            publicGames:
                webbloxGames.getPublicGameCount()

        });

    }
);


/*
============================================================
 404
============================================================
*/

app.use(
    (
        req,
        res
    ) => {

        res
            .status(404)
            .json({

                success:
                    false,

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
            "===================================="
        );

    }
);
