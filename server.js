const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

/* =====================================================
   CORS
===================================================== */

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});


/* =====================================================
   API URLS
===================================================== */

const ROLIMONS_URL =
    "https://api.rolimons.com/games/v1/gamelist";

const ROBLOX_GAMES_URL =
    "https://games.roblox.com/v1/games";

const ROBLOX_THUMBNAILS_URL =
    "https://thumbnails.roblox.com/v1/games/multiget/thumbnails";


/* =====================================================
   CACHE
===================================================== */

let cache = {
    games: [],
    time: 0
};

const CACHE_TIME = 5 * 60 * 1000;


/* =====================================================
   FETCH JSON
===================================================== */

async function fetchJSON(url) {

    console.log("[WebBlox] Fetch:", url);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json",
            "User-Agent": "WebBlox/1.0"
        }
    });

    const text = await response.text();

    console.log(
        "[WebBlox] Response:",
        response.status
    );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${text.substring(0, 500)}`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            "Roblox/Rolimon's returned invalid JSON."
        );
    }
}


/* =====================================================
   ROLIMONS GAME LIST
===================================================== */

async function getRolimonsGames() {

    const data =
        await fetchJSON(ROLIMONS_URL);

    if (
        !data ||
        !data.games ||
        typeof data.games !== "object"
    ) {
        throw new Error(
            "Rolimon's did not return a game list."
        );
    }

    const games = [];

    for (
        const [universeId, value]
        of Object.entries(data.games)
    ) {

        if (!Array.isArray(value)) {
            continue;
        }

        const id = Number(universeId);

        if (!Number.isFinite(id)) {
            continue;
        }

        games.push({
            universeId: id,

            name:
                String(value[0] || "Roblox Experience"),

            playing:
                Number(value[1]) || 0,

            thumbnail:
                value[2] || null
        });
    }

    return games;
}


/* =====================================================
   ROBLOX GAME DETAILS

   IMPORTANT:
   Roblox rejects huge universeIds requests.
   We therefore split everything into batches of 25.
===================================================== */

async function getRobloxDetails(ids) {

    if (!ids.length) {
        return [];
    }

    const results = [];

    const BATCH_SIZE = 25;

    for (
        let i = 0;
        i < ids.length;
        i += BATCH_SIZE
    ) {

        const batch =
            ids.slice(i, i + BATCH_SIZE);

        const url =
            ROBLOX_GAMES_URL +
            "?universeIds=" +
            encodeURIComponent(
                batch.join(",")
            );

        try {

            console.log(
                `[WebBlox] Roblox details batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length}`
            );

            const data =
                await fetchJSON(url);

            if (Array.isArray(data.data)) {
                results.push(...data.data);
            }

        } catch (error) {

            console.error(
                "[WebBlox] Roblox details batch failed:",
                error.message
            );
        }
    }

    return results;
}


/* =====================================================
   ROBLOX THUMBNAILS

   Also batched to avoid oversized requests.
===================================================== */

async function getThumbnails(ids) {

    if (!ids.length) {
        return {};
    }

    const thumbnails = {};

    const BATCH_SIZE = 25;

    for (
        let i = 0;
        i < ids.length;
        i += BATCH_SIZE
    ) {

        const batch =
            ids.slice(i, i + BATCH_SIZE);

        const url =
            ROBLOX_THUMBNAILS_URL +
            "?universeIds=" +
            encodeURIComponent(
                batch.join(",")
            ) +
            "&size=768x432" +
            "&format=Png" +
            "&isCircular=false";

        try {

            const data =
                await fetchJSON(url);

            for (
                const item
                of data.data || []
            ) {

                if (
                    item.universeId &&
                    item.imageUrl
                ) {

                    thumbnails[
                        String(item.universeId)
                    ] =
                        item.imageUrl;
                }
            }

        } catch (error) {

            console.error(
                "[WebBlox] Thumbnail batch failed:",
                error.message
            );
        }
    }

    return thumbnails;
}


/* =====================================================
   BUILD GAME
===================================================== */

function buildGame(
    rolGame,
    robloxGame,
    thumbnails
) {

    const universeId =
        Number(
            robloxGame.id ||
            rolGame.universeId
        );

    const placeId =
        Number(
            robloxGame.rootPlaceId
        );

    const thumbnail =
        thumbnails[String(universeId)] ||
        rolGame.thumbnail ||
        null;

    return {

        id: universeId,

        universeId: universeId,

        placeId:
            Number.isFinite(placeId)
                ? placeId
                : null,

        name:
            robloxGame.name ||
            rolGame.name,

        description:
            robloxGame.description ||
            "",

        creator:
            robloxGame.creator?.name ||
            "Unknown Creator",

        creatorId:
            robloxGame.creator?.id ||
            null,

        playing:
            Number(
                robloxGame.playing ??
                rolGame.playing ??
                0
            ),

        visits:
            Number(
                robloxGame.visits ??
                0
            ),

        favorites:
            Number(
                robloxGame.favoritedCount ??
                0
            ),

        maxPlayers:
            Number(
                robloxGame.maxPlayers ??
                0
            ),

        thumbnail: thumbnail,

        icon: thumbnail,

        robloxUrl:
            placeId
                ? `https://www.roblox.com/games/${placeId}`
                : "https://www.roblox.com/games",

        genre:
            robloxGame.genre ||
            "",

        updated:
            robloxGame.updated ||
            null
    };
}


/* =====================================================
   LOAD REAL ROBLOX GAMES
===================================================== */

async function loadGames() {

    if (
        cache.games.length &&
        Date.now() - cache.time <
            CACHE_TIME
    ) {

        console.log(
            "[WebBlox] Using cached games."
        );

        return cache.games;
    }


    console.log(
        "[WebBlox] Loading real Roblox games..."
    );


    const rolimonsGames =
        await getRolimonsGames();


    console.log(
        `[WebBlox] Rolimon's games: ${rolimonsGames.length}`
    );


    /*
       Sort by real current player count.
    */

    rolimonsGames.sort(
        (a, b) =>
            b.playing - a.playing
    );


    /*
       Only process the first 100.
       They are then split into batches
       of 25 for Roblox.
    */

    const selected =
        rolimonsGames.slice(0, 100);


    const universeIds =
        selected.map(
            game =>
                game.universeId
        );


    const robloxGames =
        await getRobloxDetails(
            universeIds
        );


    console.log(
        `[WebBlox] Roblox confirmed: ${robloxGames.length}`
    );


    const robloxMap =
        new Map();

    for (
        const game
        of robloxGames
    ) {

        robloxMap.set(
            Number(game.id),
            game
        );
    }


    const confirmedIds =
        robloxGames.map(
            game =>
                Number(game.id)
        );


    const thumbnails =
        await getThumbnails(
            confirmedIds
        );


    const finalGames = [];


    for (
        const rolGame
        of selected
    ) {

        const robloxGame =
            robloxMap.get(
                rolGame.universeId
            );


        /*
           IMPORTANT:
           Never create a fake game.

           If Roblox didn't confirm it,
           don't show it.
        */

        if (!robloxGame) {
            continue;
        }


        if (!robloxGame.rootPlaceId) {
            continue;
        }


        finalGames.push(
            buildGame(
                rolGame,
                robloxGame,
                thumbnails
            )
        );
    }


    /*
       Highest real player counts first.
    */

    finalGames.sort(
        (a, b) =>
            b.playing - a.playing
    );


    cache = {
        games: finalGames,
        time: Date.now()
    };


    console.log(
        `[WebBlox] Final real games: ${finalGames.length}`
    );


    return finalGames;
}


/* =====================================================
   HOME
===================================================== */

app.get(
    "/api/home",
    async (req, res) => {

        try {

            const games =
                await loadGames();


            const popular =
                games.slice(0, 24);


            /*
               Until WebBlox has a logged-in Roblox
               user, "recommended" is based on
               popular real experiences rather than
               inventing personalized games.
            */

            const recommended =
                games.slice(8, 32);


            res.json({

                success: true,

                recommended:
                    recommended,

                popular:
                    popular

            });

        } catch (error) {

            console.error(
                "[WebBlox] /api/home error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Unable to load Roblox experiences."

            });
        }
    }
);


/* =====================================================
   POPULAR
===================================================== */

app.get(
    "/api/popular",
    async (req, res) => {

        try {

            const games =
                await loadGames();


            res.json({

                success: true,

                games:
                    games.slice(0, 40)

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
                    "Unable to load popular games."

            });
        }
    }
);


/* =====================================================
   SEARCH
===================================================== */

app.get(
    "/api/search",
    async (req, res) => {

        try {

            const query =
                String(
                    req.query.q || ""
                )
                .trim()
                .toLowerCase();


            if (!query) {

                return res.json({

                    success: true,

                    games: []

                });
            }


            const games =
                await loadGames();


            const words =
                query
                    .split(/\s+/)
                    .filter(Boolean);


            const results =
                games
                    .map(game => {

                        const name =
                            String(
                                game.name || ""
                            )
                            .toLowerCase();


                        let score = 0;


                        if (
                            name === query
                        ) {

                            score += 1000;
                        }


                        if (
                            name.includes(query)
                        ) {

                            score += 500;
                        }


                        for (
                            const word
                            of words
                        ) {

                            if (
                                name.includes(word)
                            ) {

                                score += 100;
                            }
                        }


                        score +=
                            Math.log10(
                                Number(
                                    game.playing
                                ) + 1
                            );


                        return {
                            game,
                            score
                        };

                    })
                    .filter(
                        item =>
                            item.score >= 100
                    )
                    .sort(
                        (a, b) =>
                            b.score - a.score
                    )
                    .slice(0, 30)
                    .map(
                        item =>
                            item.game
                    );


            res.json({

                success: true,

                games:
                    results

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


/* =====================================================
   SINGLE GAME
===================================================== */

app.get(
    "/api/game/:universeId",
    async (req, res) => {

        try {

            const universeId =
                Number(
                    req.params.universeId
                );


            if (
                !Number.isFinite(
                    universeId
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid Roblox universe ID."

                });
            }


            const details =
                await getRobloxDetails([
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


            const robloxGame =
                details[0];


            const game =
                buildGame(

                    {
                        universeId:
                            universeId,

                        name:
                            robloxGame.name,

                        playing:
                            robloxGame.playing
                    },

                    robloxGame,

                    thumbnails

                );


            res.json({

                success: true,

                game:
                    game

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
                    "Unable to load Roblox experience."

            });
        }
    }
);


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            name:
                "WebBlox Roblox Backend",

            status:
                "online",

            message:
                "Backend is running.",

            endpoints: [

                "/api/home",

                "/api/popular",

                "/api/search?q=brookhaven",

                "/api/game/:universeId"

            ]

        });
    }
);


/* =====================================================
   404
===================================================== */

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "WebBlox backend endpoint not found.",

            path:
                req.path

        });
    }
);


/* =====================================================
   START SERVER
===================================================== */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "[WebBlox] Backend starting..."
        );

        console.log(
            `[WebBlox] Port: ${PORT}`
        );

        console.log(
            "[WebBlox] Real Roblox games enabled."
        );

        console.log(
            "========================================"
        );
    }
);
