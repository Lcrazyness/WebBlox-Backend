"use strict";

/*
============================================================
 WebBlox Games
============================================================

 Native WebBlox game database.

 This is NOT the Roblox game system.

 WebBlox Games are games created specifically
 for the WebBlox platform.

============================================================
*/

const crypto = require("crypto");


/*
============================================================
 DATABASE
============================================================
*/

const games = new Map();


/*
============================================================
 HELPERS
============================================================
*/

function generateId() {

    return crypto
        .randomUUID();

}


function cleanString(
    value,
    fallback = ""
) {

    if (
        value === undefined ||
        value === null
    ) {

        return fallback;

    }

    return String(
        value
    ).trim();

}


function number(
    value,
    fallback = 0
) {

    const result =
        Number(value);

    if (
        !Number.isFinite(result)
    ) {

        return fallback;

    }

    return result;

}


function limitNumber(
    value,
    fallback = 50
) {

    const result =
        Math.floor(
            Number(value)
        );

    if (
        !Number.isFinite(result) ||
        result <= 0
    ) {

        return fallback;

    }

    return Math.min(
        result,
        100
    );

}


/*
============================================================
 CREATE GAME
============================================================
*/

function createGame(
    input = {}
) {

    const name =
        cleanString(
            input.name
        );


    if (
        !name
    ) {

        throw new Error(
            "Game name is required."
        );

    }


    const creator =
        cleanString(
            input.creator,
            "Unknown Creator"
        );


    const creatorId =
        cleanString(
            input.creatorId
        );


    const id =
        generateId();


    const now =
        new Date().toISOString();


    const game = {

        id,

        name,

        description:
            cleanString(
                input.description
            ),

        creator,

        creatorId,

        thumbnail:
            cleanString(
                input.thumbnail
            ),

        icon:
            cleanString(
                input.icon ||
                input.thumbnail
            ),

        players:
            0,

        playing:
            0,

        visits:
            0,

        likes:
            0,

        dislikes:
            0,

        maxPlayers:
            number(
                input.maxPlayers,
                16
            ),

        genre:
            cleanString(
                input.genre,
                "All"
            ),

        version:
            cleanString(
                input.version,
                "1.0.0"
            ),

        public:
            input.public !== false,

        published:
            input.published === true,

        multiplayer:
            input.multiplayer !== false,

        created:
            now,

        updated:
            now,

        lastPlayed:
            null

    };


    games.set(
        id,
        game
    );


    return {
        ...game
    };

}


/*
============================================================
 GET GAME
============================================================
*/

function getGame(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    return {
        ...game
    };

}


/*
============================================================
 GET PUBLIC GAMES
============================================================
*/

function getAllGames() {

    return Array
        .from(
            games.values()
        )
        .filter(
            game =>
                game.public &&
                game.published
        )
        .map(
            game => ({
                ...game
            })
        );

}


/*
============================================================
 SEARCH
============================================================
*/

function searchGames(
    query
) {

    const search =
        cleanString(
            query
        )
        .toLowerCase();


    if (
        !search
    ) {

        return getAllGames();

    }


    return getAllGames()
        .filter(
            game => {

                const name =
                    game.name
                        .toLowerCase();

                const description =
                    game.description
                        .toLowerCase();

                const creator =
                    game.creator
                        .toLowerCase();

                const genre =
                    game.genre
                        .toLowerCase();


                return (

                    name.includes(
                        search
                    ) ||

                    description.includes(
                        search
                    ) ||

                    creator.includes(
                        search
                    ) ||

                    genre.includes(
                        search
                    )

                );

            }
        );

}


/*
============================================================
 POPULAR
============================================================
*/

function getPopularGames(
    limit = 50
) {

    const amount =
        limitNumber(
            limit
        );


    return getAllGames()
        .sort(
            (a, b) => {

                const scoreA =
                    (
                        a.likes * 5
                    ) +
                    (
                        a.playing * 10
                    ) +
                    a.visits;

                const scoreB =
                    (
                        b.likes * 5
                    ) +
                    (
                        b.playing * 10
                    ) +
                    b.visits;


                return scoreB - scoreA;

            }
        )
        .slice(
            0,
            amount
        );

}


/*
============================================================
 TRENDING
============================================================
*/

function getTrendingGames(
    limit = 50
) {

    const amount =
        limitNumber(
            limit
        );


    return getAllGames()
        .sort(
            (a, b) => {

                const scoreA =
                    (
                        a.playing * 20
                    ) +
                    (
                        a.likes * 3
                    );

                const scoreB =
                    (
                        b.playing * 20
                    ) +
                    (
                        b.likes * 3
                    );


                return scoreB - scoreA;

            }
        )
        .slice(
            0,
            amount
        );

}


/*
============================================================
 NEW GAMES
============================================================
*/

function getNewGames(
    limit = 50
) {

    const amount =
        limitNumber(
            limit
        );


    return getAllGames()
        .sort(
            (a, b) =>
                new Date(
                    b.created
                ) -
                new Date(
                    a.created
                )
        )
        .slice(
            0,
            amount
        );

}


/*
============================================================
 MOST PLAYED
============================================================
*/

function getMostPlayedGames(
    limit = 50
) {

    const amount =
        limitNumber(
            limit
        );


    return getAllGames()
        .sort(
            (a, b) =>
                b.visits -
                a.visits
        )
        .slice(
            0,
            amount
        );

}


/*
============================================================
 UPDATE GAME
============================================================
*/

function updateGame(
    id,
    input = {}
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    if (
        input.name !== undefined
    ) {

        const name =
            cleanString(
                input.name
            );


        if (
            name
        ) {

            game.name =
                name;

        }

    }


    if (
        input.description !== undefined
    ) {

        game.description =
            cleanString(
                input.description
            );

    }


    if (
        input.creator !== undefined
    ) {

        game.creator =
            cleanString(
                input.creator
            );

    }


    if (
        input.creatorId !== undefined
    ) {

        game.creatorId =
            cleanString(
                input.creatorId
            );

    }


    if (
        input.thumbnail !== undefined
    ) {

        game.thumbnail =
            cleanString(
                input.thumbnail
            );

    }


    if (
        input.icon !== undefined
    ) {

        game.icon =
            cleanString(
                input.icon
            );

    }


    if (
        input.genre !== undefined
    ) {

        game.genre =
            cleanString(
                input.genre
            );

    }


    if (
        input.version !== undefined
    ) {

        game.version =
            cleanString(
                input.version
            );

    }


    if (
        input.maxPlayers !== undefined
    ) {

        game.maxPlayers =
            number(
                input.maxPlayers,
                game.maxPlayers
            );

    }


    if (
        input.public !== undefined
    ) {

        game.public =
            Boolean(
                input.public
            );

    }


    if (
        input.multiplayer !== undefined
    ) {

        game.multiplayer =
            Boolean(
                input.multiplayer
            );

    }


    game.updated =
        new Date().toISOString();


    return {
        ...game
    };

}


/*
============================================================
 DELETE GAME
============================================================
*/

function deleteGame(
    id
) {

    return games.delete(
        String(id)
    );

}


/*
============================================================
 PUBLISH
============================================================
*/

function publishGame(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    game.published =
        true;

    game.public =
        true;

    game.updated =
        new Date().toISOString();


    return {
        ...game
    };

}


/*
============================================================
 UNPUBLISH
============================================================
*/

function unpublishGame(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    game.published =
        false;

    game.updated =
        new Date().toISOString();


    return {
        ...game
    };

}


/*
============================================================
 LIKE
============================================================
*/

function likeGame(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    game.likes += 1;

    game.updated =
        new Date().toISOString();


    return {
        ...game
    };

}


/*
============================================================
 UNLIKE
============================================================
*/

function unlikeGame(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    game.likes =
        Math.max(
            0,
            game.likes - 1
        );


    game.updated =
        new Date().toISOString();


    return {
        ...game
    };

}


/*
============================================================
 VISIT
============================================================
*/

function addVisit(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    game.visits += 1;

    game.lastPlayed =
        new Date().toISOString();


    return {
        ...game
    };

}


/*
============================================================
 PLAYER JOIN
============================================================
*/

function playerJoin(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    if (
        game.players >=
        game.maxPlayers
    ) {

        return {

            success:
                false,

            error:
                "This WebBlox game is full."

        };

    }


    game.players += 1;

    game.playing =
        game.players;


    game.visits += 1;

    game.lastPlayed =
        new Date().toISOString();


    return {

        success:
            true,

        game: {
            ...game
        }

    };

}


/*
============================================================
 PLAYER LEAVE
============================================================
*/

function playerLeave(
    id
) {

    const game =
        games.get(
            String(id)
        );


    if (
        !game
    ) {

        return null;

    }


    game.players =
        Math.max(
            0,
            game.players - 1
        );


    game.playing =
        game.players;


    return {
        ...game
    };

}


/*
============================================================
 CREATOR GAMES
============================================================
*/

function getGamesByCreator(
    creatorId
) {

    const id =
        cleanString(
            creatorId
        );


    return Array
        .from(
            games.values()
        )
        .filter(
            game =>
                game.creatorId === id
        )
        .map(
            game => ({
                ...game
            })
        );

}


/*
============================================================
 COUNTS
============================================================
*/

function getGameCount() {

    return games.size;

}


function getPublicGameCount() {

    return Array
        .from(
            games.values()
        )
        .filter(
            game =>
                game.public &&
                game.published
        )
        .length;

}


/*
============================================================
 EXPORTS
============================================================
*/

module.exports = {

    getAllGames,

    getGame,

    searchGames,

    getPopularGames,

    getTrendingGames,

    getNewGames,

    getMostPlayedGames,

    createGame,

    updateGame,

    deleteGame,

    publishGame,

    unpublishGame,

    likeGame,

    unlikeGame,

    addVisit,

    playerJoin,

    playerLeave,

    getGamesByCreator,

    getGameCount,

    getPublicGameCount

};
