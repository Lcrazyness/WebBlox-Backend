const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
});


// =====================================================
// CONFIG
// =====================================================

const ROLIMONS_GAMES =
    "https://api.rolimons.com/games/v1/gamelist";

const ROBLOX_GAMES =
    "https://games.roblox.com/v1/games";

const ROBLOX_THUMBNAILS =
    "https://thumbnails.roblox.com/v1/games/multiget/thumbnails";


// =====================================================
// CACHE
// =====================================================

let gameCache = {
    games: [],
    updated: 0
};

const CACHE_TIME = 5 * 60 * 1000;


// =====================================================
// FETCH JSON
// =====================================================

async function fetchJSON(url, options = {}) {

    const response = await fetch(url, {
        ...options,

        headers: {
            "Accept": "application/json",
            "User-Agent":
                "Mozilla/5.0 WebBlox/1.0",
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}: ${text.substring(0, 300)}`
        );
    }

    try {

        return JSON.parse(text);

    } catch {

        throw new Error(
            "Server returned invalid JSON."
        );
    }
}


// =====================================================
// GET REAL ROBLOX GAMES FROM ROLIMONS
// =====================================================

async function getRolimonsGames() {

    const data =
        await fetchJSON(
            ROLIMONS_GAMES
        );

    if (
        !data ||
        !data.games ||
        typeof data.games !== "object"
    ) {

        throw new Error(
            "Rolimon's returned no game list."
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

        const id =
            Number(universeId);

        if (!Number.isFinite(id)) {
            continue;
        }

        games.push({

            universeId: id,

            name:
                value[0] ||
                "Unknown Roblox Experience",

            playing:
                Number(value[1]) || 0,

            thumbnail:
                value[2] || null

        });
    }

    return games;
}


// =====================================================
// GET ROBLOX DETAILS
// =====================================================

async function getRobloxDetails(
    universeIds
) {

    if (!universeIds.length) {
        return [];
    }

    const ids =
        universeIds.join(",");

    const url =
        `${ROBLOX_GAMES}?universeIds=${encodeURIComponent(ids)}`;

    const data =
        await fetchJSON(url);

    return data.data || [];
}


// =====================================================
// GET REAL THUMBNAILS
// =====================================================

async function getThumbnails(
    universeIds
) {

    if (!universeIds.length) {
        return {};
    }

    const url =
        `${ROBLOX_THUMBNAILS}` +
        `?universeIds=${encodeURIComponent(
            universeIds.join(",")
        )}` +
        `&size=768x432` +
        `&format=Png` +
        `&isCircular=false`;

    try {

        const data =
            await fetchJSON(url);

        const result = {};

        for (
            const item
            of data.data || []
        ) {

            if (
                item.universeId &&
                item.imageUrl
            ) {

                result[
                    String(item.universeId)
                ] = item.imageUrl;

            }
        }

        return result;

    } catch (error) {

        console.log(
            "[WebBlox] Thumbnail request failed:",
            error.message
        );

        return {};
    }
}


// =====================================================
// BUILD GAME OBJECT
// =====================================================

function makeGame(
    rolGame,
    robloxGame,
    thumbnails
) {

    const universeId =
        Number(
            robloxGame?.id ||
            rolGame.universeId
        );

    const placeId =
        Number(
            robloxGame?.rootPlaceId
        );

    const thumbnail =
        thumbnails[
            String(universeId)
        ] ||
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
            robloxGame?.name ||
            rolGame.name ||
            "Roblox Experience",

        description:
            robloxGame?.description ||
            "",

        creator:
            robloxGame?.creator?.name ||
            "Unknown Creator",

        creatorId:
            robloxGame?.creator?.id ||
            null,

        playing:
            Number(
                robloxGame?.playing ??
                rolGame.playing ??
                0
            ),

        visits:
            Number(
                robloxGame?.visits ??
                0
            ),

        favorites:
            Number(
                robloxGame?.favoritedCount ??
                0
            ),

        maxPlayers:
            Number(
                robloxGame?.maxPlayers ??
                0
            ),

        thumbnail: thumbnail,

        icon: thumbnail,

        robloxUrl:
            placeId
                ? `https://www.roblox.com/games/${placeId}`
                : `https://www.roblox.com/games`,

        genre:
            robloxGame?.genre ||
            "",

        updated:
            robloxGame?.updated ||
            null

    };
}


// =====================================================
// LOAD REAL GAMES
// =====================================================

async function loadGames() {

    if (
        gameCache.games.length > 0 &&
        Date.now() - gameCache.updated <
            CACHE_TIME
    ) {

        return gameCache.games;
    }

    console.log(
        "[WebBlox] Loading real Roblox games..."
    );

    const rolGames =
        await getRolimonsGames();

    console.log(
        `[WebBlox] Rolimon's returned ${rolGames.length} games.`
    );


    // Sort by CURRENT PLAYER COUNT.
    // These are real Roblox games.
    rolGames.sort(
        (a, b) =>
            b.playing - a.playing
    );


    // Don't ask Roblox for thousands of games.
    const selected =
        rolGames.slice(0, 100);


    const ids =
        selected.map(
            game =>
                game.universeId
        );


    const details =
        await getRobloxDetails(
            ids
        );


    const detailMap =
        new Map();

    for (
        const game
        of details
    ) {

        detailMap.set(
            Number(game.id),
            game
        );
    }


    const thumbnailIds =
        details.map(
            game =>
                Number(game.id)
        );


    const thumbnails =
        await getThumbnails(
            thumbnailIds
        );


    const games = [];


    for (
        const rolGame
        of selected
    ) {

        const robloxGame =
            detailMap.get(
                rolGame.universeId
            );

        if (!robloxGame) {
            continue;
        }


        // Only include games that Roblox
        // actually confirmed.
        if (
            !robloxGame.rootPlaceId
        ) {
            continue;
        }


        games.push(
            makeGame(
                rolGame,
                robloxGame,
                thumbnails
            )
        );
    }


    // Sort AGAIN using Roblox's current
    // player count.
    games.sort(
        (a, b) =>
            b.playing - a.playing
    );


    gameCache = {

        games: games,

        updated:
            Date.now()

    };


    console.log(
        `[WebBlox] Loaded ${games.length} real Roblox experiences.`
    );


    return games;
}


// =====================================================
// HOME
// =====================================================

app.get(
    "/api/home",
    async (req, res) => {

        try {

            const games =
                await loadGames();


            const popular =
                games.slice(0, 24);


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
                "[WebBlox] Home error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Unable to load Roblox games."

            });
        }
    }
);


// =====================================================
// POPULAR
// =====================================================

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
                "[WebBlox] Popular error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Unable to load popular Roblox games."

            });
        }
    }
);


// =====================================================
// SEARCH
// =====================================================

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


                        // Popular games get a
                        // small ranking boost.
                        score +=
                            Math.log10(
                                game.playing + 1
                            );


                        return {

                            game: game,

                            score: score

                        };

                    })
                    .filter(
                        item =>
                            item.score >=
                            100
                    )
                    .sort(
                        (a, b) =>
                            b.score -
                            a.score
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
                "[WebBlox] Search error:",
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


// =====================================================
// SINGLE GAME
// =====================================================

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
                makeGame(

                    {
                        universeId:
                            universeId,

                        name:
                            robloxGame.name,

                        playing:
                            robloxGame.playing,

                        thumbnail:
                            null
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
                "[WebBlox] Game error:",
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


// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            name:
                "WebBlox Roblox Backend",

            status:
                "online",

            endpoints: [

                "/api/home",

                "/api/popular",

                "/api/search?q=brookhaven",

                "/api/game/:universeId"

            ]

        });

    }
);


// =====================================================
// START
// =====================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `WebBlox backend running on port ${PORT}`
        );

    }
);
