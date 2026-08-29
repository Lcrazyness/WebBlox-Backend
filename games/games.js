"use strict";

/*
============================================================
 WebBlox Games System
 games/games.js

 Handles WebBlox-native games.

 This is the first foundation for:
 - Creating games
 - Getting games
 - Finding games
 - Updating games
 - Publishing/unpublishing games
 - Likes
 - Visits
 - Player counts
 - Popular/trending/new sorting

 This module does NOT handle Roblox games.
============================================================
*/


/* ============================================================
   IN-MEMORY DATABASE
   ============================================================

   For now, games are stored in memory.

   IMPORTANT:
   This means games will reset whenever the Render server
   restarts.

   Later we can replace this with a real database without
   changing the rest of the WebBlox system very much.
============================================================ */

const games = new Map();


/* ============================================================
   ID GENERATOR
============================================================ */

function generateGameId() {

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 10)
    );

}


/* ============================================================
   DATE
============================================================ */

function now() {

    return new Date().toISOString();

}


/* ============================================================
   CLEAN TEXT
============================================================ */

function cleanText(value, fallback = "") {

    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value).trim();

}


/* ============================================================
   NUMBER
============================================================ */

function cleanNumber(value, fallback = 0) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.max(0, number);

}


/* ============================================================
   BOOLEAN
============================================================ */

function cleanBoolean(value, fallback = false) {

    if (typeof value === "boolean") {
        return value;
    }

    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    return fallback;

}


/* ============================================================
   CREATE GAME
============================================================ */

function createGame(options = {}) {

    const creatorId =
        cleanText(
            options.creatorId,
            ""
        );

    const creator =
        cleanText(
            options.creator,
            "Unknown Creator"
        );

    const name =
        cleanText(
            options.name,
            "Untitled WebBlox Game"
        );


    const game = {

        id: generateGameId(),

        type: "webblox",

        name,

        description:
            cleanText(
                options.description,
                "A WebBlox game."
            ),

        creator,

        creatorId,

        thumbnail:
            cleanText(
                options.thumbnail,
                ""
            ),

        icon:
            cleanText(
                options.icon,
                ""
            ),

        public:
            cleanBoolean(
                options.public,
                false
            ),

        published:
            cleanBoolean(
                options.published,
                false
            ),

        playing: 0,

        visits: 0,

        likes: 0,

        maxPlayers:
            Math.max(
                1,
                Math.floor(
                    cleanNumber(
                        options.maxPlayers,
                        20
                    )
                )
            ),

        genre:
            cleanText(
                options.genre,
                "All"
            ),

        created:
            now(),

        updated:
            now()

    };


    games.set(
        game.id,
        game
    );


    return {
        ...game
    };

}


/* ============================================================
   GET GAME
============================================================ */

function getGame(gameId) {

    if (!gameId) {
        return null;
    }

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    return {
        ...game
    };

}


/* ============================================================
   GET ALL GAMES
============================================================ */

function getAllGames(options = {}) {

    const includeUnpublished =
        cleanBoolean(
            options.includeUnpublished,
            false
        );


    let result =
        Array.from(
            games.values()
        );


    if (!includeUnpublished) {

        result =
            result.filter(
                game =>
                    game.public &&
                    game.published
            );

    }


    return result.map(
        game => ({
            ...game
        })
    );

}


/* ============================================================
   UPDATE GAME
============================================================ */

function updateGame(
    gameId,
    updates = {}
) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    if (
        updates.name !== undefined
    ) {

        game.name =
            cleanText(
                updates.name,
                game.name
            );

    }


    if (
        updates.description !== undefined
    ) {

        game.description =
            cleanText(
                updates.description,
                game.description
            );

    }


    if (
        updates.thumbnail !== undefined
    ) {

        game.thumbnail =
            cleanText(
                updates.thumbnail,
                game.thumbnail
            );

    }


    if (
        updates.icon !== undefined
    ) {

        game.icon =
            cleanText(
                updates.icon,
                game.icon
            );

    }


    if (
        updates.genre !== undefined
    ) {

        game.genre =
            cleanText(
                updates.genre,
                game.genre
            );

    }


    if (
        updates.maxPlayers !== undefined
    ) {

        game.maxPlayers =
            Math.max(
                1,
                Math.floor(
                    cleanNumber(
                        updates.maxPlayers,
                        game.maxPlayers
                    )
                )
            );

    }


    if (
        updates.public !== undefined
    ) {

        game.public =
            cleanBoolean(
                updates.public,
                game.public
            );

    }


    if (
        updates.published !== undefined
    ) {

        game.published =
            cleanBoolean(
                updates.published,
                game.published
            );

    }


    game.updated =
        now();


    games.set(
        game.id,
        game
    );


    return {
        ...game
    };

}


/* ============================================================
   DELETE GAME
============================================================ */

function deleteGame(gameId) {

    return games.delete(
        String(gameId)
    );

}


/* ============================================================
   PUBLISH GAME
============================================================ */

function publishGame(gameId) {

    return updateGame(
        gameId,
        {
            public: true,
            published: true
        }
    );

}


/* ============================================================
   UNPUBLISH GAME
============================================================ */

function unpublishGame(gameId) {

    return updateGame(
        gameId,
        {
            published: false
        }
    );

}


/* ============================================================
   ADD VISIT
============================================================ */

function addVisit(gameId) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    game.visits += 1;

    game.updated =
        now();


    return {
        ...game
    };

}


/* ============================================================
   LIKE GAME
============================================================ */

function likeGame(gameId) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    game.likes += 1;

    game.updated =
        now();


    return {
        ...game
    };

}


/* ============================================================
   UNLIKE GAME
============================================================ */

function unlikeGame(gameId) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    game.likes =
        Math.max(
            0,
            game.likes - 1
        );


    game.updated =
        now();


    return {
        ...game
    };

}


/* ============================================================
   SET PLAYING COUNT
============================================================ */

function setPlaying(
    gameId,
    count
) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    game.playing =
        Math.max(
            0,
            Math.floor(
                cleanNumber(
                    count,
                    0
                )
            )
        );


    return {
        ...game
    };

}


/* ============================================================
   PLAYER JOIN
============================================================ */

function playerJoin(gameId) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    if (
        game.playing >=
        game.maxPlayers
    ) {

        return {
            success: false,
            error: "Game is full.",
            game: {
                ...game
            }
        };

    }


    game.playing += 1;


    return {
        success: true,
        game: {
            ...game
        }
    };

}


/* ============================================================
   PLAYER LEAVE
============================================================ */

function playerLeave(gameId) {

    const game =
        games.get(
            String(gameId)
        );


    if (!game) {
        return null;
    }


    game.playing =
        Math.max(
            0,
            game.playing - 1
        );


    return {
        ...game
    };

}


/* ============================================================
   SEARCH GAMES
============================================================ */

function searchGames(
    query,
    options = {}
) {

    const search =
        cleanText(
            query,
            ""
        ).toLowerCase();


    if (!search) {
        return [];
    }


    const includeUnpublished =
        cleanBoolean(
            options.includeUnpublished,
            false
        );


    const all =
        getAllGames({
            includeUnpublished
        });


    return all.filter(
        game => {

            const name =
                String(
                    game.name || ""
                ).toLowerCase();

            const description =
                String(
                    game.description || ""
                ).toLowerCase();

            const creator =
                String(
                    game.creator || ""
                ).toLowerCase();

            const genre =
                String(
                    game.genre || ""
                ).toLowerCase();


            return (
                name.includes(search) ||
                description.includes(search) ||
                creator.includes(search) ||
                genre.includes(search)
            );

        }
    );

}


/* ============================================================
   POPULAR GAMES
============================================================ */

function getPopularGames(
    limit = 50
) {

    const gamesList =
        getAllGames();


    return gamesList
        .sort(
            (a, b) => {

                const scoreA =
                    calculatePopularity(
                        a
                    );

                const scoreB =
                    calculatePopularity(
                        b
                    );


                return scoreB - scoreA;

            }
        )
        .slice(
            0,
            Math.max(
                1,
                Number(limit) || 50
            )
        );

}


/* ============================================================
   POPULARITY SCORE
============================================================ */

function calculatePopularity(game) {

    const playing =
        cleanNumber(
            game.playing,
            0
        );

    const visits =
        cleanNumber(
            game.visits,
            0
        );

    const likes =
        cleanNumber(
            game.likes,
            0
        );


    /*
       Playing users receive the highest weight.

       Likes and visits help determine popularity
       when games aren't currently being played.
    */

    return (
        playing * 100 +
        likes * 5 +
        Math.sqrt(visits)
    );

}


/* ============================================================
   TRENDING GAMES
============================================================ */

function getTrendingGames(
    limit = 50
) {

    const gamesList =
        getAllGames();


    return gamesList
        .sort(
            (a, b) => {

                const scoreA =
                    calculateTrendingScore(
                        a
                    );

                const scoreB =
                    calculateTrendingScore(
                        b
                    );


                return scoreB - scoreA;

            }
        )
        .slice(
            0,
            Math.max(
                1,
                Number(limit) || 50
            )
        );

}


/* ============================================================
   TRENDING SCORE
============================================================ */

function calculateTrendingScore(game) {

    const playing =
        cleanNumber(
            game.playing,
            0
        );

    const likes =
        cleanNumber(
            game.likes,
            0
        );


    /*
       Trending favors games that are currently
       getting players and likes.
    */

    return (
        playing * 150 +
        likes * 10
    );

}


/* ============================================================
   NEW GAMES
============================================================ */

function getNewGames(
    limit = 50
) {

    const gamesList =
        getAllGames();


    return gamesList
        .sort(
            (a, b) => {

                return (
                    new Date(
                        b.created
                    ).getTime() -
                    new Date(
                        a.created
                    ).getTime()
                );

            }
        )
        .slice(
            0,
            Math.max(
                1,
                Number(limit) || 50
            )
        );

}


/* ============================================================
   MOST PLAYED
============================================================ */

function getMostPlayedGames(
    limit = 50
) {

    const gamesList =
        getAllGames();


    return gamesList
        .sort(
            (a, b) => {

                return (
                    b.playing -
                    a.playing
                );

            }
        )
        .slice(
            0,
            Math.max(
                1,
                Number(limit) || 50
            )
        );

}


/* ============================================================
   CREATOR GAMES
============================================================ */

function getGamesByCreator(
    creatorId,
    options = {}
) {

    const id =
        cleanText(
            creatorId,
            ""
        );


    if (!id) {
        return [];
    }


    const includeUnpublished =
        cleanBoolean(
            options.includeUnpublished,
            false
        );


    return getAllGames({
        includeUnpublished
    }).filter(
        game =>
            String(
                game.creatorId
            ) === id
    );

}


/* ============================================================
   GAME COUNT
============================================================ */

function getGameCount() {

    return games.size;

}


/* ============================================================
   PUBLIC GAME COUNT
============================================================ */

function getPublicGameCount() {

    return getAllGames().length;

}


/* ============================================================
   EXPORTS
============================================================ */

module.exports = {

    games,

    createGame,

    getGame,

    getAllGames,

    updateGame,

    deleteGame,

    publishGame,

    unpublishGame,

    addVisit,

    likeGame,

    unlikeGame,

    setPlaying,

    playerJoin,

    playerLeave,

    searchGames,

    getPopularGames,

    getTrendingGames,

    getNewGames,

    getMostPlayedGames,

    getGamesByCreator,

    getGameCount,

    getPublicGameCount

};
