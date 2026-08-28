"use strict";

/* ============================================================
   WebBlox Frontend
   ============================================================ */

const API_BASE = "https://webblox-backend.onrender.com";

const API = {
    home: API_BASE + "/api/home",
    popular: API_BASE + "/api/popular",
    search: API_BASE + "/api/search",
    game: API_BASE + "/api/game/"
};


/* ============================================================
   ELEMENTS
   ============================================================ */

const recommendedContainer =
    document.getElementById("recommendedGames");

const popularContainer =
    document.getElementById("popularGames");

const searchContainer =
    document.getElementById("searchGames");

const favoritesContainer =
    document.getElementById("favoritesGames");

const searchSection =
    document.getElementById("searchSection");

const favoritesSection =
    document.getElementById("favoritesSection");

const searchInput =
    document.getElementById("searchInput");

const searchButton =
    document.getElementById("searchButton");

const searchStatus =
    document.getElementById("searchStatus");

const errorSection =
    document.getElementById("errorSection");

const errorMessage =
    document.getElementById("errorMessage");

const gameModal =
    document.getElementById("gameModal");


/* ============================================================
   FAVORITES
   ============================================================ */

const FAVORITES_KEY = "webblox_favorites";


function getFavorites() {

    try {

        const saved =
            localStorage.getItem(
                FAVORITES_KEY
            );

        if (!saved) {
            return [];
        }

        const data =
            JSON.parse(saved);

        return Array.isArray(data)
            ? data
            : [];

    } catch {

        return [];

    }

}


function saveFavorites(favorites) {

    localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favorites)
    );

}


function isFavorite(game) {

    if (!game) {
        return false;
    }

    const id =
        String(
            game.placeId ||
            game.universeId ||
            game.id ||
            ""
        );

    return getFavorites().some(
        item =>
            String(
                item.placeId ||
                item.universeId ||
                item.id ||
                ""
            ) === id
    );

}


function toggleFavorite(game, event) {

    if (event) {
        event.stopPropagation();
    }

    const favorites =
        getFavorites();

    const id =
        String(
            game.placeId ||
            game.universeId ||
            game.id ||
            ""
        );

    const existingIndex =
        favorites.findIndex(
            item =>
                String(
                    item.placeId ||
                    item.universeId ||
                    item.id ||
                    ""
                ) === id
        );

    if (existingIndex >= 0) {

        favorites.splice(
            existingIndex,
            1
        );

    } else {

        favorites.push({
            id: game.id,
            universeId: game.universeId,
            placeId: game.placeId,
            name: game.name,
            description: game.description,
            creator: game.creator,
            creatorId: game.creatorId,
            playing: game.playing,
            visits: game.visits,
            favorites: game.favorites,
            maxPlayers: game.maxPlayers,
            thumbnail: game.thumbnail,
            icon: game.icon,
            robloxUrl: game.robloxUrl,
            genre: game.genre,
            updated: game.updated
        });

    }

    saveFavorites(favorites);

    loadFavorites();

    document.querySelectorAll(
        ".game-card"
    ).forEach(card => {

        const cardId =
            card.dataset.gameId;

        if (
            cardId &&
            cardId === id
        ) {

            const button =
                card.querySelector(
                    ".favorite-button"
                );

            if (button) {

                button.textContent =
                    isFavorite(game)
                        ? "★"
                        : "☆";

            }

        }

    });

}


/* ============================================================
   API
   ============================================================ */

async function apiFetch(url) {

    console.log(
        "[WebBlox] Request:",
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
                            "application/json"
                    },
                    cache: "no-store"
                }
            );

    } catch (error) {

        throw new Error(
            "Could not connect to the WebBlox backend. " +
            "Make sure the Render service is online."
        );

    }

    const text =
        await response.text();

    console.log(
        "[WebBlox] HTTP:",
        response.status
    );

    if (!text) {

        throw new Error(
            "The backend returned an empty response."
        );

    }

    if (
        text.trim().startsWith("<")
    ) {

        throw new Error(
            "The backend returned HTML instead of JSON. " +
            "Check the Render backend URL."
        );

    }

    let data;

    try {

        data =
            JSON.parse(text);

    } catch {

        throw new Error(
            "The backend returned invalid JSON."
        );

    }

    if (!response.ok) {

        throw new Error(
            data.error ||
            "Backend returned HTTP " +
            response.status
        );

    }

    if (data.success === false) {

        throw new Error(
            data.error ||
            "The Roblox service returned an error."
        );

    }

    return data;

}


/* ============================================================
   HOME
   ============================================================ */

async function loadHome() {

    hideError();

    showLoading(
        recommendedContainer,
        "Loading Roblox games..."
    );

    showLoading(
        popularContainer,
        "Loading Roblox games..."
    );

    try {

        const data =
            await apiFetch(
                API.home
            );

        const recommended =
            Array.isArray(
                data.recommended
            )
                ? data.recommended
                : [];

        const popular =
            Array.isArray(
                data.popular
            )
                ? data.popular
                : [];

        renderGames(
            recommendedContainer,
            recommended,
            "No recommended Roblox experiences were returned."
        );

        renderGames(
            popularContainer,
            popular,
            "No popular Roblox experiences were returned."
        );

        if (
            recommended.length === 0 &&
            popular.length === 0
        ) {

            showError(
                "The backend is connected, but Roblox returned no experiences."
            );

        }

    } catch (error) {

        console.error(
            "[WebBlox] Home error:",
            error
        );

        recommendedContainer.innerHTML =
            "";

        popularContainer.innerHTML =
            "";

        showError(
            error.message
        );

    }

}


/* ============================================================
   RENDER
   ============================================================ */

function renderGames(
    container,
    games,
    emptyMessage
) {

    container.innerHTML =
        "";

    if (
        !Array.isArray(games) ||
        games.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-card">
                ${escapeHTML(
                    emptyMessage ||
                    "No Roblox experiences found."
                )}
            </div>
        `;

        return;

    }

    games.forEach(
        game => {

            if (!game) {
                return;
            }

            container.appendChild(
                createGameCard(game)
            );

        }
    );

}


/* ============================================================
   GAME CARD
   ============================================================ */

function createGameCard(game) {

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "game-card";

    card.dataset.gameId =
        String(
            game.placeId ||
            game.universeId ||
            game.id ||
            ""
        );


    /* IMAGE */

    const imageWrap =
        document.createElement(
            "div"
        );

    imageWrap.className =
        "game-image-wrap";


    const image =
        document.createElement(
            "img"
        );

    image.className =
        "game-thumbnail";

    image.alt =
        game.name ||
        "Roblox experience";

    image.loading =
        "lazy";

    image.src =
        getBestThumbnail(game);


    image.onerror =
        function() {

            if (
                this.dataset.fallback
            ) {

                imageWrap.classList.add(
                    "image-failed"
                );

                this.style.display =
                    "none";

                return;

            }

            this.dataset.fallback =
                "true";

            this.src =
                getThumbnailFallback(
                    game
                );

        };


    imageWrap.appendChild(
        image
    );


    /* FAVORITE */

    const favoriteButton =
        document.createElement(
            "button"
        );

    favoriteButton.className =
        "favorite-button";

    favoriteButton.type =
        "button";

    favoriteButton.textContent =
        isFavorite(game)
            ? "★"
            : "☆";

    favoriteButton.title =
        isFavorite(game)
            ? "Remove from favorites"
            : "Add to favorites";

    favoriteButton.addEventListener(
        "click",
        function(event) {

            toggleFavorite(
                game,
                event
            );

            this.textContent =
                isFavorite(game)
                    ? "★"
                    : "☆";

        }
    );

    imageWrap.appendChild(
        favoriteButton
    );


    /* BODY */

    const body =
        document.createElement(
            "div"
        );

    body.className =
        "game-card-body";


    /* TITLE */

    const title =
        document.createElement(
            "h3"
        );

    title.className =
        "game-title";

    title.textContent =
        cleanGameName(
            game.name
        );


    /* CREATOR */

    const creator =
        document.createElement(
            "p"
        );

    creator.className =
        "game-creator";

    creator.textContent =
        "By " +
        (
            game.creator ||
            "Unknown Creator"
        );


    /* STATS */

    const stats =
        document.createElement(
            "div"
        );

    stats.className =
        "game-stats";


    const players =
        document.createElement(
            "span"
        );

    players.innerHTML =
        "👥 " +
        formatNumber(
            game.playing || 0
        ) +
        " playing";


    const visits =
        document.createElement(
            "span"
        );

    visits.innerHTML =
        "◉ " +
        formatNumber(
            game.visits || 0
        );


    stats.appendChild(
        players
    );

    stats.appendChild(
        visits
    );


    body.appendChild(
        title
    );

    body.appendChild(
        creator
    );

    body.appendChild(
        stats
    );


    card.appendChild(
        imageWrap
    );

    card.appendChild(
        body
    );


    card.addEventListener(
        "click",
        function() {

            openGame(game);

        }
    );


    return card;

}


/* ============================================================
   THUMBNAILS
   ============================================================ */

function getBestThumbnail(game) {

    /*
       Prefer backend thumbnail.
    */

    if (
        game &&
        typeof game.thumbnail === "string" &&
        game.thumbnail.trim()
    ) {

        return game.thumbnail;

    }


    /*
       Roblox CDN thumbnail fallback.

       This uses the universe ID and is much
       more reliable than using random images.
    */

    const universeId =
        game?.universeId ||
        game?.id;

    if (universeId) {

        return (
            "https://thumbnails.roblox.com/v1/" +
            "games/icons?universeIds=" +
            encodeURIComponent(
                universeId
            ) +
            "&returnPolicy=PlaceHolder" +
            "&size=512x512" +
            "&format=Png" +
            "&isCircular=false"
        );

    }

    return createPlaceholder(
        game?.name
    );

}


function getThumbnailFallback(game) {

    if (
        game &&
        typeof game.icon === "string" &&
        game.icon.trim()
    ) {

        return game.icon;

    }

    const placeId =
        game?.placeId;

    if (placeId) {

        return (
            "https://www.roblox.com/asset-thumbnail/" +
            "image?assetId=" +
            encodeURIComponent(
                placeId
            ) +
            "&width=768&height=432"
        );

    }

    return createPlaceholder(
        game?.name
    );

}


/* ============================================================
   SEARCH
   ============================================================ */

async function searchGames() {

    const query =
        searchInput.value.trim();

    if (!query) {

        clearSearch();

        return;

    }

    searchSection.classList.remove(
        "hidden"
    );

    favoritesSection.classList.add(
        "hidden"
    );

    searchContainer.innerHTML = `
        <div class="loading-card">
            <div class="spinner"></div>
            <span>Searching Roblox...</span>
        </div>
    `;

    searchStatus.textContent =
        'Searching Roblox for "' +
        query +
        '"...';

    try {

        const url =
            API.search +
            "?q=" +
            encodeURIComponent(
                query
            );

        const data =
            await apiFetch(
                url
            );

        const games =
            Array.isArray(
                data.games
            )
                ? data.games
                : [];

        searchStatus.textContent =
            games.length +
            (
                games.length === 1
                    ? " experience found"
                    : " experiences found"
            );

        renderGames(
            searchContainer,
            games,
            "No Roblox experiences matched your search."
        );

        searchSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {

        console.error(
            "[WebBlox] Search error:",
            error
        );

        searchStatus.textContent =
            "Search failed";

        searchContainer.innerHTML = `
            <div class="empty-card">
                ${escapeHTML(
                    error.message
                )}
            </div>
        `;

    }

}


/* ============================================================
   OPEN GAME
   ============================================================ */

function openGame(game) {

    document.getElementById(
        "modalTitle"
    ).textContent =
        cleanGameName(
            game.name
        );

    document.getElementById(
        "modalCreator"
    ).textContent =
        "By " +
        (
            game.creator ||
            "Unknown Creator"
        );

    document.getElementById(
        "modalDescription"
    ).textContent =
        game.description ||
        "No description available.";

    document.getElementById(
        "modalPlayers"
    ).textContent =
        formatNumber(
            game.playing || 0
        );

    document.getElementById(
        "modalVisits"
    ).textContent =
        formatNumber(
            game.visits || 0
        );

    document.getElementById(
        "modalFavorites"
    ).textContent =
        formatNumber(
            game.favorites || 0
        );


    const modalImage =
        document.getElementById(
            "modalImage"
        );

    modalImage.style.display =
        "block";

    modalImage.src =
        getBestThumbnail(game);

    modalImage.alt =
        cleanGameName(
            game.name
        );


    modalImage.onerror =
        function() {

            this.onerror =
                null;

            this.src =
                createPlaceholder(
                    game.name
                );

        };


    const playButton =
        document.getElementById(
            "playButton"
        );

    playButton.onclick =
        function() {

            if (
                game.placeId
            ) {

                const url =
                    "https://www.roblox.com/games/" +
                    encodeURIComponent(
                        game.placeId
                    );

                window.open(
                    url,
                    "_blank",
                    "noopener,noreferrer"
                );

            } else {

                alert(
                    "This Roblox experience does not have a place ID."
                );

            }

        };


    gameModal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );

}


/* ============================================================
   CLOSE
   ============================================================ */

function closeGame() {

    gameModal.classList.add(
        "hidden"
    );

    document.body.classList.remove(
        "modal-open"
    );

}


/* ============================================================
   FAVORITES PAGE
   ============================================================ */

function loadFavorites() {

    const favorites =
        getFavorites();

    renderGames(
        favoritesContainer,
        favorites,
        "You haven't favorited any games yet."
    );

}


/* ============================================================
   NAVIGATION
   ============================================================ */

function showDiscover() {

    favoritesSection.classList.add(
        "hidden"
    );

    searchSection.classList.add(
        "hidden"
    );

    document.querySelector(
        ".hero"
    ).classList.remove(
        "hidden"
    );

    document.querySelector(
        ".game-section:nth-of-type(3)"
    );

    document.getElementById(
        "discoverButton"
    ).classList.add(
        "active"
    );

    document.getElementById(
        "favoritesButton"
    ).classList.remove(
        "active"
    );

}


function showFavorites() {

    searchSection.classList.add(
        "hidden"
    );

    favoritesSection.classList.remove(
        "hidden"
    );

    document.querySelector(
        ".hero"
    ).classList.add(
        "hidden"
    );

    document.getElementById(
        "favoritesButton"
    ).classList.add(
        "active"
    );

    document.getElementById(
        "discoverButton"
    ).classList.remove(
        "active"
    );

    loadFavorites();

    favoritesSection.scrollIntoView({
        behavior: "smooth"
    });

}


/* ============================================================
   CLEAR SEARCH
   ============================================================ */

function clearSearch() {

    searchInput.value =
        "";

    searchSection.classList.add(
        "hidden"
    );

    searchContainer.innerHTML =
        "";

    searchStatus.textContent =
        "";

}


/* ============================================================
   ERROR
   ============================================================ */

function showError(message) {

    errorMessage.textContent =
        message ||
        "The Roblox game service could not be reached.";

    errorSection.classList.remove(
        "hidden"
    );

}


function hideError() {

    errorSection.classList.add(
        "hidden"
    );

}


/* ============================================================
   LOADING
   ============================================================ */

function showLoading(
    container,
    message
) {

    container.innerHTML = `
        <div class="loading-card">
            <div class="spinner"></div>
            <span>
                ${escapeHTML(
                    message ||
                    "Loading..."
                )}
            </span>
        </div>
    `;

}


/* ============================================================
   NUMBER FORMAT
   ============================================================ */

function formatNumber(number) {

    number =
        Number(number) || 0;

    if (
        number >= 1000000000
    ) {

        return (
            number / 1000000000
        ).toFixed(1) + "B";

    }

    if (
        number >= 1000000
    ) {

        return (
            number / 1000000
        ).toFixed(1) + "M";

    }

    if (
        number >= 1000
    ) {

        return (
            number / 1000
        ).toFixed(1) + "K";

    }

    return number.toLocaleString();

}


/* ============================================================
   CLEAN GAME NAME
   ============================================================ */

function cleanGameName(name) {

    if (
        !name ||
        typeof name !== "string"
    ) {

        return "Roblox Experience";

    }

    return name.trim();

}


/* ============================================================
   PLACEHOLDER
   ============================================================ */

function createPlaceholder(name) {

    const text =
        String(
            name ||
            "Roblox"
        )
        .substring(
            0,
            25
        );

    return (
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="768"
                height="432"
            >

                <rect
                    width="768"
                    height="432"
                    fill="#202024"
                />

                <text
                    x="384"
                    y="216"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="#88888f"
                    font-size="30"
                    font-family="Arial"
                >
                    ${escapeHTML(text)}
                </text>

            </svg>
        `)
    );

}


/* ============================================================
   ESCAPE
   ============================================================ */

function escapeHTML(value) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


/* ============================================================
   SCROLL
   ============================================================ */

function scrollToGames() {

    const section =
        document.querySelector(
            ".game-section"
        );

    if (section) {

        section.scrollIntoView({
            behavior: "smooth"
        });

    }

}


/* ============================================================
   EVENTS
   ============================================================ */

searchButton.addEventListener(
    "click",
    searchGames
);


searchInput.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Enter"
        ) {

            searchGames();

        }

    }
);


document.getElementById(
    "clearButton"
).addEventListener(
    "click",
    clearSearch
);


document.getElementById(
    "retryButton"
).addEventListener(
    "click",
    loadHome
);


document.getElementById(
    "exploreButton"
).addEventListener(
    "click",
    scrollToGames
);


document.getElementById(
    "recommendedSeeAll"
).addEventListener(
    "click",
    function() {

        scrollToGames();

    }
);


document.getElementById(
    "popularSeeAll"
).addEventListener(
    "click",
    function() {

        document.getElementById(
            "popularSection"
        ).scrollIntoView({
            behavior: "smooth"
        });

    }
);


document.getElementById(
    "discoverButton"
).addEventListener(
    "click",
    showDiscover
);


document.getElementById(
    "favoritesButton"
).addEventListener(
    "click",
    showFavorites
);


document.getElementById(
    "modalClose"
).addEventListener(
    "click",
    closeGame
);


document.getElementById(
    "modalBackdrop"
).addEventListener(
    "click",
    closeGame
);


document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Escape"
        ) {

            closeGame();

        }

    }
);


/* ============================================================
   START
   ============================================================ */

console.log(
    "[WebBlox] Starting..."
);

console.log(
    "[WebBlox] Backend:",
    API_BASE
);

loadFavorites();
loadHome();
