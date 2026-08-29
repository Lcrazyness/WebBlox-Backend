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
 - Uses REAL Roblox experiences.
 - Never invents game names.
 - Never sends place IDs as universe IDs.
 - Converts place IDs -> universe IDs when necessary.
 - Gets creator information from the actual Roblox game data.
 - Uses Roblox's newer search/discovery APIs.
============================================================
*/

const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const ROBLOX_GAMES =
    "https://games.roblox.com";

const ROBLOX_APIS =
    "https://apis.roblox.com";

const ROBLOX_THUMBNAILS =
    "https://thumbnails.roblox.com";


/* =========================================================
   CORS
========================================================= */

app.use((req, res, next) => {

    res.header(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET,OPTIONS"
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


/* =========================================================
   BASIC HELPERS
========================================================= */

function isValidId(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return false;
    }

    const text =
        String(value).trim();

    if (!/^\d+$/.test(text)) {
        return false;
    }

    const number =
        Number(text);

    return (
        Number.isSafeInteger(number) &&
        number > 0
    );

}


function cleanId(value) {

    if (!isValidId(value)) {
        return null;
    }

    return String(value).trim();

}


function unique(values) {

    return [
        ...new Set(
            values.filter(Boolean)
        )
    ];

}


function sleep(ms) {

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


/* =========================================================
   ROBLOX FETCH
========================================================= */

async function robloxFetch(
    url,
    options = {}
) {

    console.log(
        "[Roblox] GET:",
        url
    );

    const response =
        await fetch(
            url,
            {
                method: "GET",

                headers: {
                    "Accept":
                        "application/json",

                    "User-Agent":
                        "WebBlox/4.0"
                },

                ...options
            }
        );


    const text =
        await response.text();


    let data = null;


    try {

        data =
            text
                ? JSON.parse(text)
                : null;

    } catch {

        data = null;

    }


    if (!response.ok) {

        const errorText =
            data
                ? JSON.stringify(data)
                : text;


        throw new Error(
            `Roblox HTTP ${response.status}: ${errorText}`
        );

    }


    return data;

}


/* =========================================================
   PLACE ID -> UNIVERSE ID
========================================================= */

async function placeToUniverse(
    placeId
) {

    const id =
        cleanId(placeId);


    if (!id) {
        return null;
    }


    try {

        const data =
            await robloxFetch(
                `${ROBLOX_APIS}/universes/v1/places/${id}/universe`
            );


        /*
          Current response normally contains:

          {
            universeId: 123456
          }

          Some older responses may use
          slightly different structures.
        */


        const universeId =
            cleanId(
                data?.universeId ??
                data?.UniverseId ??
                data?.data?.universeId ??
                data?.data?.[0]?.universeId ??
                data?.data?.[0]?.universeid
            );


        return universeId;

    } catch (error) {

        console.warn(
            "[WebBlox] Could not convert place ID:",
            id,
            error.message
        );

        return null;

    }

}


/* =========================================================
   EXTRACT POSSIBLE IDS
========================================================= */

function extractIds(item) {

    if (!item) {
        return {
            universeId: null,
            placeId: null
        };
    }


    const universeId =
        cleanId(
            item.universeId ??
            item.universeID ??
            item.UniverseId ??
            item.id
        );


    const placeId =
        cleanId(
            item.placeId ??
            item.placeID ??
            item.rootPlaceId ??
            item.rootPlaceID ??
            item.place?.id
        );


    return {
        universeId,
        placeId
    };

}


/* =========================================================
   GET GAME DETAILS
========================================================= */

async function getGameDetails(
    universeIds
) {

    const ids =
        unique(
            universeIds
                .map(cleanId)
        )
        .filter(Boolean);


    if (ids.length === 0) {
        return [];
    }


    /*
      Roblox has a limit on how many universe IDs
      can be requested in one request.

      Keep this LOW so we never hit the old
      "Too many universe IDs" error.
    */

    const chunks = [];


    for (
        let i = 0;
        i < ids.length;
        i += 10
    ) {

        chunks.push(
            ids.slice(
                i,
                i + 10
            )
        );

    }


    const results = [];


    for (
        const chunk of chunks
    ) {

        const url =
            `${ROBLOX_GAMES}/v1/games?universeIds=${chunk.join(",")}`;


        try {

            const data =
                await robloxFetch(url);


            if (
                Array.isArray(
                    data?.data
                )
            ) {

                results.push(
                    ...data.data
                );

            }

        } catch (error) {

            console.warn(
                "[WebBlox] Game details request failed:",
                error.message
            );

        }


        /*
          Don't hammer Roblox.
        */

        await sleep(75);

    }


    return results;

}


/* =========================================================
   THUMBNAILS
========================================================= */

async function getThumbnails(
    universeIds
) {

    const ids =
        unique(
            universeIds
                .map(cleanId)
        )
        .filter(Boolean);


    if (ids.length === 0) {
        return {};
    }


    const output = {};


    /*
      Roblox thumbnail endpoint has a batch limit,
      so use small batches.
    */

    for (
        let i = 0;
        i < ids.length;
        i += 10
    ) {

        const chunk =
            ids.slice(
                i,
                i + 10
            );


        try {

            const url =
                `${ROBLOX_THUMBNAILS}/v1/games/icons?` +
                `universeIds=${chunk.join(",")}` +
                `size=512x512` +
                `format=Png` +
                `isCircular=false`;


            const data =
                await robloxFetch(url);


            for (
                const item of
                data?.data || []
            ) {

                const id =
                    cleanId(
                        item.targetId
                    );


                if (!id) {
                    continue;
                }


                if (
                    item.imageUrl
                ) {

                    output[id] =
                        item.imageUrl;

                }

            }

        } catch (error) {

            console.warn(
                "[WebBlox] Thumbnail request failed:",
                error.message
            );

        }


        await sleep(50);

    }


    return output;

}


/* =========================================================
   CREATOR NAME
========================================================= */

function getCreatorName(
    game
) {

    /*
      Roblox game details normally provide:

      creator: {
          id,
          name,
          type
      }

      Prefer the real creator object.
    */

    if (
        game?.creator?.name
    ) {

        return game.creator.name;

    }


    if (
        game?.creator?.Name
    ) {

        return game.creator.Name;

    }


    if (
        game?.creatorName
    ) {

        return game.creatorName;

    }


    return "Unknown Creator";

}


/* =========================================================
   NORMALIZE GAME
========================================================= */

function normalizeGame(
    game,
    thumbnailMap = {}
) {

    if (!game) {
        return null;
    }


    const universeId =
        cleanId(
            game.id ??
            game.universeId
        );


    const placeId =
        cleanId(
            game.rootPlaceId ??
            game.placeId
        );


    /*
      THIS IS IMPORTANT.

      Never return an object without a real
      universe ID AND real name.

      This prevents the random / blank games
      problem from earlier.
    */

    if (
        !universeId ||
        !game.name ||
        !String(game.name).trim()
    ) {

        return null;

    }


    const name =
        String(
            game.name
        ).trim();


    const creator =
        getCreatorName(game);


    const creatorId =
        cleanId(
            game.creator?.id ??
            game.creator?.Id ??
            game.creatorId
        );


    const thumbnail =
        game.thumbnail ||
        game.thumbnailUrl ||
        thumbnailMap[universeId] ||
        null;


    const result = {

        id:
            universeId,

        universeId:
            universeId,

        placeId:
            placeId,

        name:
            name,

        description:
            game.description ||
            "",

        creator:
            creator,

        creatorId:
            creatorId,

        creatorType:
            game.creator?.type ||
            game.creator?.Type ||
            null,

        playing:
            Number(
                game.playing ??
                game.playerCount ??
                0
            ) || 0,

        visits:
            Number(
                game.visits ??
                game.placeVisits ??
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
            thumbnail,

        icon:
            thumbnail,

        robloxUrl:
            placeId
                ? `https://www.roblox.com/games/${placeId}`
                : `https://www.roblox.com/games/?universeId=${universeId}`,

        genre:
            game.genre ||
            game.genreDescription ||
            "",

        updated:
            game.updated ||
            game.updatedAt ||
            null

    };


    return result;

}


/* =========================================================
   ENRICH RAW RESULTS
========================================================= */

async function enrichGames(
    rawGames
) {

    if (
        !Array.isArray(rawGames) ||
        rawGames.length === 0
    ) {

        return [];

    }


    /*
      First collect universe IDs.

      Search APIs sometimes give us:
      - universeId
      - placeId
      - rootPlaceId
      - id

      We NEVER assume an arbitrary ID is a universe ID
      unless the source specifically says so.
    */

    const universeIds = [];

    const placeIds = [];


    for (
        const item of rawGames
    ) {

        const ids =
            extractIds(item);


        if (ids.universeId) {

            universeIds.push(
                ids.universeId
            );

        } else if (
            ids.placeId
        ) {

            placeIds.push(
                ids.placeId
            );

        }

    }


    /*
      Convert place IDs to universe IDs.
    */

    for (
        const placeId of
        unique(placeIds).slice(0, 40)
    ) {

        const universeId =
            await placeToUniverse(
                placeId
            );


        if (universeId) {

            universeIds.push(
                universeId
            );

        }


        await sleep(50);

    }


    const cleanUniverseIds =
        unique(
            universeIds
                .map(cleanId)
        )
        .filter(Boolean);


    if (
        cleanUniverseIds.length === 0
    ) {

        return [];

    }


    /*
      Get authoritative Roblox game details.

      This is what fixes:
      - blank titles
      - fake creator names
      - invalid IDs
      - wrong player counts
    */

    const details =
        await getGameDetails(
            cleanUniverseIds
        );


    if (
        details.length === 0
    ) {

        return [];

    }


    const thumbnails =
        await getThumbnails(
            details.map(
                game =>
                    cleanId(game.id)
            )
        );


    const output = [];


    for (
        const game of details
    ) {

        const normalized =
            normalizeGame(
                game,
                thumbnails
            );


        if (
            normalized
        ) {

            output.push(
                normalized
            );

        }

    }


    /*
      Remove duplicates.
    */

    const seen =
        new Set();


    return output.filter(
        game => {

            if (
                seen.has(
                    game.universeId
                )
            ) {

                return false;

            }


            seen.add(
                game.universeId
            );


            return true;

        }
    );

}


/* =========================================================
   EXTRACT GAMES FROM SEARCH API
========================================================= */

function extractSearchGames(
    data
) {

    const games = [];


    /*
      Current search API generally returns
      searchResults with groups/contents.

      We intentionally support several possible
      response shapes so Roblox API changes don't
      immediately break WebBlox.
    */

    const groups =
        Array.isArray(
            data?.searchResults
        )
            ? data.searchResults
            : [];


    for (
        const group of groups
    ) {

        const contents =
            Array.isArray(
                group?.contents
            )
                ? group.contents
                : [];


        for (
            const item of contents
        ) {

            if (!item) {
                continue;
            }


            /*
              Game result may be directly inside
              contents or nested inside a content object.
            */

            const candidate =
                item.game ||
                item.experience ||
                item.universe ||
                item;


            if (
                candidate
            ) {

                games.push(
                    candidate
                );

            }

        }

    }


    /*
      Additional fallback shapes.
    */

    if (
        Array.isArray(
            data?.games
        )
    ) {

        games.push(
            ...data.games
        );

    }


    if (
        Array.isArray(
            data?.data
        )
    ) {

        games.push(
            ...data.data
        );

    }


    return games;

}


/* =========================================================
   SEARCH ROBLOX
========================================================= */

async function searchRoblox(
    query
) {

    const sessionId =
        `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;


    const url =
        `${ROBLOX_APIS}/search-api/omni-search?` +
        `searchQuery=${encodeURIComponent(query)}` +
        `&pageToken=` +
        `&sessionId=${encodeURIComponent(sessionId)}` +
        `&pageType=all`;


    const data =
        await robloxFetch(url);


    const rawGames =
        extractSearchGames(data);


    return enrichGames(
        rawGames
    );

}


/* =========================================================
   DISCOVER / CHARTS
========================================================= */

async function getChartGames(
    sortId
) {

    const sessionId =
        `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;


    const url =
        `${ROBLOX_APIS}/explore-api/v1/get-sort-content?` +
        `sessionId=${encodeURIComponent(sessionId)}` +
        `sortId=${encodeURIComponent(sortId)}` +
        `device=computer` +
        `country=all`;


    const data =
        await robloxFetch(url);


    /*
      Chart responses have changed shape over time.
      Walk through common structures.
    */

    const rawGames = [];


    function collect(
        value,
        depth = 0
    ) {

        if (
            !value ||
            depth > 6
        ) {

            return;

        }


        if (
            Array.isArray(value)
        ) {

            for (
                const item of value
            ) {

                collect(
                    item,
                    depth + 1
                );

            }

            return;

        }


        if (
            typeof value !== "object"
        ) {

            return;

        }


        const looksLikeGame =
            (
                value.universeId ||
                value.rootPlaceId ||
                value.placeId
            ) &&
            (
                value.name ||
                value.gameName ||
                value.title
            );


        if (
            looksLikeGame
        ) {

            rawGames.push(
                value
            );

        }


        for (
            const key of Object.keys(value)
        ) {

            const child =
                value[key];


            if (
                child &&
                typeof child === "object"
            ) {

                collect(
                    child,
                    depth + 1
                );

            }

        }

    }


    collect(data);


    return enrichGames(
        rawGames
    );

}


/* =========================================================
   HOME
========================================================= */

app.get(
    "/api/home",
    async (req, res) => {

        try {

            console.log(
                "[WebBlox] Loading home..."
            );


            /*
              Use the current Roblox chart API.

              top-playing-now is a real current
              Roblox chart rather than random IDs.
            */

            let popular =
                await getChartGames(
                    "top-playing-now"
                );


            /*
              If the chart API doesn't return enough
              games, try trending.
            */

            if (
                popular.length < 6
            ) {

                try {

                    const trending =
                        await getChartGames(
                            "top-trending"
                        );


                    popular = [
                        ...popular,
                        ...trending
                    ];

                } catch (
                    fallbackError
                ) {

                    console.warn(
                        "[WebBlox] Trending fallback failed:",
                        fallbackError.message
                    );

                }

            }


            /*
              Remove duplicates.
            */

            const seen =
                new Set();


            popular =
                popular.filter(
                    game => {

                        if (
                            seen.has(
                                game.universeId
                            )
                        ) {

                            return false;

                        }


                        seen.add(
                            game.universeId
                        );


                        return true;

                    }
                );


            /*
              Recommended is made from a separate
              current Roblox chart.

              This is still REAL Roblox data.
            */

            let recommended = [];


            try {

                recommended =
                    await getChartGames(
                        "top-trending"
                    );

            } catch (
                recommendationError
            ) {

                console.warn(
                    "[WebBlox] Recommended chart failed:",
                    recommendationError.message
                );

            }


            /*
              If trending is the same list,
              use top revisited as a different
              real Roblox source.
            */

            if (
                recommended.length === 0
            ) {

                try {

                    recommended =
                        await getChartGames(
                            "top-revisited"
                        );

                } catch (
                    recommendationFallbackError
                ) {

                    console.warn(
                        "[WebBlox] Recommendation fallback failed:",
                        recommendationFallbackError.message
                    );

                }

            }


            /*
              Final dedupe.
            */

            const recommendedSeen =
                new Set();


            recommended =
                recommended.filter(
                    game => {

                        if (
                            recommendedSeen.has(
                                game.universeId
                            )
                        ) {

                            return false;

                        }


                        recommendedSeen.add(
                            game.universeId
                        );


                        return true;

                    }
                );


            res.json({

                success: true,

                recommended:
                    recommended.slice(0, 20),

                popular:
                    popular.slice(0, 20)

            });


        } catch (error) {

            console.error(
                "[WebBlox] HOME ERROR:",
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


/* =========================================================
   POPULAR
========================================================= */

app.get(
    "/api/popular",
    async (req, res) => {

        try {

            const games =
                await getChartGames(
                    "top-playing-now"
                );


            res.json({

                success: true,

                games:
                    games.slice(0, 50),

                popular:
                    games.slice(0, 50)

            });


        } catch (error) {

            console.error(
                "[WebBlox] POPULAR ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message

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


        if (
            !query
        ) {

            return res.json({

                success: true,

                games: []

            });

        }


        if (
            query.length > 100
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Search query is too long."

            });

        }


        try {

            console.log(
                "[WebBlox] Search:",
                query
            );


            const games =
                await searchRoblox(
                    query
                );


            res.json({

                success: true,

                query:

                    query,

                games:
                    games.slice(0, 40)

            });


        } catch (error) {

            console.error(
                "[WebBlox] SEARCH ERROR:",
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


/* =========================================================
   SINGLE GAME
========================================================= */

app.get(
    "/api/game/:universeId",
    async (req, res) => {

        const universeId =
            cleanId(
                req.params.universeId
            );


        if (
            !universeId
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid universe ID."

            });

        }


        try {

            const games =
                await getGameDetails(
                    [universeId]
                );


            if (
                games.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox experience not found."

                });

            }


            const thumbnails =
                await getThumbnails(
                    [universeId]
                );


            const game =
                normalizeGame(
                    games[0],
                    thumbnails
                );


            if (
                !game
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox experience data was invalid."

                });

            }


            res.json({

                success: true,

                game:
                    game

            });


        } catch (error) {

            console.error(
                "[WebBlox] GAME ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


/* =========================================================
   HEALTH
========================================================= */

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
                "4.0",

            endpoints: [

                "/api/home",

                "/api/popular",

                "/api/search?q=roblox",

                "/api/game/UNIVERSE_ID"

            ]

        });

    }
);


app.get(
    "/health",
    (req, res) => {

        res.json({

            success: true,

            status:
                "online"

        });

    }
);


/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "WebBlox API route not found."

        });

    }
);


/* =========================================================
   SERVER
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            "===================================="
        );

        console.log(
            "[WebBlox] Starting WebBlox..."
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
            "[WebBlox] Roblox Games API:",
            ROBLOX_GAMES
        );

        console.log(
            "[WebBlox] Roblox Search API:",
            `${ROBLOX_APIS}/search-api/omni-search`
        );

        console.log(
            "[WebBlox] Status: ONLINE"
        );

        console.log(
            "===================================="

        );

    }
);
