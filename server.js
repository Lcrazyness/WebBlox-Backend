/*
============================================================
 WEBBLOX GAMES
============================================================
*/

/*
============================================================
 GET ALL PUBLIC GAMES
============================================================
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

                success: true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Get games error:",
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


/*
============================================================
 SEARCH WEBBLOX GAMES
============================================================
*/

app.get(
    "/api/webblox/games/search",
    (
        req,
        res
    ) => {

        try {

            const query =
                String(
                    req.query.q ||
                    ""
                ).trim();

            const games =
                webbloxGames.searchGames(
                    query
                );

            res.json({

                success: true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Search WebBlox games error:",
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


/*
============================================================
 POPULAR WEBBLOX GAMES
============================================================
*/

app.get(
    "/api/webblox/games/popular",
    (
        req,
        res
    ) => {

        try {

            const limit =
                Number(
                    req.query.limit
                ) || 50;

            const games =
                webbloxGames.getPopularGames(
                    limit
                );

            res.json({

                success: true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Popular WebBlox games error:",
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


/*
============================================================
 TRENDING WEBBLOX GAMES
============================================================
*/

app.get(
    "/api/webblox/games/trending",
    (
        req,
        res
    ) => {

        try {

            const limit =
                Number(
                    req.query.limit
                ) || 50;

            const games =
                webbloxGames.getTrendingGames(
                    limit
                );

            res.json({

                success: true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Trending WebBlox games error:",
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


/*
============================================================
 NEW WEBBLOX GAMES
============================================================
*/

app.get(
    "/api/webblox/games/new",
    (
        req,
        res
    ) => {

        try {

            const limit =
                Number(
                    req.query.limit
                ) || 50;

            const games =
                webbloxGames.getNewGames(
                    limit
                );

            res.json({

                success: true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] New WebBlox games error:",
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


/*
============================================================
 MOST PLAYED WEBBLOX GAMES
============================================================
*/

app.get(
    "/api/webblox/games/most-played",
    (
        req,
        res
    ) => {

        try {

            const limit =
                Number(
                    req.query.limit
                ) || 50;

            const games =
                webbloxGames.getMostPlayedGames(
                    limit
                );

            res.json({

                success: true,

                games

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Most played WebBlox games error:",
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


/*
============================================================
 GET SINGLE WEBBLOX GAME
============================================================
 IMPORTANT:
 This MUST come AFTER:
 search
 popular
 trending
 new
 most-played
============================================================
*/

app.get(
    "/api/webblox/games/:id",
    (
        req,
        res
    ) => {

        try {

            const id =
                String(
                    req.params.id ||
                    ""
                ).trim();

            /*
             * Prevent special API routes from ever being
             * interpreted as game IDs.
             */

            const reservedRoutes = new Set([

                "search",

                "popular",

                "trending",

                "new",

                "most-played"

            ]);

            if (
                reservedRoutes.has(
                    id.toLowerCase()
                )
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "WebBlox game not found."

                });

            }

            const game =
                webbloxGames.getGame(
                    id
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

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Get single game error:",
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


/*
============================================================
 CREATE WEBBLOX GAME
============================================================
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

                    success: true,

                    game

                });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Create game error:",
                error
            );

            res
                .status(400)
                .json({

                    success: false,

                    error:
                        error.message

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
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Update game error:",
                error
            );

            res.status(400).json({

                success: false,

                error:
                    error.message

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
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true

            });

        } catch (
            error
        ) {

            console.error(
                "[WebBlox] Delete game error:",
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


/*
============================================================
 PUBLISH GAME
============================================================
*/

app.post(
    "/api/webblox/games/:id/publish",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

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


/*
============================================================
 UNPUBLISH GAME
============================================================
*/

app.post(
    "/api/webblox/games/:id/unpublish",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

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


/*
============================================================
 LIKE GAME
============================================================
*/

app.post(
    "/api/webblox/games/:id/like",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

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


/*
============================================================
 UNLIKE GAME
============================================================
*/

app.post(
    "/api/webblox/games/:id/unlike",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

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


/*
============================================================
 ADD VISIT
============================================================
*/

app.post(
    "/api/webblox/games/:id/visit",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

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


/*
============================================================
 PLAYER JOIN
============================================================
*/

app.post(
    "/api/webblox/games/:id/join",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

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


/*
============================================================
 PLAYER LEAVE
============================================================
*/

app.post(
    "/api/webblox/games/:id/leave",
    (
        req,
        res
    ) => {

        try {

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

                        success: false,

                        error:
                            "WebBlox game not found."

                    });

            }

            res.json({

                success: true,

                game

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


/*
============================================================
 CREATOR GAMES
============================================================
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

                success: true,

                games

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


/*
============================================================
 WEBBLOX GAME STATS
============================================================
*/

app.get(
    "/api/webblox/stats",
    (
        req,
        res
    ) => {

        try {

            res.json({

                success: true,

                games:
                    webbloxGames.getGameCount(),

                publicGames:
                    webbloxGames.getPublicGameCount()

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
