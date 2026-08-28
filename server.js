"use strict";

/* ============================================================
   WEBBLOX
   ============================================================ */

const API_BASE =
    "https://webblox-backend.onrender.com";

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

const discoverSection =
    document.getElementById("discoverSection");

const popularSection =
    document.getElementById("popularSection");

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


/* ============================================================
   FAVORITES
   ============================================================ */

function getFavorites() {

    try {

        return JSON.parse(
            localStorage.getItem(
                "webblox_favorites"
            ) || "[]"
        );

    } catch {

        return [];

    }

}


function saveFavorites(favorites) {

    localStorage.setItem(
        "webblox_favorites",
        JSON.stringify(favorites)
    );

}


function isFavorite(game) {

    return getFavorites().some(
        item =>
            Number(item.universeId) ===
            Number(game.universeId)
    );

}


function toggleFavorite(game) {

    let favorites =
        getFavorites();

    const index =
        favorites.findIndex(
            item =>
                Number(item.universeId) ===
                Number(game.universeId)
        );

    if (index >= 0) {

        favorites.splice(
            index,
            1
        );

    } else {

        favorites.push(game);

    }

    saveFavorites(favorites);

    renderFavorites();

    return index < 0;
}


/* ============================================================
   API
   ============================================================ */

async function apiFetch(url) {

    const response =
        await fetch(url, {
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

    const text =
        await response.text();

    if (!text) {
        throw new Error(
            "The backend returned an empty response."
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
            `Backend HTTP ${response.status}`
        );

    }

    if (data.success === false) {

        throw new Error(
            data.error ||
            "Roblox returned an error."
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
        "Loading top-playing Roblox games..."
    );

    showLoading(
        popularContainer,
        "Loading top-playing Roblox games..."
    );

    try {

        const data =
            await apiFetch(
                API.home
            );

        const popular =
            Array.isArray(data.popular)
                ? data.popular
                : [];

        const recommended =
            Array.isArray(data.recommended)
                ? data.recommended
                : [];

        renderGames(
            recommendedContainer,
            recommended,
            "No popular Roblox games were returned."
        );

        renderGames(
            popularContainer,
            popular,
            "No popular Roblox games were returned."
        );

        if (!popular.length) {

            showError(
                "Roblox returned no games from the Top Playing chart."
            );

        }

    } catch (error) {

        console.error(
            "[WebBlox]",
            error
        );

        recommendedContainer.innerHTML = "";
        popularContainer.innerHTML = "";

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

    container.innerHTML = "";

    if (
        !Array.isArray(games) ||
        games.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-card">
                ${escapeHTML(
                    emptyMessage
                )}
            </div>
        `;

        return;
    }

    games.forEach(game => {

        if (!game) return;

        container.appendChild(
            createGameCard(game)
        );

    });

}


/* ============================================================
   GAME CARD
   ============================================================ */

function createGameCard(game) {

    const card =
        document.createElement("article");

    card.className =
        "game-card";


    const imageWrap =
        document.createElement("div");

    imageWrap.className =
        "game-image-wrap";


    const image =
        document.createElement("img");

    image.className =
        "game-image";


    image.src =
        getGameImage(game);


    image.alt =
        game.name ||
        "Roblox game";


    image.loading =
        "lazy";


    image.onerror =
        function() {

            if (
                this.dataset.failed
            ) {
                return;
            }

            this.dataset.failed =
                "true";

            this.classList.add(
                "image-failed"
            );

        };


    const favorite =
        document.createElement("button");

    favorite.type =
        "button";

    favorite.className =
        "favorite-button";

    favorite.textContent =
        isFavorite(game)
            ? "★"
            : "☆";

    favorite.title =
        isFavorite(game)
            ? "Remove favorite"
            : "Add favorite";


    favorite.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const added =
                toggleFavorite(game);

            favorite.textContent =
                added
                    ? "★"
                    : "☆";

            favorite.title =
                added
                    ? "Remove favorite"
                    : "Add favorite";

        }
    );


    imageWrap.appendChild(
        image
    );

    imageWrap.appendChild(
        favorite
    );


    const body =
        document.createElement("div");

    body.className =
        "game-card-body";


    const title =
        document.createElement("h3");

    title.className =
        "game-title";

    title.textContent =
        game.name ||
        "Roblox Experience";


    const creator =
        document.createElement("p");

    creator.className =
        "game-creator";

    creator.textContent =
        "By " +
        (
            game.creator ||
            "Unknown Creator"
        );


    const stats =
        document.createElement("div");

    stats.className =
        "game-stats";


    const players =
        document.createElement("span");

    players.textContent =
        "👥 " +
        formatNumber(
            game.playing
        );


    const visits =
        document.createElement("span");

    visits.textContent =
        "▶ " +
        formatNumber(
            game.visits
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
        () => openGame(game)
    );


    return card;
}


/* ============================================================
   IMAGE
   ============================================================ */

function getGameImage(game) {

    return (
        game.thumbnail ||
        game.icon ||
        ""
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

    showDiscoverOnly();

    searchSection.classList.remove(
        "hidden"
    );

    searchContainer.innerHTML = `
        <div class="loading-card">
            <div class="spinner"></div>
            <span>Searching Roblox...</span>
        </div>
    `;

    searchStatus.textContent =
        `Searching Roblox for "${query}"...`;

    try {

        const data =
            await apiFetch(
                API.search +
                "?q=" +
                encodeURIComponent(query)
            );

        const games =
            Array.isArray(data.games)
                ? data.games
                : [];

        searchStatus.textContent =
            `${games.length} ${
                games.length === 1
                    ? "experience"
                    : "experiences"
            } found`;

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
   GAME MODAL
   ============================================================ */

function openGame(game) {

    const modal =
        document.getElementById(
            "gameModal"
        );

    document.getElementById(
        "modalTitle"
    ).textContent =
        game.name ||
        "Roblox Experience";


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
            game.playing
        );


    document.getElementById(
        "modalVisits"
    ).textContent =
        formatNumber(
            game.visits
        );


    document.getElementById(
        "modalFavorites"
    ).textContent =
        formatNumber(
            game.favorites
        );


    const image =
        document.getElementById(
            "modalImage"
        );

    image.src =
        getGameImage(game);


    image.alt =
        game.name ||
        "Roblox Experience";


    document.getElementById(
        "playButton"
    ).onclick =
        () => {

            if (!game.placeId) {

                alert(
                    "This Roblox experience does not have a place ID."
                );

                return;

            }

            window.open(
                `https://www.roblox.com/games/${game.placeId}`,
                "_blank",
                "noopener,noreferrer"
            );

        };


    const favoriteButton =
        document.getElementById(
            "favoriteModalButton"
        );


    function updateFavoriteButton() {

        const favorite =
            isFavorite(game);

        favoriteButton.textContent =
            favorite
                ? "★ Favorited"
                : "☆ Favorite";

    }


    updateFavoriteButton();


    favoriteButton.onclick =
        () => {

            toggleFavorite(game);

            updateFavoriteButton();

        };


    modal.classList.remove(
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

    document.getElementById(
        "gameModal"
    ).classList.add(
        "hidden"
    );

    document.body.classList.remove(
        "modal-open"
    );

}


/* ============================================================
   FAVORITES PAGE
   ============================================================ */

function renderFavorites() {

    const favorites =
        getFavorites();

    if (!favorites.length) {

        favoritesContainer.innerHTML = `
            <div class="empty-card">
                You haven't favorited any games yet.
            </div>
        `;

        return;

    }

    renderGames(
        favoritesContainer,
        favorites,
        "No favorites yet."
    );

}


function showFavorites() {

    setActiveNav(1);

    searchSection.classList.add(
        "hidden"
    );

    discoverSection.classList.add(
        "hidden"
    );

    popularSection.classList.add(
        "hidden"
    );

    favoritesSection.classList.remove(
        "hidden"
    );

    renderFavorites();

    favoritesSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


function showDiscover() {

    setActiveNav(0);

    favoritesSection.classList.add(
        "hidden"
    );

    discoverSection.classList.remove(
        "hidden"
    );

    popularSection.classList.remove(
        "hidden"
    );

}


function showDiscoverOnly() {

    setActiveNav(0);

    favoritesSection.classList.add(
        "hidden"
    );

    discoverSection.classList.remove(
        "hidden"
    );

    popularSection.classList.remove(
        "hidden"
    );

}


/* ============================================================
   NAV
   ============================================================ */

function setActiveNav(index) {

    document
        .querySelectorAll(".nav-btn")
        .forEach(
            (button, i) => {

                button.classList.toggle(
                    "active",
                    i === index
                );

            }
        );

}


/* ============================================================
   SEARCH CLEAR
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
        "Roblox could not be reached.";

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
                ${escapeHTML(message)}
            </span>
        </div>
    `;

}


/* ============================================================
   NUMBER FORMAT
   ============================================================ */

function formatNumber(value) {

    const number =
        Number(value) || 0;

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

    document
        .getElementById(
            "discoverSection"
        )
        .scrollIntoView({
            behavior: "smooth"
        });

}


function scrollToPopular() {

    popularSection.scrollIntoView({
        behavior: "smooth"
    });

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
    event => {

        if (
            event.key === "Enter"
        ) {

            searchGames();

        }

    }
);


document.addEventListener(
    "keydown",
    event => {

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
    "[WebBlox] Frontend:",
    window.location.href
);

console.log(
    "[WebBlox] Backend:",
    API_BASE
);

console.log(
    "[WebBlox] Using Roblox Top Playing chart."
);

loadHome();
