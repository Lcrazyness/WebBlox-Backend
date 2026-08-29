"use strict";

const express = require("express");

const app = express();

const PORT =
    process.env.PORT ||
    3000;


/* ============================================================
   CONFIG
   ============================================================ */

const ROBLOX_API =
    "https://games.roblox.com";

const THUMBNAILS_API =
    "https://thumbnails.roblox.com";

const USERS_API =
    "https://users.roblox.com";


/* ============================================================
   EXPRESS
   ============================================================ */

app.use(
    express.json()
);


/* ============================================================
   CORS
   ============================================================ */

app.use(
    (req, res, next) => {

        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );

        res.setHeader(
            "Access-Control-Allow-Methods",
            "GET,OPTIONS"
        );

        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Accept"
        );

        if (
            req.method === "OPTIONS"
        ) {

            return res.sendStatus(204);

        }

        next();

    }
);


/* ============================================================
   FETCH HELPER
   ============================================================ */

async function robloxFetch(
    url
) {

    const response =
        await fetch(
            url,
            {
                headers: {
                    "Accept":
                        "application/json",
                    "User-Agent":
                        "WebBlox/1.0"
                }
            }
        );

    const text =
        await response.text();

    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}: ${text}`
        );

    }

    try {

        return JSON.parse(
            text
        );

    } catch {

        throw new Error(
            "Roblox returned invalid JSON."
        );

    }

}


/* ============================================================
   NUMBER HELPER
   ============================================================ */

function number(
    value
) {

    return Number(value) || 0;

}


/* ============================================================
   SAFE STRING
   ============================================================ */

function string(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }

    return String(value);

}


/* ============================================================
   GET THUMBNAILS
   ============================================================ */

async function getThumbnails(
    universeIds
) {

    if (
        !Array.isArray(
            universeIds
        ) ||
        universeIds.length === 0
    ) {

        return {};

    }


    /*
       Roblox limits the number of IDs
       that can be sent in one request.

       Keep this safely below the limit.
    */

    const batches = [];

    for (
        let i = 0;
        i < universeIds.length;
        i += 50
    ) {

        batches.push(
            universeIds.slice(
                i,
                i + 50
            )
        );

    }


    const output = {};


    for (
        const batch of batches
    ) {

        try {

            const url =
                THUMBNAILS_API +
                "/v1/games/multiget/thumbnails" +
                "?universeIds=" +
                batch.join(",") +
                "&size=768x432" +
                "&format=Png" +
                "&isCircular=false";

            const data =
                await robloxFetch(
                    url
                );


            if (
                Array.isArray(
                    data.data
                )
            ) {

                data.data.forEach(
                    item => {

                        if (
                            item.universeId &&
                            item.imageUrl
                        ) {

                            output[
                                String(
                                    item.universeId
                                )
                            ] =
                                item.imageUrl;

                        }

                    }
                );

            }

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Thumbnail error:",
                error.message
            );

        }

    }


    return output;

}


/* ============================================================
   GET GAME ICONS
   ============================================================ */

async function getIcons(
    universeIds
) {

    if (
        !Array.isArray(
            universeIds
        ) ||
        universeIds.length === 0
    ) {

        return {};

    }


    const batches = [];

    for (
        let i = 0;
        i < universeIds.length;
        i += 50
    ) {

        batches.push(
            universeIds.slice(
                i,
                i + 50
            )
        );

    }


    const output = {};


    for (
        const batch of batches
    ) {

        try {

            const url =
                THUMBNAILS_API +
                "/v1/games/icons" +
                "?universeIds=" +
                batch.join(",") +
                "&size=512x512" +
                "&format=Png" +
                "&isCircular=false";

            const data =
                await robloxFetch(
                    url
                );


            if (
                Array.isArray(
                    data.data
                )
            ) {

                data.data.forEach(
                    item => {

                        if (
                            item.targetId &&
                            item.imageUrl
                        ) {

                            output[
                                String(
                                    item.targetId
                                )
                            ] =
                                item.imageUrl;

                        }

                    }
                );

            }

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Icon error:",
                error.message
            );

        }

    }


    return output;

}


/* ============================================================
   GET CREATOR NAMES
   ============================================================ */

async function getCreators(
    creatorIds
) {

    const unique =
        [
            ...new Set(
                creatorIds
                    .filter(Boolean)
                    .map(
                        id =>
                            Number(id)
                    )
                    .filter(
                        id =>
                            Number.isFinite(
                                id
                            )
                    )
            )
        ];


    if (
        unique.length === 0
    ) {

        return {};

    }


    const output = {};


    /*
       Users API accepts multiple IDs.
       Keep batches small.
    */

    for (
        let i = 0;
        i < unique.length;
        i += 50
    ) {

        const batch =
            unique.slice(
                i,
                i + 50
            );


        try {

            const url =
                USERS_API +
                "/v1/users" +
                "?userIds=" +
                batch.join(",");

            const data =
                await robloxFetch(
                    url
                );


            if (
                Array.isArray(
                    data.data
                )
            ) {

                data.data.forEach(
                    user => {

                        if (
                            user.id
                        ) {

                            output[
                                String(
                                    user.id
                                )
                            ] =
                                user.displayName ||
                                user.name ||
                                "Unknown Creator";

                        }

                    }
                );

            }

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Creator lookup error:",
                error.message
            );

        }

    }


    return output;

}


/* ============================================================
   FORMAT EXPERIENCE
   ============================================================ */

async function formatExperiences(
    experiences
) {

    if (
        !Array.isArray(
            experiences
        )
    ) {

        return [];

    }


    const universeIds =
        experiences
            .map(
                game =>
                    game.id
            )
            .filter(Boolean);


    const thumbnails =
        await getThumbnails(
            universeIds
        );


    const icons =
        await getIcons(
            universeIds
        );


    const creatorIds =
        experiences
            .map(
                game =>
                    game.creator?.id ||
                    game.creatorId
            )
            .filter(Boolean);


    const creators =
        await getCreators(
            creatorIds
        );


    return experiences.map(
        game => {

            const universeId =
                number(
                    game.id
                );

            const creatorId =
                number(
                    game.creator?.id ||
                    game.creatorId
                );


            const creatorName =
                creators[
                    String(
                        creatorId
                    )
                ] ||
                game.creator?.name ||
                game.creator?.displayName ||
                game.creatorName ||
                "Unknown Creator";


            const placeId =
                number(
                    game.rootPlaceId ||
                    game.placeId
                );


            return {

                id:
                    universeId,

                universeId:
                    universeId,

                placeId:
                    placeId,

                name:
                    string(
                        game.name
                    ) ||
                    "Untitled Roblox Experience",

                description:
                    string(
                        game.description
                    ),

                creator:
                    creatorName,

                creatorId:
                    creatorId,

                playing:
                    number(
                        game.playing
                    ),

                visits:
                    number(
                        game.visits
                    ),

                favorites:
                    number(
                        game.favoritedCount ||
                        game.favorites
                    ),

                maxPlayers:
                    number(
                        game.maxPlayers
                    ),

                thumbnail:
                    thumbnails[
                        String(
                            universeId
                        )
                    ] ||
                    "",

                icon:
                    icons[
                        String(
                            universeId
                        )
                    ] ||
                    "",

                robloxUrl:
                    placeId
                        ? "https://www.roblox.com/games/" +
                          placeId
                        : "https://www.roblox.com/",

                genre:
                    string(
                        game.genre
                    ) ||
                    "All",

                updated:
                    game.updated ||
                    null

            };

        }
    );

}


/* ============================================================
   HOME
   ============================================================ */

app.get(
    "/api/home",
    async (
        req,
        res
    ) => {

        try {

            /*
               Sort by popularity using Roblox's
               public games endpoint.

               Do not send a huge number of IDs.
            */

            const url =
                ROBLOX_API +
                "/v1/games/list" +
                "?sortToken=" +
                "";


            /*
               Use the games endpoint with
               universe sorting.
            */

            let data;

            try {

                data =
                    await robloxFetch(
                        ROBLOX_API +
                        "/v1/games" +
                        "?sortOrder=Desc" +
                        "&limit=50"
                    );

            } catch {

                /*
                   Fallback to the games list endpoint.
                */

                data =
                    await robloxFetch(
                        ROBLOX_API +
                        "/v1/games/list"
                    );

            }


            const games =
                Array.isArray(
                    data.data
                )
                    ? data.data
                    : [];


            const formatted =
                await formatExperiences(
                    games
                );


            const popular =
                [...formatted]
                    .sort(
                        (
                            a,
                            b
                        ) =>
                            number(
                                b.playing
                            ) -
                            number(
                                a.playing
                            )
                    );


            /*
               Recommended is based on the same
               real Roblox experiences, but kept
               separate so the frontend has the
               correct sections.
            */

            const recommended =
                [...formatted]
                    .sort(
                        (
                            a,
                            b
                        ) => {

                            const aScore =
                                number(
                                    a.playing
                                ) +
                                (
                                    number(
                                        a.favorites
                                    ) *
                                    0.05
                                );

                            const bScore =
                                number(
                                    b.playing
                                ) +
                                (
                                    number(
                                        b.favorites
                                    ) *
                                    0.05
                                );

                            return (
                                bScore -
                                aScore
                            );

                        }
                    );


            res.json({
                success: true,

                recommended:
                    recommended.slice(
                        0,
                        24
                    ),

                popular:
                    popular.slice(
                        0,
                        24
                    )

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] /api/home:",
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


/* ============================================================
   POPULAR
   ============================================================ */

app.get(
    "/api/popular",
    async (
        req,
        res
    ) => {

        try {

            const data =
                await robloxFetch(
                    ROBLOX_API +
                    "/v1/games" +
                    "?sortOrder=Desc" +
                    "&limit=50"
                );


            const games =
                Array.isArray(
                    data.data
                )
                    ? data.data
                    : [];


            const formatted =
                await formatExperiences(
                    games
                );


            formatted.sort(
                (
                    a,
                    b
                ) =>
                    number(
                        b.playing
                    ) -
                    number(
                        a.playing
                    )
            );


            res.json({

                success: true,

                games:
                    formatted.slice(
                        0,
                        50
                    )

            });

        } catch (
            error
        ) {

            res.status(500).json({

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
    async (
        req,
        res
    ) => {

        const query =
            string(
                req.query.q
            ).trim();


        if (!query) {

            return res.json({

                success: true,

                games: []

            });

        }


        try {

            /*
               Roblox search endpoint.

               This searches actual Roblox
               experiences rather than a fixed
               list of games.
            */

            const url =
                ROBLOX_API +
                "/v1/games/list" +
                "?keyword=" +
                encodeURIComponent(
                    query
                ) +
                "&limit=50";


            let data;


            try {

                data =
                    await robloxFetch(
                        url
                    );

            } catch {

                /*
                   Alternate search endpoint.
                */

                data =
                    await robloxFetch(
                        ROBLOX_API +
                        "/v1/games" +
                        "?keyword=" +
                        encodeURIComponent(
                            query
                        ) +
                        "&sortOrder=Desc" +
                        "&limit=50"
                    );

            }


            const games =
                Array.isArray(
                    data.data
                )
                    ? data.data
                    : [];


            const formatted =
                await formatExperiences(
                    games
                );


            /*
               Make exact / partial title matches
               appear first.
            */

            const lowerQuery =
                query.toLowerCase();


            formatted.sort(
                (
                    a,
                    b
                ) => {

                    const aName =
                        String(
                            a.name
                        ).toLowerCase();

                    const bName =
                        String(
                            b.name
                        ).toLowerCase();


                    const aExact =
                        aName ===
                        lowerQuery
                            ? 1
                            : 0;

                    const bExact =
                        bName ===
                        lowerQuery
                            ? 1
                            : 0;


                    if (
                        aExact !==
                        bExact
                    ) {

                        return (
                            bExact -
                            aExact
                        );

                    }


                    const aStarts =
                        aName.startsWith(
                            lowerQuery
                        )
                            ? 1
                            : 0;

                    const bStarts =
                        bName.startsWith(
                            lowerQuery
                        )
                            ? 1
                            : 0;


                    if (
                        aStarts !==
                        bStarts
                    ) {

                        return (
                            bStarts -
                            aStarts
                        );

                    }


                    return (
                        number(
                            b.playing
                        ) -
                        number(
                            a.playing
                        )
                    );

                }
            );


            res.json({

                success: true,

                query: query,

                games:
                    formatted.slice(
                        0,
                        50
                    )

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Search:",
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


/* ============================================================
   SINGLE GAME
   ============================================================ */

app.get(
    "/api/game/:universeId",
    async (
        req,
        res
    ) => {

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
                    "Invalid universe ID."

            });

        }


        try {

            const data =
                await robloxFetch(
                    ROBLOX_API +
                    "/v1/games" +
                    "?universeIds=" +
                    universeId
                );


            const games =
                Array.isArray(
                    data.data
                )
                    ? data.data
                    : [];


            const formatted =
                await formatExperiences(
                    games
                );


            res.json({

                success: true,

                game:
                    formatted[0] ||
                    null

            });

        } catch (
            error
        ) {

            res.status(500).json({

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
    (
        req,
        res
    ) => {

        res.json({

            success: true,

            name:
                "WebBlox Backend",

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
            "WebBlox Backend"
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "Status: ONLINE"
        );

        console.log(
            "===================================="

        );

    }
);
