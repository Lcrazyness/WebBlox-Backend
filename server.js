"use strict";

/*
============================================================
 WebBlox Backend
============================================================

Frontend:
https://lcrazyness.github.io/WebBlox/

Backend:
https://webblox-backend.onrender.com/

This version uses Roblox's CURRENT:
- Explore API for charts/discovery
- Search API for game searching
- Games API for detailed game information
- Thumbnails API for thumbnails/icons

IMPORTANT:
The old /v1/games/list discovery endpoint is deprecated.

============================================================
*/

const express = require("express");
const crypto = require("crypto");

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
        "GET, OPTIONS"
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
 FIND A SORT ID
============================================================
*/

async function findSortId(preferredId) {

    /*
       These are known current Roblox
       Explore sort IDs.
    */

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


    /*
       If Roblox changes the sort IDs,
       ask Roblox for the current list.
    */

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
                Array.isArray(array)
            ) {

                sorts =
                    array;

                break;

            }

        }


        /*
           Try to find the requested sort
           by ID or name.
        */

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
        await findSortId(
            sortId
        );


    if (!validSortId) {

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
 EXTRACT ARRAY FROM SORT RESPONSE
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


    /*
       Some Roblox responses contain
       nested content groups.
    */

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


        /*
           An experience/game object normally
           has a universe ID.
        */

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
            of Object.keys(value)
        ) {

            const child =
                value[key];


            if (
                child &&
                typeof child === "object"
            ) {

                walk(child);

            }

        }

    }


    walk(data);


    /*
       Remove duplicates.
    */

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


    return [
        ...unique.values()
    ];

}


/*
============================================================
 EXTRACT SEARCH GAMES
============================================================
*/

function extractSearchGames(data) {

    const results = [];


    /*
       Current Search API commonly returns:

       searchResults[]
         -> contents[]
    */

    if (
        Array.isArray(
            data?.searchResults
        )
    ) {

        for (
            const group
            of data.searchResults
        ) {

            if (
                Array.isArray(
                    group?.contents
                )
            ) {

                for (
                    const game
                    of group.contents
                ) {

                    if (
                        game
                    ) {

                        results.push(
                            game
                        );

                    }

                }

            }

        }

    }


    /*
       Fallback structures.
    */

    if (
        results.length === 0 &&
        Array.isArray(
            data?.games
        )
    ) {

        results.push(
            ...data.games
        );

    }


    return results;

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
                    String(id)
            )
            .filter(
                id =>
                    /^\d+$/.test(id)
            );


    if (
        ids.length === 0
    ) {

        return [];

    }


    /*
       Roblox reduced the batch size
       for this endpoint.

       Keep batches at 10.
    */

    const allGames = [];


    for (
        let i = 0;
        i < ids.length;
        i += 10
    ) {

        const batch =
            ids.slice(
                i,
                i + 10
            );


        const url =
            new URL(
                ROBLOX.games +
                "/v1/games"
            );


        url.searchParams.set(
            "universeIds",
            batch.join(",")
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

                allGames.push(
                    ...data.data
                );

            }

        } catch (error) {

            console.warn(
                "[Roblox] Game detail batch failed:",
                error.message
            );

        }

    }


    return allGames;

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
                    String(id)
            )
            .filter(
                id =>
                    /^\d+$/.test(id)
            );


    if (
        ids.length === 0
    ) {

        return new Map();

    }


    const map =
        new Map();


    /*
       Thumbnails can handle larger
       batches than the game details API.
    */

    for (
        let i = 0;
        i < ids.length;
        i += 100
    ) {

        const batch =
            ids.slice(
                i,
                i + 100
            );


        const url =
            new URL(
                ROBLOX.thumbnails +
                "/v1/games/multiget/thumbnails"
            );


        url.searchParams.set(
            "universeIds",
            batch.join(",")
        );


        url.searchParams.set(
            "size",
            "768x432"
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

                    const id =
                        String(
                            item.universeId
                        );


                    const image =
                        item?.thumbnails?.[0]?.imageUrl ||
                        item?.imageUrl ||
                        null;


                    if (
                        image
                    ) {

                        map.set(
                            id,
                            image
                        );

                    }

                }

            }

        } catch (error) {

            console.warn(
                "[Roblox] Thumbnail API failed:",
                error.message
            );

        }

    }


    return map;

}


/*
============================================================
 FALLBACK THUMBNAIL
============================================================
*/

function fallbackThumbnail(
    universeId
) {

    return (
        "https://tr.rbxcdn.com/" +
        String(
            universeId
        ) +
        "/768/432/Image/Webp"
    );

}


/*
============================================================
 NORMALIZE GAME
============================================================
*/

function normalizeGame(
    game,
    details,
    thumbnailMap
) {

    const source =
        details ||
        game ||
        {};


    const universeId =
        source.universeId ||
        source.UniverseId ||
        game?.universeId ||
        game?.UniverseId ||
        game?.id ||
        game?.Id;


    const placeId =
        source.rootPlaceId ||
        source.RootPlaceId ||
        source.placeId ||
        source.PlaceId ||
        game?.rootPlaceId ||
        game?.RootPlaceId ||
        game?.placeId ||
        game?.PlaceId;


    const creatorObject =
        source.creator ||
        game?.creator ||
        {};


    let creator =
        creatorObject?.name ||
        creatorObject?.Name ||
        source.creatorName ||
        game?.creatorName ||
        source.creator?.displayName ||
        "";


    let creatorId =
        creatorObject?.id ||
        creatorObject?.Id ||
        source.creatorId ||
        game?.creatorId ||
        null;


    /*
       Some search responses use
       creator information in different fields.
    */

    if (
        !creator
    ) {

        creator =
            source.creator?.displayName ||
            source.Creator?.name ||
            source.Creator?.displayName ||
            "Unknown Creator";

    }


    if (
        !creator
    ) {

        creator =
            "Unknown Creator";

    }


    const idString =
        universeId
            ? String(
                universeId
            )
            : "";


    const thumbnail =
        thumbnailMap.get(
            idString
        ) ||
        source.thumbnail ||
        source.thumbnailUrl ||
        game?.thumbnail ||
        game?.thumbnailUrl ||
        fallbackThumbnail(
            idString
        );


    const name =
        source.name ||
        source.Name ||
        game?.name ||
        game?.Name ||
        "Unknown Roblox Experience";


    const description =
        source.description ||
        source.Description ||
        game?.description ||
        game?.Description ||
        "";


    const playing =
        Number(
            source.playing ??
            source.playerCount ??
            source.PlayerCount ??
            game?.playing ??
            game?.playerCount ??
            0
        );


    const visits =
        Number(
            source.visits ??
            source.Visits ??
            game?.visits ??
            0
        );


    const favorites =
        Number(
            source.favoritedCount ??
            source.favorites ??
            source.Favorites ??
            game?.favoritedCount ??
            0
        );


    const maxPlayers =
        Number(
            source.maxPlayers ??
            source.MaxPlayers ??
            game?.maxPlayers ??
            0
        );


    const genre =
        source.genre ||
        source.genreL1 ||
        source.Genre ||
        game?.genre ||
        "";


    return {

        id:
            universeId,

        universeId:
            universeId,

        placeId:
            placeId,

        name:
            name,

        description:
            description,

        creator:
            creator,

        creatorId:
            creatorId,

        creatorType:
            creatorObject?.type ||
            creatorObject?.Type ||
            null,

        playing:
            playing,

        visits:
            visits,

        favorites:
            favorites,

        maxPlayers:
            maxPlayers,

        thumbnail:
            thumbnail,

        icon:
            thumbnail,

        genre:
            genre,

        robloxUrl:
            placeId
                ? `https://www.roblox.com/games/${placeId}`
                : (
                    universeId
                        ? `https://www.roblox.com/games/${universeId}`
                        : null
                )

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

    if (
        !Array.isArray(
            rawGames
        ) ||
        rawGames.length === 0
    ) {

        return [];

    }


    /*
       Extract universe IDs.
    */

    const universeIds =
        rawGames
            .map(
                game =>
                    game?.universeId ||
                    game?.UniverseId ||
                    game?.id ||
                    game?.Id
            )
            .filter(
                Boolean
            )
            .map(
                String
            );


    const uniqueIds =
        [
            ...new Set(
                universeIds
            )
        ];


    /*
       Get detailed game information.
    */

    const details =
        await getGameDetails(
            uniqueIds
        );


    const detailMap =
        new Map();


    for (
        const detail
        of details
    ) {

        if (
            detail?.id
        ) {

            detailMap.set(
                String(
                    detail.id
                ),
                detail
            );

        }

    }


    /*
       Get thumbnails.
    */

    const thumbnailMap =
        await getThumbnails(
            uniqueIds
        );


    /*
       Build final games.
    */

    const output = [];


    for (
        const game
        of rawGames
    ) {

        const id =
            game?.universeId ||
            game?.UniverseId ||
            game?.id ||
            game?.Id;


        if (!id) {
            continue;
        }


        const idString =
            String(
                id
            );


        const detail =
            detailMap.get(
                idString
            );


        output.push(
            normalizeGame(
                game,
                detail,
                thumbnailMap
            )
        );

    }


    /*
       Remove duplicates.
    */

    const unique =
        new Map();


    for (
        const game
        of output
    ) {

        if (
            game.universeId
        ) {

            unique.set(
                String(
                    game.universeId
                ),
                game
            );

        }

    }


    return [
        ...unique.values()
    ];

}


/*
============================================================
 HOME
============================================================
*/

app.get(
    "/api/home",
    async (req, res) => {

        try {

            console.log(
                "[WebBlox] Loading home..."
            );


            /*
               Recommended:
               Trending

               Popular:
               Top playing now
            */

            const [
                trendingData,
                playingData
            ] =
                await Promise.all([
                    getSortContent(
                        "top-trending"
                    ),

                    getSortContent(
                        "top-playing-now"
                    )
                ]);


            const trending =
                extractSortGames(
                    trendingData
                );


            const playing =
                extractSortGames(
                    playingData
                );


            console.log(
                "[WebBlox] Trending:",
                trending.length
            );


            console.log(
                "[WebBlox] Playing:",
                playing.length
            );


            const [
                recommended,
                popular
            ] =
                await Promise.all([
                    enrichGames(
                        trending.slice(
                            0,
                            20
                        )
                    ),

                    enrichGames(
                        playing.slice(
                            0,
                            20
                        )
                    )
                ]);


            res.json({

                success:
                    true,

                recommended:
                    recommended,

                popular:
                    popular

            });

        } catch (error) {

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
    async (req, res) => {

        try {

            const data =
                await getSortContent(
                    "top-playing-now"
                );


            const games =
                extractSortGames(
                    data
                );


            const popular =
                await enrichGames(
                    games.slice(
                        0,
                        50
                    )
                );


            res.json({

                success:
                    true,

                games:
                    popular

            });

        } catch (error) {

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

app.get(
    "/api/search",
    async (req, res) => {

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


            console.log(
                "[WebBlox] Searching:",
                query
            );


            const url =
                new URL(
                    ROBLOX.search +
                    "/omni-search"
                );


            /*
               IMPORTANT:
               Use searchQuery for the current
               Roblox Search API.
            */

            url.searchParams.set(
                "searchQuery",
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

                games:
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
 GAME DETAILS
============================================================
*/

app.get(
    "/api/game/:universeId",
    async (req, res) => {

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

                game:
                    game

            });

        } catch (error) {

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
    (req, res) => {

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
                    "/api/game/:universeId"

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

        res.status(
            404
        )
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
 START
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
            "===================================="

        );

    }
);
